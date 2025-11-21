import { DAY_KEYS, SCHEDULE_RULES } from "../../../data/data.js";

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

        // Sort chronologically
        slots.sort((a, b) => a.from - b.from);

        // NEW: resolve each slot to actual location/place
        this._resolveSlots(npc, slots);

        return {
            npcId,
            startDate: new Date(weekStartDate.getTime()),
            endDate: new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000),
            slots,
        };
    }

    _applyDailyHomeBlock(out, npcId, rule, dayDate) {
        const blocks = rule.timeBlocks || [];
        for (const b of blocks) {
            const fromMin = parseTimeToMinutes(b.from);
            const toMin = parseTimeToMinutes(b.to);
            out.push({
                npcId,
                from: makeDateAtMinutes(dayDate, fromMin),
                to: makeDateAtMinutes(dayDate, toMin),
                target: {
                    type: TargetTypes.home,
                    spec: { type: TargetTypes.home },
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

        let cursor = parseTimeToMinutes(window.from);
        const endWindow = parseTimeToMinutes(window.to);

        while (cursor < endWindow) {
            const duration = Math.ceil(minStay + (this.rnd() * (maxStay - minStay + 1)) / 5) * 5;
            const slotEnd = Math.min(cursor + duration, endWindow);

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
        let lastLocationId = npc.locationId || npc.homeLocationId || this._pickAnyLocationId();

        for (const slot of slots) {
            const atTime = slot.from;

            if (slot.target.type === TargetTypes.home) {
                const locId = npc.homeLocationId || lastLocationId;
                const placeId = npc.homePlaceId || null;
                slot.target.locationId = locId;
                slot.target.placeId = placeId;
                lastLocationId = locId;
                continue;
            }

            if (slot.target.type === TargetTypes.activity) {
                const { spec } = slot.target;
                const origin = lastLocationId || npc.locationId || npc.homeLocationId;

                const resolved = this._resolveActivityTarget(spec || {}, origin, atTime);

                if (resolved) {
                    slot.target.locationId = resolved.locationId;
                    slot.target.placeId = resolved.placeId;
                    lastLocationId = resolved.locationId;
                } else {
                    // fallback: stay where you are
                    slot.target.locationId = origin;
                    slot.target.placeId = null;
                }
            }
        }
    }

    _pickAnyLocationId() {
        const ids = [...this.world.locations.keys()];
        return ids.length ? ids[0] : null;
    }

    _resolveActivityTarget(spec, originLocationId, atTime) {
        const type = spec.type || "placeCategory";

        // opening-hours behavior: targetSpec can override, else rule-level, else false
        const respectOpening = spec.respectOpeningHours ?? spec.respect_hours ?? false;

        const useNearest = !!spec.nearest;
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
            return this._findNearestPlace(matcher, originLocationId, atTime, respectOpening);
        } else {
            return this._findRandomPlace(matcher, originLocationId, atTime, respectOpening);
        }

        // future extension: locationTag, district, etc.
        return null;
    }

    _distanceBetweenLocations(aId, bId) {
        if (!aId || !bId) return Infinity;
        if (aId === bId) return 0;

        return this.world.map.getTravelMinutes(aId, bId);
    }

    _findNearestPlace(matchFn, originLocationId, atTime, respectOpening) {
        let best = null;
        let bestDist = Infinity;

        for (const loc of this.world.locations.values()) {
            const places = loc.places || [];
            for (const place of places) {
                if (!matchFn(place)) continue;

                if (respectOpening && typeof place.isOpen === "function") {
                    if (!place.isOpen(atTime)) continue;
                }

                const d = this._distanceBetweenLocations(originLocationId, loc.id);
                if (d < bestDist) {
                    bestDist = d;
                    best = {
                        locationId: loc.id,
                        placeId: place.id,
                    };
                }
            }
        }

        return best;
    }

    _findRandomPlace(matchFn, originLocationId, atTime, respectOpening) {
        const candidates = [];

        for (const loc of this.world.locations.values()) {
            const places = loc.places || [];
            for (const place of places) {
                if (!matchFn(place)) continue;

                if (respectOpening && typeof place.isOpen === "function") {
                    if (!place.isOpen(atTime)) continue;
                }

                const minutes = this._distanceBetweenLocations(originLocationId, loc.id);
                if (!Number.isFinite(minutes) || minutes === Infinity) continue;

                // Weight function: closer = a bit more likely.
                // You can tweak these constants.
                const weight = 1 / (1 + 0.2 * minutes); // 0 min -> 1, 10 min -> ~0.33, 30 min -> ~0.14

                candidates.push({ locationId: loc.id, placeId: place.id, weight });
            }
        }

        if (!candidates.length) return null;

        // Weighted random pick
        let total = 0;
        for (const c of candidates) total += c.weight;

        let r = this.rnd() * total;
        for (const c of candidates) {
            r -= c.weight;
            if (r <= 0) {
                return { locationId: c.locationId, placeId: c.placeId };
            }
        }

        // Fallback (floating point edge case)
        const last = candidates[candidates.length - 1];
        return { locationId: last.locationId, placeId: last.placeId };
    }
}

const TargetTypes = {
    home: "home",
    activity: "activity",
};
