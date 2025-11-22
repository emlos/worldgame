import { DAY_KEYS, PLACE_REGISTRY, SCHEDULE_RULES, WeatherType } from "../../../data/data.js";

/**
 * Helpers
 */
function parseTimeToMinutes(timeStr) {
    // "HH:MM" -> minutes since midnight
    const [h, m] = timeStr.split(":").map((n) => parseInt(n, 10) || 0);
    return h * 60 + m;
}

function makeDateAtMinutes(baseDate, minutes) {
    const d = new Date(baseDate.getTime());
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    d.setHours(h, m, 0, 0);
    return d;
}

// get "mon" | "tue" ... from a Date
function dayKeyFromDate(date) {
    const dow = date.getDay(); // 0=Sun..6=Sat
    return DAY_KEYS[dow]; // ["sun","mon"...]
}

const TIME_JITTER_MIN = 0; // minutes
const TIME_JITTER_MAX = 20; // minutes

function randomJitterMinutes(rnd) {
    const span = TIME_JITTER_MAX - TIME_JITTER_MIN;
    // integer in [TIME_JITTER_MIN, TIME_JITTER_MAX]
    return Math.ceil((TIME_JITTER_MIN + Math.floor(rnd() * (span + 1))) / 5) * 5;
}

/**
 * ScheduleManager:
 *  - Uses NPC meta.scheduleTemplate.rules
 *  - Generates one week (Mon–Sun) of concrete schedule slots.
 */
export class NPCScheduler {
    constructor({ world, rnd }) {
        this.world = world;
        this.rnd = rnd || Math.random;
        // cache: npcId -> weekKey -> { startDate, endDate, slots[] }
        this.cache = new Map();
    }

    _getWeekKey(startDate) {
        return startDate.toISOString().slice(0, 10); // "YYYY-MM-DD"
    }

    /**
     * Compute "week start" (Monday 00:00) for any given Date.
     */
    getWeekStartForDate(date) {
        const d = new Date(date.getTime());
        const dow = d.getDay(); // 0=Sun..6=Sat
        const diffToMon = (dow + 6) % 7; // 0->6,1->0,...6->5
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - diffToMon);
        return d;
    }

    /**
     * Ensure we have a schedule for this NPC and week.
     * weekStartDate should be Monday 00:00.
     */
    getWeekSchedule(npc, weekStartDate) {
        const npcKey = String(npc.id);
        const weekKey = this._getWeekKey(weekStartDate);

        let perNpc = this.cache.get(npcKey);
        if (!perNpc) {
            perNpc = new Map();
            this.cache.set(npcKey, perNpc);
        }

        let week = perNpc.get(weekKey);
        if (!week) {
            week = this._generateWeekSchedule(npc, weekStartDate);
            perNpc.set(weekKey, week);
        }

        return week;
    }

    /**
     * Convenience: schedule for the week containing the world's current time.
     */
    getCurrentWeekSchedule(npc) {
        const weekStart = this.getWeekStartForDate(this.world.time.date);
        return this.getWeekSchedule(npc, weekStart);
    }

    /**
     * peek(nextMinutes):
     *   Does this NPC intend to change location within the horizon?
     *
     * Returns:
     *   {
     *     willMove: boolean,
     *     at: Date | null,
     *     nextSlot: slot | null,
     *   }
     */
    peek(npc, nextMinutes, fromDate = this.world.time.date) {
        const weekStart = this.getWeekStartForDate(fromDate);
        const week = this.getWeekSchedule(npc, weekStart);

        const horizon = new Date(fromDate.getTime() + nextMinutes * 60 * 1000);

        let candidate = null;
        for (const slot of week.slots) {
            if (slot.from <= fromDate) continue;
            if (slot.from > horizon) continue;

            if (!candidate || slot.from < candidate.from) {
                candidate = slot;
            }
        }

        if (!candidate) {
            return { willMove: false, at: null, nextSlot: null };
        }

        return {
            willMove: true,
            at: candidate.from,
            nextSlot: candidate,
        };
    }

    // ------------------------------------------------------------------
    // Generation
    // ------------------------------------------------------------------

    _generateWeekSchedule(npc, weekStartDate) {
        const template = npc.meta?.scheduleTemplate;
        const rules = template?.rules || [];
        const npcId = String(npc.id);

        // Pick nightlife day once per week (if any weekly_once rule exists)
        const weeklyOnceConfigs = rules.filter((r) => r.type === SCHEDULE_RULES.weekly);
        const weeklyOnceAssignments = new Map(); // ruleId -> dayKey

        for (const rule of weeklyOnceConfigs) {
            const candidates = rule.candidateDays || [];
            if (!candidates.length) continue;
            const pickIdx = (this.rnd() * candidates.length) | 0;
            weeklyOnceAssignments.set(rule.id, candidates[pickIdx]);
        }

        const slots = [];

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(weekStartDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dayKey = dayKeyFromDate(dayDate);

            const { kind } = this.world.calendar.getDayInfo(dayDate); // DayKind.WORKDAY | DAY_OFF

            for (const rule of rules) {
                switch (rule.type) {
                    case SCHEDULE_RULES.home:
                        this._applyDailyHomeBlock(slots, npcId, rule, dayDate);
                        break;
                    case SCHEDULE_RULES.fixed:
                        this._applyFixedActivity(slots, npcId, rule, dayDate, dayKey, kind);
                        break;
                    case SCHEDULE_RULES.random:
                        this._applyRandomVisits(slots, npcId, rule, dayDate, dayKey, kind);
                        break;
                    case SCHEDULE_RULES.weekly:
                        this._applyWeeklyOnce(
                            slots,
                            npcId,
                            rule,
                            dayDate,
                            dayKey,
                            weeklyOnceAssignments
                        );
                        break;
                }
            }
        }

        // First: apply rule priority and trim overlaps
        const timeResolved = this._applyPriorityAndTrim(slots, rules);

        // Resolve each slot to actual location/place
        this._resolveSlots(npc, timeResolved);

        // Insert travel segments between slots where the location changes
        const withTravel = this._insertTravelSlots(npc, timeResolved);

        return {
            npcId,
            startDate: new Date(weekStartDate.getTime()),
            endDate: new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000),
            slots: withTravel,
        };
    }

    _applyDailyHomeBlock(out, npcId, rule, dayDate) {
        const blocks = rule.timeBlocks || [];
        for (const b of blocks) {
            let fromMin = parseTimeToMinutes(b.from);
            let toMin = parseTimeToMinutes(b.to);

            const noJitter = b.noJitter;

            if (!noJitter) {
                const startShift = randomJitterMinutes(this.rnd);
                const endShift = randomJitterMinutes(this.rnd);

                fromMin += this.rnd() < 0.5 ? -startShift : startShift;
                toMin += this.rnd() < 0.5 ? -endShift : endShift;

                const dayEnd = 24 * 60;
                fromMin = Math.max(0, Math.min(fromMin, dayEnd));
                toMin = Math.max(0, Math.min(toMin, dayEnd));

                if (toMin <= fromMin) {
                    toMin = Math.min(dayEnd, fromMin + 15);
                }
            }

            out.push({
                npcId,
                from: makeDateAtMinutes(dayDate, fromMin),
                to: makeDateAtMinutes(dayDate, toMin),
                target: {
                    type: TargetTypes.activity, // <<-- changed
                    spec: { type: "home" }, // <<-- changed
                },
                sourceRuleId: rule.id,
            });
        }
    }

    _dayKindMatches(rule, dayKind) {
        if (!rule.dayKinds || !rule.dayKinds.length) return true;
        return rule.dayKinds.includes(dayKind);
    }

    _dayOfWeekMatches(rule, dayKey) {
        if (!rule.daysOfWeek || !rule.daysOfWeek.length) return true;
        return rule.daysOfWeek.includes(dayKey);
    }

    _applyFixedActivity(out, npcId, rule, dayDate, dayKey, dayKind) {
        if (!this._dayKindMatches(rule, dayKind)) return;
        if (!this._dayOfWeekMatches(rule, dayKey)) return;

        const fromMin = parseTimeToMinutes(rule.time.from);
        const toMin = parseTimeToMinutes(rule.time.to);

        out.push({
            npcId,
            from: makeDateAtMinutes(dayDate, fromMin),
            to: makeDateAtMinutes(dayDate, toMin),
            target: {
                type: TargetTypes.activity,
                spec: rule.target, // e.g. { type:"placeCategory", categories:[...] }
            },
            sourceRuleId: rule.id,
        });
    }

    _applyRandomVisits(out, npcId, rule, dayDate, dayKey, dayKind) {
        if (!this._dayKindMatches(rule, dayKind)) return;
        if (!this._dayOfWeekMatches(rule, dayKey)) return;

        const window = rule.window;
        if (!window) return;

        const targets = rule.targets || [];
        if (!targets.length) return;

        const minStay = rule.stayMinutes?.min ?? 30;
        const maxStay = rule.stayMinutes?.max ?? 60;

        const windowStart = parseTimeToMinutes(window.from);
        const windowEnd = parseTimeToMinutes(window.to);

        // --- JITTER HERE ---
        // Delay leaving the previous state by +5–15 minutes
        const startJitter = randomJitterMinutes(this.rnd);
        // End a bit earlier than the formal window, by 5–15 minutes
        const endJitter = randomJitterMinutes(this.rnd);

        // effective start & end for this rule's actual visits
        let cursor = windowStart + startJitter;
        let effectiveEnd = windowEnd - endJitter;

        // Ensure we still have room for at least one minStay block
        if (effectiveEnd - cursor < minStay) {
            // fallback: collapse jitter so we can fit minStay
            cursor = windowStart;
            effectiveEnd = windowEnd;
        }

        while (cursor < effectiveEnd) {
            const duration = Math.ceil(minStay + (this.rnd() * (maxStay - minStay + 1)) / 5) * 5;

            const slotEnd = Math.min(cursor + duration, effectiveEnd);

            const tIdx = (this.rnd() * targets.length) | 0;
            const targetSpec = targets[tIdx];

            out.push({
                npcId,
                from: makeDateAtMinutes(dayDate, cursor),
                to: makeDateAtMinutes(dayDate, slotEnd),
                target: {
                    type: TargetTypes.activity,
                    spec: targetSpec,
                },
                sourceRuleId: rule.id,
            });

            cursor = slotEnd;
        }
    }

    _applyWeeklyOnce(out, npcId, rule, dayDate, dayKey, assignments) {
        const chosenDayKey = assignments.get(rule.id);
        if (!chosenDayKey || chosenDayKey !== dayKey) return;

        const window = rule.time;
        if (!window) return;

        const minStay = rule.stayMinutes?.min ?? 30;
        const maxStay = rule.stayMinutes?.max ?? 120;

        const windowStart = parseTimeToMinutes(window.from);
        const windowEnd = parseTimeToMinutes(window.to);

        // Choose a random duration, rounded to 5 minutes
        const durRaw = minStay + this.rnd() * (maxStay - minStay);
        const duration = Math.max(5, Math.round(durRaw / 5) * 5);

        // Latest possible start so we still end before windowEnd
        const latestStart = Math.max(windowStart, windowEnd - duration);
        const start =
            windowStart + Math.floor(this.rnd() * ((latestStart - windowStart) / 5 + 1)) * 5;
        const end = Math.min(start + duration, windowEnd);

        out.push({
            npcId,
            from: makeDateAtMinutes(dayDate, start),
            to: makeDateAtMinutes(dayDate, end),
            target: {
                type: TargetTypes.activity,
                spec: rule.target,
            },
            sourceRuleId: rule.id,
        });
    }

    // ------------------------------------------------------------------
    // Resolver: fill in locationId / placeId
    // ------------------------------------------------------------------

    _resolveSlots(npc, slots) {
        if (!slots.length) return;

        let lastLocationId = npc.locationId || npc.homeLocationId || this._pickAnyLocationId();

        // Assume they started the day at lastLocationId at the start of the first slot
        let locationStreakStartTime = new Date(slots[0].from.getTime());

        for (const slot of slots) {
            const atTime = slot.from;

            if (slot.target.type !== TargetTypes.activity) {
                // for non-activity targets, just keep locationStreakStartTime logic
                slot.target.locationId = lastLocationId;
                slot.target.placeId = null;
                continue;
            }

            const { spec } = slot.target;
            const origin = lastLocationId || npc.locationId || npc.homeLocationId;

            const minutesAtOrigin = (atTime.getTime() - locationStreakStartTime.getTime()) / 60000;

            const resolved = this._resolveActivityTarget(
                spec || {},
                origin,
                atTime,
                minutesAtOrigin,
                npc
            );

            const targetLocationId = resolved?.locationId || origin;
            const targetPlaceId = resolved?.placeId || null;

            slot.target.locationId = targetLocationId;
            slot.target.placeId = targetPlaceId;

            if (targetLocationId !== lastLocationId) {
                // new location: reset streak start
                locationStreakStartTime = new Date(atTime.getTime());
                lastLocationId = targetLocationId;
            }
        }
    }

    /**
     * Ensure there are no gaps between slots within the same day.
     *
     * Policy:
     *  - If there is a gap between A and B on the same calendar day:
     *      * If B is a "home" spec -> fill the gap with a short "home" slot
     *        (effectively: go home early).
     *      * Otherwise -> extend A to cover the gap
     *        (effectively: stay longer at the previous activity).
     *
     *  This guarantees every minute between the first and last slot
     *  of a day is accounted for.
     */
    _fillGaps(slots) {
        if (!slots.length) return [];

        const sameDay = (a, b) =>
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();

        const result = [];

        for (let i = 0; i < slots.length; i++) {
            // clone so we don't mutate the original array in weird ways
            const current = { ...slots[i] };
            result.push(current);

            const next = slots[i + 1];
            if (!next) continue;

            const gapStart = current.to;
            const gapEnd = next.from;

            // no gap or negative gap (overlap) -> nothing to do
            if (!gapStart || !gapEnd) continue;
            if (gapEnd <= gapStart) continue;

            // only fill gaps that are within the same calendar day
            if (!sameDay(gapStart, gapEnd)) continue;

            const nextSpec = (next.target && next.target.spec) || {};
            const nextIsHome = nextSpec.type === "home";

            if (nextIsHome) {
                // Option 1: go home early.
                // We add an extra "home" segment from gapStart to gapEnd.
                result.push({
                    ...next,
                    from: new Date(gapStart.getTime()),
                    to: new Date(gapEnd.getTime()),
                });
            } else {
                // Option 2: stay longer at the previous activity.
                current.to = new Date(gapEnd.getTime());
            }
        }

        return result;
    }

    /**
     * Build travel segments between two slots.
     * Returns array of segments, or null on failure.
     */
    _buildTravelSegmentsBetween(originLocId, destLocId, fromSlot, toSlot) {
        const arrivalTime = toSlot.from;
        const windowStart = fromSlot.from;

        const plan = this._planTravelPath(originLocId, destLocId, arrivalTime);
        if (!plan || !plan.steps || !plan.steps.length) return null;

        const availableMinutes = (arrivalTime.getTime() - windowStart.getTime()) / 60000;
        if (availableMinutes <= 0) return null;

        let totalTravel = plan.totalMinutes;
        if (totalTravel <= 0) return null;

        // If we don't have enough time, compress proportionally into the window
        let scale = 1;
        if (totalTravel > availableMinutes) {
            scale = availableMinutes / totalTravel;
        }

        const scaledDurations = [];
        let sumMinutes = 0;
        for (let i = 0; i < plan.steps.length; i++) {
            const raw = plan.steps[i].minutes * scale;
            const clamped = Math.max(1, Math.round(raw));
            scaledDurations.push(clamped);
            sumMinutes += clamped;
        }

        const availRounded = Math.max(1, Math.round(availableMinutes));
        if (sumMinutes !== availRounded && scaledDurations.length) {
            // adjust last step so total matches window
            scaledDurations[scaledDurations.length - 1] += availRounded - sumMinutes;
            sumMinutes = availRounded;
        }

        const travelMinutes = sumMinutes;
        const travelStartMs = arrivalTime.getTime() - travelMinutes * 60000;
        const travelStart = new Date(Math.max(travelStartMs, windowStart.getTime()));

        const segments = [];
        let cursor = travelStart.getTime();

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const mins = scaledDurations[i];
            if (mins <= 0) continue;

            const from = new Date(cursor);
            const to = new Date(cursor + mins * 60000);
            cursor = to.getTime();

            // NPC "is at" the location they’re heading into for this step
            const locIdForStep = step.toId || step.fromId || originLocId;

            segments.push({
                npcId: fromSlot.npcId,
                from,
                to,
                target: {
                    type: TargetTypes.travel,
                    spec: {
                        mode: step.mode, // "walk" | "wait" | "bus"
                        isEnRoute: true, // cannot chat
                        onBus: step.mode === "bus",
                        fromLocationId: step.fromId,
                        toLocationId: step.toId,
                    },
                    locationId: locIdForStep,
                    placeId: null,
                },
                sourceRuleId: "travel_auto",
            });
        }

        return segments;
    }

    _insertTravelSlots(npc, slots) {
        if (!slots || !slots.length) return [];

        // Make a shallow copy we can mutate safely
        const base = slots.slice();
        const out = [];

        for (let i = 0; i < base.length; i++) {
            const current = base[i];
            const next = base[i + 1] || null;

            out.push(current);

            if (!next) break;

            const curTarget = current.target || {};
            const nextTarget = next.target || {};

            const curLoc = curTarget.locationId;
            const nextLoc = nextTarget.locationId;

            // Only insert travel when we actually move between locations
            if (!curLoc || !nextLoc || curLoc === nextLoc) continue;

            // Don't insert travel *after* a travel slot
            if (curTarget.type === TargetTypes.travel) continue;

            const travelSegments = this._buildTravelSegmentsBetween(curLoc, nextLoc, current, next);

            if (!travelSegments || !travelSegments.length) continue;

            // Adjust the end time of the current slot so travel fits before next
            const firstSeg = travelSegments[0];
            if (firstSeg.from > current.from && firstSeg.from < current.to) {
                current.to = new Date(firstSeg.from.getTime());
            }

            // Insert in chronological order
            for (const seg of travelSegments) {
                out.push(seg);
            }
        }

        // Keep everything time-sorted
        out.sort((a, b) => a.from - b.from);

        return out;
    }

    /**
     * Take the raw slots (with overlaps) and:
     *  - apply rule priority so higher-priority slots "win"
     *  - cut lower-priority slots around higher-priority ones
     *  - optionally smooth tiny fragments that are shorter than stayMinutes.min
     */
    _applyPriorityAndTrim(slots, rules) {
        if (!slots.length) return [];

        // Map ruleId -> rule
        const ruleById = new Map();
        for (const rule of rules) {
            if (!rule.id) continue;
            ruleById.set(rule.id, rule);
        }

        // Annotate slots with priority + minStay
        const annotated = slots.map((slot) => {
            const rule = ruleById.get(slot.sourceRuleId);
            const type = rule?.type;
            const priority = RULE_PRIORITY[type] ?? 0;

            // minStay is only defined for rules that use stayMinutes
            const minStay =
                rule?.stayMinutes && typeof rule.stayMinutes.min === "number"
                    ? rule.stayMinutes.min
                    : 0;

            return {
                ...slot,
                _priority: priority,
                _minStay: minStay,
            };
        });

        // Sort by priority DESC, then by start time ASC
        annotated.sort((a, b) => {
            if (b._priority !== a._priority) return b._priority - a._priority;
            if (a.from.getTime() !== b.from.getTime()) {
                return a.from - b.from;
            }
            return a.to - b.to;
        });

        const result = [];

        // Helper: subtract existing (higher-priority) blocks from a candidate slot
        const subtractCoveredRanges = (slot, blockers) => {
            let segments = [{ start: slot.from.getTime(), end: slot.to.getTime() }];

            for (const b of blockers) {
                const bs = b.from.getTime();
                const be = b.to.getTime();

                const nextSegments = [];
                for (const seg of segments) {
                    const s = seg.start;
                    const e = seg.end;

                    // no overlap
                    if (be <= s || bs >= e) {
                        nextSegments.push(seg);
                        continue;
                    }

                    // overlap: keep left piece, right piece, or both
                    if (bs > s) {
                        nextSegments.push({ start: s, end: bs });
                    }
                    if (be < e) {
                        nextSegments.push({ start: be, end: e });
                    }
                }

                segments = nextSegments;
                if (!segments.length) break;
            }

            return segments.map((seg) => ({
                ...slot,
                from: new Date(seg.start),
                to: new Date(seg.end),
            }));
        };

        // Main pass: apply higher-priority slots first,
        // and cut lower-priority ones around them.
        for (const slot of annotated) {
            const leftovers = subtractCoveredRanges(slot, result);
            for (const s of leftovers) {
                if (s.to > s.from) {
                    result.push(s);
                }
            }
        }

        // Sort chronologically for further passes and final output
        result.sort((a, b) => a.from - b.from);

        // Second pass: smooth tiny segments shorter than stayMinutes.min
        // Example: 22:00–22:05 "home" when minStay is 30 minutes -> merge into previous slot.
        for (let i = 0; i < result.length; i++) {
            const slot = result[i];
            const minStay = slot._minStay || 0;
            if (!minStay) continue;

            const durationMin = (slot.to.getTime() - slot.from.getTime()) / 60000;
            if (durationMin >= minStay) continue;

            const prev = result[i - 1];
            const next = result[i + 1];

            // Prefer extending the previous slot if it's directly adjacent
            if (prev && prev.to.getTime() === slot.from.getTime()) {
                prev.to = slot.to;
                result.splice(i, 1);
                i -= 1;
                continue;
            }

            // Otherwise, extend the next slot if it's directly adjacent
            if (next && next.from.getTime() === slot.to.getTime()) {
                next.from = slot.from;
                result.splice(i, 1);
                i -= 1;
                continue;
            }

            // If it's an isolated tiny slot, you can either keep it or drop it.
            // For now we'll keep it; you could choose to drop it instead:
            // result.splice(i, 1); i -= 1;
        }

        // Clean up temp fields
        for (const s of result) {
            delete s._priority;
            delete s._minStay;
        }

        return result;
    }

    _pickAnyLocationId() {
        const ids = [...this.world.locations.keys()];
        return ids.length ? ids[0] : null;
    }

    _resolveActivityTarget(spec, originLocationId, atTime, minutesAtOrigin = 0, npc) {
        const type = spec.type;
        const respectOpening = !!spec.respectOpeningHours;
        const useNearest = !!spec.nearest;

        if (type === "home") {
            const homeLocationId = npc.homeLocationId || originLocationId;
            return { locationId: homeLocationId, placeId: null };
        }

        let matcher = null;

        if (type === "placeKey") {
            matcher = (place) => place.key === spec.key;
        }

        if (type === "placeCategory") {
            const catsRaw = spec.categories || spec.category || [];
            const cats = Array.isArray(catsRaw) ? catsRaw : [catsRaw];

            matcher = (place) => {
                const cat = place.props && place.props.category;
                const placeCats = Array.isArray(cat) ? cat : cat ? [cat] : [];
                return placeCats.some((c) => cats.includes(c));
            };
        }

        if (!matcher) throw new Error(`Unknown activity target type: ${type}`);

        if (useNearest) {
            return this.world.map.findNearestPlace(
                matcher,
                originLocationId,
                atTime,
                respectOpening
            );
        } else {
            return this.world.map.findRandomPlace(
                matcher,
                originLocationId,
                atTime,
                respectOpening,
                minutesAtOrigin
            );
        }

        // future extension: locationTag, district, etc.
        return null;
    }

    // --------- pathfinding via bus stops ---------

    _findNearestBusStopLocation(originLocationId) {
        const matchFn = (place) => place.key === "bus_stop";
        const atTime = this.world.time.date;
        const best = this.world.map.findNearestPlace(matchFn, originLocationId, atTime, false);
        return best ? best.locationId : null;
    }

    _getBusStopConfig() {
        const place = PLACE_REGISTRY.find((p) => p.key === "bus_stop");

        if (place) {
            const props = place.props;
            return {
                travelTimeMult: props.travelTimeMult,
                busFrequencyDay: props.busFrequencyDay,
                busFrequencyNight: props.busFrequencyNight,
            };
        }

        // Fallback defaults if none found
        return {
            travelTimeMult: 0.3,
            busFrequencyDay: 15,
            busFrequencyNight: 35,
        };
    }

    _planTravelPath(originLocId, destLocId, arrivalTime) {
        const basePath = this.world.map.getTravelTotal(originLocId, destLocId);
        if (!basePath || !basePath.edges.length) return null;

        const baseEdges = basePath.edges;
        const baseMinutes = basePath.minutes;

        const baseSteps = baseEdges.map((edge) => ({
            mode: "walk",
            fromId: String(edge.a),
            toId: String(edge.b),
            minutes: edge.minutes || 1,
        }));

        // --- Conditions for preferring bus ---
        const weather = this.world.currentWeather; // "rain","storm","snow",...
        const temperature = this.world.temperature; // °C
        const cold = temperature < 0;
        const badWeather =
            weather === WeatherType.RAIN ||
            weather === WeatherType.STORM ||
            weather === WeatherType.SNOW;

        const tooFar = baseMinutes > 25 || baseEdges.length > 5;

        // If none of the conditions hit, just walk
        if (!tooFar && !badWeather && !cold) {
            return { steps: baseSteps, totalMinutes: baseMinutes };
        }

        // Try to plan a bus route
        const busCfg = this._getBusStopConfig();
        const originBusLoc = this._findNearestBusStopLocation(originLocId);
        const destBusLoc = this._findNearestBusStopLocation(destLocId);

        if (!originBusLoc || !destBusLoc) {
            // No bus stops reachable, fallback to walking
            return { steps: baseSteps, totalMinutes: baseMinutes };
        }

        const toBus = this.world.map.getTravelTotal(originLocId, originBusLoc);
        const busPath = this.world.map.getTravelTotal(originBusLoc, destBusLoc);
        const fromBus = this.world.map.getTravelTotal(destBusLoc, destLocId);

        if (!toBus || !busPath || !fromBus) {
            return { steps: baseSteps, totalMinutes: baseMinutes };
        }

        const tWalkToBus = toBus.minutes;
        const tBusRaw = busPath.minutes;
        const tWalkFromBus = fromBus.minutes;

        const d = arrivalTime || this.world.time.date;
        const hour = d.getHours();
        const isDay = hour >= 6 && hour < 22;
        const freq = isDay ? busCfg.busFrequencyDay : busCfg.busFrequencyNight;
        const avgWait = freq > 0 ? freq * 0.5 : 0; // simple expectation

        const totalBusMinutes =
            tWalkToBus + tWalkFromBus + tBusRaw * busCfg.travelTimeMult + avgWait;

        // If bus would actually be slower *and* we're not forced by conditions, walk
        if (!tooFar && !badWeather && !cold && totalBusMinutes >= baseMinutes) {
            return { steps: baseSteps, totalMinutes: baseMinutes };
        }

        // Build step list: walk -> wait -> bus -> walk
        const steps = [];

        // walk to bus stop
        for (const edge of toBus.edges) {
            steps.push({
                mode: "walk",
                fromId: String(edge.a),
                toId: String(edge.b),
                minutes: edge.minutes || 1,
            });
        }

        // wait at bus stop
        if (avgWait > 0) {
            steps.push({
                mode: "wait",
                fromId: String(originBusLoc),
                toId: String(originBusLoc),
                minutes: avgWait,
            });
        }

        // bus ride
        for (const edge of busPath.edges) {
            const scaled = (edge.minutes || 1) * busCfg.travelTimeMult;
            steps.push({
                mode: "bus",
                fromId: String(edge.a),
                toId: String(edge.b),
                minutes: scaled,
            });
        }

        // walk from bus stop to destination
        for (const edge of fromBus.edges) {
            steps.push({
                mode: "walk",
                fromId: String(edge.a),
                toId: String(edge.b),
                minutes: edge.minutes || 1,
            });
        }

        const total = steps.reduce((s, st) => s + st.minutes, 0);

        return { steps, totalMinutes: total };
    }
}

const TargetTypes = {
    home: "home",
    activity: "activity",
    travel: "travel",
};
