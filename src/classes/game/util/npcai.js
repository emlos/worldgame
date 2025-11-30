import { DAY_KEYS, PLACE_REGISTRY, SCHEDULE_RULES, WeatherType } from "../../../data/data.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function parseTimeToMinutes(timeStr) {
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

function dayKeyFromDate(date) {
    const dow = date.getDay(); // 0=Sun..6=Sat
    return DAY_KEYS[dow];
}

const TIME_JITTER_MIN = 0;
const TIME_JITTER_MAX = 20;
const MICRO_STOP_MINUTES = 1;

function randomJitterMinutes(rnd) {
    const span = TIME_JITTER_MAX - TIME_JITTER_MIN;
    return Math.ceil((TIME_JITTER_MIN + Math.floor(rnd() * (span + 1))) / 5) * 5;
}

const TargetTypes = {
    home: "home",
    activity: "activity",
    travel: "travel",
};

// -----------------------------------------------------------------------------
// NPCScheduler
// -----------------------------------------------------------------------------

export class NPCScheduler {
    constructor({ world, rnd }) {
        this.world = world;
        this.rnd = rnd || Math.random;
        this.cache = new Map(); // npcId -> weekKey -> { startDate, endDate, slots[] }
    }

    _getWeekKey(startDate) {
        return startDate.toISOString().slice(0, 10);
    }

    getWeekStartForDate(date) {
        const d = new Date(date.getTime());
        const dow = d.getDay();
        const diffToMon = (dow + 6) % 7;
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - diffToMon);
        return d;
    }

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

    getCurrentWeekSchedule(npc) {
        const weekStart = this.getWeekStartForDate(this.world.time.date);
        return this.getWeekSchedule(npc, weekStart);
    }

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
    // Week generation pipeline
    // ------------------------------------------------------------------

    _generateWeekSchedule(npc, weekStartDate) {
        const template = npc.meta?.scheduleTemplate;
        const rules = template?.rules || [];
        const npcId = String(npc.id);

        const weeklyOnceAssignments = this._computeWeeklyAssignments(rules);

        const rawSlots = this._buildRuleSlotsForWeek({
            npcId,
            rules,
            weekStartDate,
            weeklyOnceAssignments,
        });

        const timeResolved = this._applyPriorityAndTrim(rawSlots, rules);
        const filled = this._fillGaps(timeResolved);

        this._resolveSlots(npc, filled);

        const withTravel = this._insertTravelSlots(npc, filled, rules);

        return {
            npcId,
            startDate: new Date(weekStartDate.getTime()),
            endDate: new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000),
            slots: withTravel,
        };
    }

    _computeWeeklyAssignments(rules) {
        const weeklyOnceConfigs = rules.filter((r) => r.type === SCHEDULE_RULES.weekly);
        const weeklyOnceAssignments = new Map();

        for (const rule of weeklyOnceConfigs) {
            const candidates = rule.candidateDays || [];
            if (!candidates.length) continue;
            const pickIdx = (this.rnd() * candidates.length) | 0;
            weeklyOnceAssignments.set(rule.id, candidates[pickIdx]);
        }

        return weeklyOnceAssignments;
    }

    _buildRuleSlotsForWeek({ npcId, rules, weekStartDate, weeklyOnceAssignments }) {
        const slots = [];

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(weekStartDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dayKey = dayKeyFromDate(dayDate);
            const { kind } = this.world.calendar.getDayInfo(dayDate);

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

        return slots;
    }

    // ------------------------------------------------------------------
    // Rule application
    // ------------------------------------------------------------------

    _applyDailyHomeBlock(out, npcId, rule, dayDate) {
        const blocks = rule.timeBlocks || [];

        for (const b of blocks) {
            let fromMin = parseTimeToMinutes(b.from);
            let toMin = parseTimeToMinutes(b.to);
            const origToMin = toMin;
            const origFromMin = fromMin;

            const noJitter = b.noJitter;

            if (!noJitter) {
                const startShift = randomJitterMinutes(this.rnd);
                const endShift = randomJitterMinutes(this.rnd);

                fromMin += this.rnd() < 0.5 ? -startShift : startShift;
                toMin += this.rnd() < 0.5 ? -endShift : endShift;

                fromMin = Math.max(origFromMin, Math.min(fromMin, origToMin));
                toMin = Math.max(origFromMin, Math.min(toMin, origToMin));

                if (toMin <= fromMin) {
                    toMin = Math.min(origToMin, fromMin + 15);
                }
            }

            const dayEnd = 24 * 60;
            const dayStart = 0;

            if (origToMin >= dayEnd) {
                toMin = dayEnd;
            }
            if (origFromMin <= dayStart) {
                fromMin = dayStart;
            }

            out.push({
                npcId,
                from: makeDateAtMinutes(dayDate, fromMin),
                to: makeDateAtMinutes(dayDate, toMin),
                target: {
                    type: TargetTypes.activity,
                    spec: { type: "home" },
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
                spec: rule.target,
            },
            sourceRuleId: rule.id,
        });
    }

    _applyRandomVisits(out, npcId, rule, dayDate, dayKey, dayKind) {
        if (!this._dayKindMatches(rule, dayKind)) return;
        if (!this._dayOfWeekMatches(rule, dayKey)) return;

        const p = typeof rule.probability === "number" ? rule.probability : 1;
        if (p < 1 && this.rnd() > p) return;

        const window = rule.window;
        if (!window) return;

        const targets = rule.targets || [];
        if (!targets.length) return;

        const minStay = rule.stayMinutes?.min ?? 30;
        const maxStay = rule.stayMinutes?.max ?? 60;

        let windowStart = parseTimeToMinutes(window.from);
        let windowEnd = parseTimeToMinutes(window.to);

        if (windowEnd <= windowStart) {
            windowEnd += 24 * 60;
        }

        const startJitter = randomJitterMinutes(this.rnd);
        const endJitter = randomJitterMinutes(this.rnd);

        let cursor = windowStart + startJitter;
        let effectiveEnd = windowEnd - endJitter;

        if (effectiveEnd - cursor < minStay) {
            cursor = windowStart;
            effectiveEnd = windowEnd;
        }

        while (cursor < effectiveEnd) {
            const rawDur = minStay + this.rnd() * (maxStay - minStay + 1);
            const duration = Math.ceil(rawDur / 5) * 5;

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

        let windowStart = parseTimeToMinutes(window.from);
        let windowEnd = parseTimeToMinutes(window.to);

        if (windowEnd <= windowStart) {
            windowEnd += 24 * 60;
        }

        const durRaw = minStay + this.rnd() * (maxStay - minStay);
        const duration = Math.max(5, Math.round(durRaw / 5) * 5);

        const latestStart = Math.max(windowStart, windowEnd - duration);
        if (latestStart < windowStart) return;

        const offset = this.rnd() * (latestStart - windowStart);
        const start = windowStart + Math.round(offset / 5) * 5;
        const end = start + duration;

        const baseSpec = rule.target || {};
        const targetSpec = {
            ...baseSpec,
            respectOpeningHours: !!rule.respectOpeningHours,
        };

        out.push({
            npcId,
            from: makeDateAtMinutes(dayDate, start),
            to: makeDateAtMinutes(dayDate, end),
            target: {
                type: TargetTypes.activity,
                spec: targetSpec,
            },
            sourceRuleId: rule.id,
        });
    }

    // ------------------------------------------------------------------
    // Slot resolution (locations + gaps)
    // ------------------------------------------------------------------

    _resolveSlots(npc, slots) {
        if (!slots.length) return;

        let lastLocationId = npc.locationId || npc.homeLocationId || this._pickAnyLocationId();

        let locationStreakStartTime = new Date(slots[0].from.getTime());

        for (const slot of slots) {
            const atTime = slot.from;

            if (slot.target.type !== TargetTypes.activity) {
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
                locationStreakStartTime = new Date(atTime.getTime());
                lastLocationId = targetLocationId;
            }
        }
    }

    _fillGaps(slots) {
        if (!slots.length) return [];

        const sameDay = (a, b) =>
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();

        const result = [];

        for (let i = 0; i < slots.length; i++) {
            const current = { ...slots[i] };
            result.push(current);

            const next = slots[i + 1];
            if (!next) continue;

            const gapStart = current.to;
            const gapEnd = next.from;

            if (!gapStart || !gapEnd) continue;
            if (gapEnd <= gapStart) continue;
            if (!sameDay(gapStart, gapEnd)) continue;

            const nextSpec = (next.target && next.target.spec) || {};
            const nextIsHome = nextSpec.type === "home";

            if (nextIsHome) {
                result.push({
                    ...next,
                    from: new Date(gapStart.getTime()),
                    to: new Date(gapEnd.getTime()),
                });
            } else {
                current.to = new Date(gapEnd.getTime());
            }
        }

        return result;
    }

    // ------------------------------------------------------------------
    // Travel planning (declarative)
    // ------------------------------------------------------------------

    _getTravelPrefsForNpc(npc) {
        const tpl = npc.meta?.scheduleTemplate || {};
        return {
            usesBus: !!tpl.useBus,
            usesCar: !!tpl.useCar,
        };
    }

    _insertTravelSlots(npc, slots, rules = []) {
        if (!slots || !slots.length) return [];

        const travelPrefs = this._getTravelPrefsForNpc(npc);

        const ruleById = new Map();
        for (const rule of rules || []) {
            if (!rule.id) continue;
            ruleById.set(rule.id, rule);
        }

        const isFixedSlot = (slot) => {
            const rule = slot && ruleById.get(slot.sourceRuleId);
            return !!rule && rule.type === SCHEDULE_RULES.fixed;
        };

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

            if (!curLoc || !nextLoc || curLoc === nextLoc) continue;
            if (curTarget.type === TargetTypes.travel) continue;

            const originIsFixed = isFixedSlot(current);
            const destIsFixed = isFixedSlot(next);

            let travelSegments = null;

            if (originIsFixed && !destIsFixed) {
                travelSegments = this._buildTravelSegmentsAfter(
                    curLoc,
                    nextLoc,
                    current,
                    travelPrefs
                );
            } else {
                travelSegments = this._buildTravelSegmentsBetween(
                    curLoc,
                    nextLoc,
                    current,
                    next,
                    travelPrefs
                );
            }

            if (!travelSegments || !travelSegments.length) continue;

            const firstSeg = travelSegments[0];

            if (firstSeg.from > current.to) {
                current.to = new Date(firstSeg.from.getTime());
            } else if (firstSeg.from > current.from && firstSeg.from < current.to) {
                current.to = new Date(firstSeg.from.getTime());
            }

            const lastSeg = travelSegments[travelSegments.length - 1];
            const travelEnd = lastSeg.to;

            if (next.from < travelEnd) {
                const deltaMs = travelEnd.getTime() - next.from.getTime();
                const durMs = next.to.getTime() - next.from.getTime();
                next.from = new Date(next.from.getTime() + deltaMs);
                next.to = new Date(next.from.getTime() + durMs);
            }

            for (const seg of travelSegments) {
                out.push(seg);
            }
        }

        out.sort((a, b) => a.from - b.from);

        return this._mergeVehicleSegments(out);
    }

    _mergeVehicleSegments(slots) {
        const merged = [];

        for (const slot of slots) {
            const prev = merged[merged.length - 1];

            const isTravel = (s) => s && s.target && s.target.type === TargetTypes.travel;
            const modeOf = (s) => (s && s.target && s.target.spec && s.target.spec.mode) || null;

            const prevMode = modeOf(prev);
            const curMode = modeOf(slot);

            const mergeable =
                prev &&
                isTravel(prev) &&
                isTravel(slot) &&
                (prevMode === "bus" || prevMode === "car") &&
                prevMode === curMode &&
                prev.to.getTime() === slot.from.getTime();

            if (mergeable) {
                prev.to = slot.to;
                const prevLen = prev.target.spec.segmentStreetLength || 0;
                const curLen = slot.target.spec.segmentStreetLength || 0;
                prev.target.spec.segmentStreetLength = prevLen + curLen;

                const prevPath = Array.isArray(prev.target.spec.pathEdges)
                    ? prev.target.spec.pathEdges
                    : [];
                const curPath = Array.isArray(slot.target.spec.pathEdges)
                    ? slot.target.spec.pathEdges
                    : [];
                prev.target.spec.pathEdges = prevPath.concat(curPath);
            } else {
                merged.push(slot);
            }
        }

        return merged;
    }

    _buildTravelSegmentsBetween(originLocId, destLocId, fromSlot, toSlot, travelPrefs) {
        const arrivalTime = toSlot.from;
        const plan = this._planTravelPath(originLocId, destLocId, arrivalTime, travelPrefs);
        if (!plan || !plan.steps || !plan.steps.length) return null;

        const windowStart = fromSlot.from;
        const windowEnd = toSlot.from;
        return this._materializePlanWithinWindow({
            npcId: fromSlot.npcId,
            plan,
            windowStart,
            windowEnd,
            anchorEnd: true,
        });
    }

    _buildTravelSegmentsAfter(originLocId, destLocId, fromSlot, travelPrefs) {
        const departureTime = fromSlot.to;
        const plan = this._planTravelPath(originLocId, destLocId, departureTime, travelPrefs);
        if (!plan || !plan.steps || !plan.steps.length) return null;

        return this._materializeTravelSteps({
            npcId: fromSlot.npcId,
            steps: plan.steps,
            totalMinutes: plan.totalMinutes,
            startTime: departureTime,
            targetMinutes: plan.totalMinutes,
        });
    }

    _materializePlanWithinWindow({ npcId, plan, windowStart, windowEnd, anchorEnd }) {
        const maxWindowMinutes = (windowEnd.getTime() - windowStart.getTime()) / 60000;
        if (maxWindowMinutes <= 0) return null;

        const total = plan.totalMinutes;

        let targetMinutes;
        let startTime;

        if (total <= maxWindowMinutes) {
            targetMinutes = total;
            if (anchorEnd) {
                startTime = new Date(windowEnd.getTime() - total * 60000);
            } else {
                startTime = new Date(windowStart.getTime());
            }
        } else {
            targetMinutes = maxWindowMinutes;
            startTime = new Date(windowStart.getTime());
        }

        if (targetMinutes <= 0) return null;

        return this._materializeTravelSteps({
            npcId,
            steps: plan.steps,
            totalMinutes: plan.totalMinutes,
            startTime,
            targetMinutes,
        });
    }

    _materializeTravelSteps({ npcId, steps, totalMinutes, startTime, targetMinutes }) {
        if (!steps.length || totalMinutes <= 0 || targetMinutes <= 0) return null;

        const scale = targetMinutes / totalMinutes;

        const scaledDurations = [];
        let sumMinutes = 0;

        for (let i = 0; i < steps.length; i++) {
            const raw = steps[i].minutes * scale;
            const clamped = Math.max(1, Math.round(raw));
            scaledDurations.push(clamped);
            sumMinutes += clamped;
        }

        if (sumMinutes !== targetMinutes && scaledDurations.length) {
            scaledDurations[scaledDurations.length - 1] += targetMinutes - sumMinutes;
        }

        const segments = [];
        let cursor = startTime.getTime();

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const mins = scaledDurations[i];
            if (mins <= 0) continue;

            const from = new Date(cursor);
            const to = new Date(cursor + mins * 60000);
            cursor = to.getTime();

            const mode = step.mode;
            const isBus = mode === "bus";

            let baseLocId = null;
            if (mode === "wait") {
                // could choose to anchor waits to a stop
                // baseLocId = step.toId || step.fromId || null;
            }

            segments.push({
                npcId,
                from,
                to,
                target: {
                    type: TargetTypes.travel,
                    spec: {
                        mode,
                        isEnRoute: true,
                        onBus: isBus,
                        fromLocationId: step.fromId,
                        toLocationId: step.toId,
                        segmentStreetLength: step.distance || 0,
                        streetName: step.streetName || null,
                        pathEdges: [
                            {
                                fromId: String(step.fromId),
                                toId: String(step.toId),
                            },
                        ],
                    },
                    locationId: baseLocId,
                    placeId: null,
                },
                sourceRuleId: "travel_auto",
            });

            if (mode === "walk") {
                const pauseFrom = new Date(cursor);
                const pauseTo = new Date(cursor + MICRO_STOP_MINUTES * 60000);
                cursor = pauseTo.getTime();

                segments.push({
                    npcId,
                    from: pauseFrom,
                    to: pauseTo,
                    target: {
                        type: TargetTypes.travel,
                        spec: {
                            mode: "walk",
                            isEnRoute: true,
                            onBus: false,
                            microStop: true,
                            fromLocationId: step.toId,
                            toLocationId: step.toId,
                            segmentStreetLength: 0,
                            streetName: step.streetName || null,
                            pathEdges: [],
                        },
                        locationId: step.toId,
                        placeId: null,
                    },
                    sourceRuleId: "travel_microstop",
                });
            }
        }

        return segments;
    }

    // ------------------------------------------------------------------
    // Path planning: choose between walk / car / bus
    // ------------------------------------------------------------------

    _buildEdgeSteps(path, mode, minutesMultiplier = 1) {
        if (!path || !path.edges || !path.edges.length) return null;

        const steps = path.edges.map((edge) => ({
            mode,
            fromId: String(edge.a),
            toId: String(edge.b),
            minutes: (edge.minutes || 1) * minutesMultiplier,
            distance: edge.distance || 0,
            streetName: edge.streetName || null,
        }));

        const totalMinutes = steps.reduce((sum, s) => sum + s.minutes, 0);
        return { steps, totalMinutes };
    }

    _planTravelPath(originLocId, destLocId, arrivalTime, travelPrefs) {
        const basePath = this.world.map.getTravelTotal(originLocId, destLocId);
        if (!basePath || !basePath.edges.length) return null;

        const baseWalkPlan = this._buildEdgeSteps(basePath, "walk", 1);
        if (!baseWalkPlan) return null;

        const { usesBus, usesCar } = travelPrefs || {};

        if (!usesBus && !usesCar) {
            return baseWalkPlan;
        }

        const busCfg = this._getBusStopConfig();
        const weather = this.world.currentWeather;
        const temperature = this.world.temperature;
        const context = {
            basePath,
            baseWalkPlan,
            busCfg,
            weather,
            temperature,
            arrivalTime: arrivalTime || this.world.time.date,
            travelPrefs,
        };

        if (usesCar) {
            const carPlan = this._planCarPath(context);
            if (carPlan) return carPlan;
        }

        if (usesBus) {
            const busPlan = this._planBusPath(originLocId, destLocId, context);
            if (busPlan) return busPlan;
        }

        return baseWalkPlan;
    }

    _planCarPath(context) {
        const { basePath, busCfg } = context;

        if (!basePath || !basePath.edges || basePath.edges.length <= 2) {
            return null; // short hops -> walk
        }

        const busMult = busCfg.travelTimeMult || 1;
        const carMult = busMult * 0.5;

        return this._buildEdgeSteps(basePath, "car", carMult);
    }

    _planBusPath(originLocId, destLocId, context) {
        const { basePath, baseWalkPlan, busCfg, weather, temperature, arrivalTime } = context;

        const baseMinutes = basePath.minutes;
        const edgesCount = basePath.edges.length;

        const tooFar = baseMinutes > 20 || edgesCount > 5;
        const badWeather =
            weather === WeatherType.RAIN ||
            weather === WeatherType.STORM ||
            weather === WeatherType.SNOW;
        const cold = temperature < 0;

        if (!tooFar && !badWeather && !cold) {
            return null;
        }

        const originBusLoc = this._findNearestBusStopLocation(originLocId);
        const destBusLoc = this._findNearestBusStopLocation(destLocId);

        if (!originBusLoc || !destBusLoc) {
            return null;
        }

        const toBus = this.world.map.getTravelTotal(originLocId, originBusLoc);
        const busPath = this.world.map.getTravelTotal(originBusLoc, destBusLoc);
        const fromBus = this.world.map.getTravelTotal(destBusLoc, destLocId);

        if (!toBus || !busPath || !fromBus) {
            return baseWalkPlan;
        }

        const walkToBusPlan = this._buildEdgeSteps(toBus, "walk", 1);
        const walkFromBusPlan = this._buildEdgeSteps(fromBus, "walk", 1);
        const busLegPlan = this._buildEdgeSteps(busPath, "bus", busCfg.travelTimeMult || 1);

        if (!walkToBusPlan || !walkFromBusPlan || !busLegPlan) {
            return baseWalkPlan;
        }

        const d = arrivalTime || this.world.time.date;
        const hour = d.getHours();
        const isDay = hour >= 6 && hour < 22;
        const freq = isDay ? busCfg.busFrequencyDay : busCfg.busFrequencyNight;
        const avgWait = freq > 0 ? freq * 0.5 : 0;

        const waitSteps = avgWait
            ? [
                  {
                      mode: "wait",
                      fromId: String(originBusLoc),
                      toId: String(originBusLoc),
                      minutes: avgWait,
                      distance: 0,
                      streetName: null,
                  },
              ]
            : [];

        const steps = [
            ...walkToBusPlan.steps,
            ...waitSteps,
            ...busLegPlan.steps,
            ...walkFromBusPlan.steps,
        ];

        const totalMinutes = steps.reduce((s, st) => s + st.minutes, 0);

        return { steps, totalMinutes };
    }

    // ------------------------------------------------------------------
    // Activity target resolution
    // ------------------------------------------------------------------

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

        if (!matcher) {
            console.log(spec, npc);
            throw new Error(`Unknown activity target type: ${type}, ${spec}`);
        }

        if (useNearest) {
            return this.world.map.findNearestPlace(
                matcher,
                originLocationId,
                atTime,
                respectOpening
            );
        }

        return this.world.map.findRandomPlace(
            matcher,
            originLocationId,
            atTime,
            respectOpening,
            minutesAtOrigin
        );
    }

    // ------------------------------------------------------------------
    // Bus helpers
    // ------------------------------------------------------------------

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

        return {
            travelTimeMult: 0.3,
            busFrequencyDay: 15,
            busFrequencyNight: 35,
        };
    }

    // ------------------------------------------------------------------
    // Priority / trimming
    // ------------------------------------------------------------------

    _applyPriorityAndTrim(slots, rules) {
        if (!slots.length) return [];

        const ruleById = new Map();
        for (const rule of rules) {
            if (!rule.id) continue;
            ruleById.set(rule.id, rule);
        }

        const annotated = slots.map((slot) => {
            const rule = ruleById.get(slot.sourceRuleId);
            const type = rule?.type;
            const priority = RULE_PRIORITY[type] ?? 0;

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

        annotated.sort((a, b) => {
            if (b._priority !== a._priority) return b._priority - a._priority;
            if (a.from.getTime() !== b.from.getTime()) return a.from - b.from;
            return a.to - b.to;
        });

        const result = [];

        const subtractCoveredRanges = (slot, blockers) => {
            let segments = [{ start: slot.from.getTime(), end: slot.to.getTime() }];

            for (const b of blockers) {
                const bs = b.from.getTime();
                const be = b.to.getTime();

                const nextSegments = [];

                for (const seg of segments) {
                    const s = seg.start;
                    const e = seg.end;

                    if (be <= s || bs >= e) {
                        nextSegments.push(seg);
                        continue;
                    }

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

        for (const slot of annotated) {
            const leftovers = subtractCoveredRanges(slot, result);
            for (const s of leftovers) {
                if (s.to > s.from) {
                    result.push(s);
                }
            }
        }

        result.sort((a, b) => a.from - b.from);

        for (let i = 0; i < result.length; i++) {
            const slot = result[i];
            const minStay = slot._minStay || 0;
            if (!minStay) continue;

            const durationMin = (slot.to.getTime() - slot.from.getTime()) / 60000;
            if (durationMin >= minStay) continue;

            const prev = result[i - 1];
            const next = result[i + 1];

            if (prev && prev.to.getTime() === slot.from.getTime()) {
                prev.to = slot.to;
                result.splice(i, 1);
                i -= 1;
                continue;
            }

            if (next && next.from.getTime() === slot.to.getTime()) {
                next.from = slot.from;
                result.splice(i, 1);
                i -= 1;
                continue;
            }
        }

        for (const s of result) {
            delete s._priority;
            delete s._minStay;
        }

        return result;
    }
}
