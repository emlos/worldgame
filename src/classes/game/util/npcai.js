import {
    DAY_KEYS,
    TARGET_TYPE,
    SCHEDULE_RULES,
    RULE_PRIORITY,
    MS_PER_DAY,
} from "../../../data/data.js";

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;

/** Parse "HH:MM" (24h) to minutes since midnight. Allows "24:00". */
function parseTimeToMinutes(str) {
    if (!str) return 0;
    const [hStr, mStr] = String(str).split(":");
    let h = parseInt(hStr, 10) || 0;
    let m = parseInt(mStr, 10) || 0;
    if (h === 24 && m === 0) return MINUTES_PER_DAY;
    h = Math.max(0, Math.min(24, h));
    m = Math.max(0, Math.min(59, m));
    return h * 60 + m;
}

function ymdKey(date) {
    // Local-date-based key (YYYY-MM-DD) so caching & week grouping
    // are stable regardless of the machine's timezone.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function weekKeyFrom(date) {
    return ymdKey(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
}

function normalizeMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function minutesBetween(a, b) {
    return (b.getTime() - a.getTime()) / MS_PER_MINUTE;
}

/**
 * Helper: does a rule apply on a given day (by dayKind + day key)?
 * Uses:
 *   - rule.dayKinds: [DayKind.*]
 *   - rule.daysOfWeek: [DAY_KEYS[*]]  (canonical)
 *   - rule.candidateDays: legacy alias for daysOfWeek
 */
function ruleAppliesOnDay(rule, dayInfo, dayKey) {
    if (!rule) return false;

    const { dayKinds } = rule;
    const kinds = Array.isArray(dayKinds) ? dayKinds : dayKinds ? [dayKinds] : null;
    if (kinds && kinds.length && !kinds.includes(dayInfo.kind)) return false;

    const dows =
        (Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length && rule.daysOfWeek) ||
        (Array.isArray(rule.candidateDays) && rule.candidateDays.length && rule.candidateDays) ||
        null;

    if (dows && dows.length && !dows.includes(dayKey)) return false;

    return true;
}

/**
 * Expand a {from:"HH:MM",to:"HH:MM"} window into a concrete Date range.
 * If to < from, spans midnight into the next day.
 */
function makeWindowRange(baseDate, time) {
    const fromM = parseTimeToMinutes(time.from);
    const toM = parseTimeToMinutes(time.to);
    const start = new Date(baseDate.getTime() + fromM * MS_PER_MINUTE);
    let end;
    if (toM >= fromM) {
        end = new Date(baseDate.getTime() + toM * MS_PER_MINUTE);
    } else {
        // crosses midnight
        end = new Date(baseDate.getTime() + (MINUTES_PER_DAY + toM) * MS_PER_MINUTE);
    }
    return { start, end };
}

/**
 * A VisitIntent is "I want to be at this place in this time window
 * for somewhere between [minStay, maxStay] minutes", but without
 * an exact concrete start time yet.
 *
 * {
 *   id: string,
 *   npcId: string,
 *   ruleId: string|null,
 *   ruleType: SCHEDULE_RULES.*,
 *   priority: number,
 *   windowStart: Date,
 *   windowEnd: Date,
 *   minStay: number, // minutes
 *   maxStay: number, // minutes
 *   location: Location,
 *   place: Place|null,
 * }
 */

export class NPCScheduler {
    /**
     * @param {{world:any, rnd?:Function}} opts
     */
    constructor({ world, rnd }) {
        this.world = world;
        this.rnd = rnd || Math.random;
        // cache: npcId -> weekKey -> { startDate, endDate, slots: [] }
        this.cache = new Map();
    }

    /**
     * Return weekly schedule for an NPC.
     * @param {NPC} npc
     * @param {Date} weekStartDate - interpreted as "start of week" (midnight)
     * @returns {Array<Object>} slots
     */
    getWeekSchedule(npc, weekStartDate) {
        if (!npc || !this.world) return [];
        const npcId = String(npc.id || npc.key || npc.name);

        // Always align the requested date to the Monday of its week
        // and then clamp to midnight, so every schedule is strictly
        // Monday → Sunday regardless of current in-game day.
        const base = this._weekStartForDate(weekStartDate || this.world.time.date);
        const weekKey = weekKeyFrom(base);

        let perNpc = this.cache.get(npcId);
        if (!perNpc) {
            perNpc = new Map();
            this.cache.set(npcId, perNpc);
        }
        const cached = perNpc.get(weekKey);
        if (cached) return cached.slots;

        const slots = this._buildWeekSchedule(npc, base);

        perNpc.set(weekKey, {
            startDate: base,
            endDate: new Date(base.getTime() + 7 * MS_PER_DAY),
            slots,
        });

        return slots;
    }

    getCurrentWeekSchedule(npc) {
        const weekStart = this._weekStartForDate(this.world.time.date);
        return this.getWeekSchedule(npc, weekStart);
    }

    /**
     * Peek what an NPC intends to do in the near future.
     * @param {NPC} npc
     * @param {number} nextMinutes
     * @param {Date} fromDate
     * @returns {{willMove:boolean, at:Date, nextSlot:Object|null}}
     */
    peek(npc, nextMinutes, fromDate = this.world.time.date) {
        if (!npc || !this.world) {
            return { willMove: false, at: new Date(), nextSlot: null };
        }
        const origin = new Date(fromDate.getTime());
        const limit = new Date(origin.getTime() + (Number(nextMinutes) || 0) * MS_PER_MINUTE);

        const weekStart = this._weekStartForDate(origin);
        const slots = this.getWeekSchedule(npc, weekStart);

        let best = null;
        for (const slot of slots) {
            if (slot.from <= origin) continue;
            if (slot.from > limit) continue;
            if (!best || slot.from < best.from) {
                best = slot;
            }
        }

        if (!best) {
            return { willMove: false, at: limit, nextSlot: null };
        }

        return { willMove: true, at: best.from, nextSlot: best };
    }

    // ---------------------------------------------------------------------
    // Internal: schedule construction
    // ---------------------------------------------------------------------

    _buildWeekSchedule(npc, weekStart) {
        const npcId = String(npc.id || npc.key || npc.name);
        const template = npc.scheduleTemplate || {};
        const rules = Array.isArray(template.rules) ? template.rules : [];
        if (!rules.length) return [];

        const weekStartMs = weekStart.getTime();
        const weekEndMs = weekStartMs + 7 * MS_PER_DAY;

        // 1) Generate intents for the whole week (no exact times yet)
        const intents = this._generateIntentsForWeek(npc, weekStart, rules);

        // 2) Build a continuous week-long timeline from intents + travel.
        const slots = this._buildWeekTimelineFromIntents(
            npc,
            intents,
            weekStart,
            new Date(weekEndMs)
        );

        return slots;
    }

    /**
     * Given any Date, return the local Monday 00:00 that starts its week.
     * Week is always Monday–Sunday, independent of the current client day.
     */
    _weekStartForDate(date) {
        const base = normalizeMidnight(date || this.world?.time?.date || new Date());
        // JS getDay(): 0 = Sun, 1 = Mon, ... 6 = Sat
        const day = base.getDay();
        // Convert to Monday-based index: Mon=0, Tue=1, ... Sun=6
        const monIndex = (day + 6) % 7;
        const mondayMs = base.getTime() - monIndex * MS_PER_DAY;
        return new Date(mondayMs);
    }

    // ---------------------------------------------------------------------
    // INTENT GENERATION
    // ---------------------------------------------------------------------

    _generateIntentsForWeek(npc, weekStart, rules) {
        const npcId = String(npc.id || npc.key || npc.name);
        const intents = [];

        const weekStartMs = weekStart.getTime();

        // First pass: per-day rules (home, fixed, random, daily)
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const dayDate = new Date(weekStartMs + dayOffset * MS_PER_DAY);
            const dayInfo = this.world.getDayInfo(dayDate);
            const dow = dayDate.getDay(); // 0=Sun
            const dayKey = DAY_KEYS[dow];

            for (const rule of rules) {
                if (!rule || !rule.type) continue;

                // weekly handled separately in second pass
                if (rule.type === SCHEDULE_RULES.weekly) continue;

                // Home ignores day filters by design
                if (rule.type !== SCHEDULE_RULES.home && !ruleAppliesOnDay(rule, dayInfo, dayKey)) {
                    continue;
                }

                // Probability gating: per day, per rule
                if (!this._rulePassesProbability(rule)) continue;

                switch (rule.type) {
                    case SCHEDULE_RULES.home:
                        this._generateHomeIntentsForDay({
                            npc,
                            npcId,
                            dayDate,
                            rule,
                            intents,
                        });
                        break;

                    case SCHEDULE_RULES.fixed:
                        this._generateFixedIntentsForDay({
                            npc,
                            npcId,
                            dayDate,
                            rule,
                            intents,
                        });
                        break;

                    case SCHEDULE_RULES.random:
                        this._generateRandomIntentsForDay({
                            npc,
                            npcId,
                            dayDate,
                            rule,
                            intents,
                        });
                        break;

                    case SCHEDULE_RULES.daily:
                        this._generateDailyIntentsForDay({
                            npc,
                            npcId,
                            dayDate,
                            rule,
                            intents,
                        });
                        break;

                    default:
                        // ignore follow/unknown for now
                        break;
                }
            }
        }

        // Second pass: weekly rules (once per week)
        for (const rule of rules) {
            if (!rule || rule.type !== SCHEDULE_RULES.weekly) continue;

            // Probability gating: once per week
            if (!this._rulePassesProbability(rule)) continue;

            this._generateWeeklyIntentsForWeek({
                npc,
                npcId,
                weekStart,
                rule,
                intents,
            });
        }

        return intents;
    }

    _generateHomeIntentsForDay({ npc, npcId, dayDate, rule, intents }) {
        const timeBlocks = Array.isArray(rule.timeBlocks) ? rule.timeBlocks : [];
        if (!timeBlocks.length) return;
        const homeLocation = this._getHomeLocation(npc);
        if (!homeLocation) return;

        const priority = this._priorityForRule(rule);

        for (const block of timeBlocks) {
            if (!block || !block.from || !block.to) continue;
            const fromM = parseTimeToMinutes(block.from);
            const toM = parseTimeToMinutes(block.to);
            if (toM <= fromM) continue; // per spec, home rules won't cross midnight

            const start = new Date(dayDate.getTime() + fromM * MS_PER_MINUTE);
            const end = new Date(dayDate.getTime() + toM * MS_PER_MINUTE);
            const durMinutes = minutesBetween(start, end);

            intents.push({
                id: `${npcId}:${rule.id || TARGET_TYPE.home}:${start.toISOString()}`,
                npcId,
                ruleId: rule.id || null,
                ruleType: rule.type,
                priority,
                windowStart: start,
                windowEnd: end,
                minStay: 1,
                maxStay: durMinutes,

                location: homeLocation,
                place: null,
            });
        }
    }

    _generateFixedIntentsForDay({ npc, npcId, dayDate, rule, intents }) {
        const window = rule.window;
        if (!window || !window.from || !window.to) return;
        const { start, end } = makeWindowRange(dayDate, window);
        const durMinutes = minutesBetween(start, end);
        if (durMinutes <= 0) return;

        const locInfo = this._pickLocationFromTargets({
            npc,
            rule,
            from: start,
            to: end,
        });
        if (!locInfo) return;

        const priority = this._priorityForRule(rule);

        intents.push({
            id: `${npcId}:${rule.id || "fixed"}:${start.toISOString()}`,
            npcId,
            ruleId: rule.id || null,
            ruleType: rule.type,
            priority,
            windowStart: start,
            windowEnd: end,
            minStay: durMinutes,
            maxStay: durMinutes,
            location: locInfo.location,
            place: locInfo.place || null,
        });
    }

    _generateDailyIntentsForDay({ npc, npcId, dayDate, rule, intents }) {
        const window = rule.window;
        if (!window || !window.from || !window.to) return;
        const { start, end } = makeWindowRange(dayDate, window);
        const windowMinutes = minutesBetween(start, end);
        if (windowMinutes <= 0) return;

        const stay = rule.stayMinutes || {};
        const minStay = Math.max(1, Number(stay.min) || 30);
        const maxStay = Math.max(minStay, Number(stay.max) || minStay);
        if (windowMinutes < minStay) return;

        const locInfo = this._pickLocationFromTargets({
            npc,
            rule,
            from: start,
            to: end,
        });
        if (!locInfo) return;

        const priority = this._priorityForRule(rule);

        intents.push({
            id: `${npcId}:${rule.id || "daily"}:${start.toISOString()}`,
            npcId,
            ruleId: rule.id || null,
            ruleType: rule.type,
            priority,
            windowStart: start,
            windowEnd: end,
            minStay,
            maxStay,
            location: locInfo.location,
            place: locInfo.place || null,
        });
    }

    _generateRandomIntentsForDay({ npc, npcId, dayDate, rule, intents }) {
        const window = rule.window;
        if (!window || !window.from || !window.to) return;
        const { start, end } = makeWindowRange(dayDate, window);
        const windowMinutes = minutesBetween(start, end);
        if (windowMinutes <= 0) return;

        const stay = rule.stayMinutes || {};
        const minStay = Math.max(1, Number(stay.min) || 30);
        const maxStay = Math.max(minStay, Number(stay.max) || minStay);

        if (windowMinutes < minStay) return;

        const priority = this._priorityForRule(rule);

        // Heuristic: estimate how many visits might fit and create that many intents.
        const avgStay = (minStay + maxStay) / 2;
        let count = Math.floor(windowMinutes / avgStay);
        if (count < 1) count = 1;

        for (let i = 0; i < count; i++) {
            const locInfo = this._pickLocationFromTargets({
                npc,
                rule,
                from: start,
                to: end,
            });
            if (!locInfo) continue;

            intents.push({
                id: `${npcId}:${rule.id || "random"}:${start.toISOString()}:${i}`,
                npcId,
                ruleId: rule.id || null,
                ruleType: rule.type,
                priority,
                windowStart: start,
                windowEnd: end,
                minStay,
                maxStay,
                location: locInfo.location,
                place: locInfo.place || null,
            });
        }
    }

    _generateWeeklyIntentsForWeek({ npc, npcId, weekStart, rule, intents }) {
        const stay = rule.stayMinutes || {};
        const minStay = Math.max(1, Number(stay.min) || 30);
        const maxStay = Math.max(minStay, Number(stay.max) || minStay);

        // Determine candidate days in this week
        const candidates = [];
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const dayDate = new Date(weekStart.getTime() + dayOffset * MS_PER_DAY);
            const dayInfo = this.world.getDayInfo(dayDate);
            const dow = dayDate.getDay();
            const dayKey = DAY_KEYS[dow];
            if (ruleAppliesOnDay(rule, dayInfo, dayKey)) {
                candidates.push(dayDate);
            }
        }
        if (!candidates.length) return;

        const dayDate = candidates[(this.rnd() * candidates.length) | 0];

        const window = rule.window;
        if (!window || !window.from || !window.to) return;
        const { start, end } = makeWindowRange(dayDate, window);
        const windowMinutes = minutesBetween(start, end);
        if (windowMinutes <= 0 || windowMinutes < minStay) return;

        const locInfo = this._pickLocationFromTargets({
            npc,
            rule,
            from: start,
            to: end,
        });
        if (!locInfo) return;

        const priority = this._priorityForRule(rule);

        intents.push({
            id: `${npcId}:${rule.id || "weekly"}:${start.toISOString()}`,
            npcId,
            ruleId: rule.id || null,
            ruleType: rule.type,
            priority,
            windowStart: start,
            windowEnd: end,
            minStay,
            maxStay,
            location: locInfo.location,
            place: locInfo.place || null,
        });
    }

    // ---------------------------------------------------------------------
    // TIMELINE BUILDING WITH TRAVEL
    // ---------------------------------------------------------------------

    /**
     * Build a continuous, non-overlapping week timeline from visit intents.
     *
     * Travel rules:
     *   - Every move between locations has explicit travel time.
     *   - Walking:
     *       * Moves along edges from map.getTravelTotal
     *       * At each intermediate node, NPC lingers 1–2 minutes (still "travel" state),
     *         so the player can encounter them mid-journey.
     *   - Bus:
     *       * Only if NPC.useBus and bus conditions apply.
     *       * Walk to nearest bus_stop, wait for bus, ride (shortened by travelTimeMult),
     *         arrive at nearest bus_stop to target, linger 1–2 minutes,
     *         then walk if needed.
     *   - Car:
     *       * Only if NPC.useCar and car conditions apply.
     *       * Single travel block, faster (0.4x path time), no intermediate locations.
     *   - During bus/car ride, NPC is "in transit" and not at any map location.
     *   - The only teleport is when currentLocationId === targetLocationId.
     */
    _buildWeekTimelineFromIntents(npc, intents, weekStart, weekEnd) {
        const npcId = String(npc.id || npc.key || npc.name);
        const weekStartMs = weekStart.getTime();
        const weekEndMs = weekEnd.getTime();

        const homeLocation = this._getHomeLocation(npc);
        const slots = [];

        // Copy intents so we can mutate
        const remaining = intents.slice();

        // Helper: simple comparator: earlier windowStart, then higher priority
        remaining.sort((a, b) => {
            if (a.windowStart.getTime() !== b.windowStart.getTime()) {
                return a.windowStart - b.windowStart;
            }
            if (a.priority !== b.priority) {
                return b.priority - a.priority; // higher priority first
            }
            return (a.ruleId || "").localeCompare(b.ruleId || "");
        });

        let cursor = new Date(weekStartMs);
        let currentLocation = homeLocation || null;
        let currentPlace = null;

        const clampToWeek = (d) =>
            new Date(Math.min(Math.max(d.getTime(), weekStartMs), weekEndMs));

        const pushSlot = (from, to, location, place, sourceRuleId, ruleType, extra = {}) => {
            if (to <= from) return;
            slots.push({
                npcId,
                from,
                to,
                target: location,
                location,
                locationId: location ? location.id : null,
                place: place || null,
                placeId: place ? place.id : null,
                sourceRuleId: sourceRuleId || null,
                ruleType: ruleType || null,
                ...extra,
            });
        };

        while (cursor < weekEnd) {
            // Find the best intent we can schedule starting at or after `cursor`
            let best = null;
            let bestAvailableStart = null;

            for (const intent of remaining) {
                const winStart = intent.windowStart;
                const winEnd = intent.windowEnd;

                if (winEnd <= cursor) continue;
                if (winStart >= weekEnd) continue;

                let earliest;

                if (intent.ruleType === SCHEDULE_RULES.fixed) {
                    // Hard constraint: we always schedule the full window.
                    // We don't use minStay fit logic here and we don't move it around.
                    // We conceptually want it at winStart..winEnd.
                    if (cursor > winEnd) {
                        // already completely in the past
                        continue;
                    }
                    earliest = winStart; // fixed always evaluated at its own start
                } else {
                    // normal (flexible) intents: use old logic
                    earliest = cursor > winStart ? cursor : winStart;

                    if (earliest.getTime() + intent.minStay * MS_PER_MINUTE > winEnd.getTime()) {
                        continue;
                    }
                }

                if (!best) {
                    best = intent;
                    bestAvailableStart = earliest;
                } else {
                    if (earliest < bestAvailableStart) {
                        best = intent;
                        bestAvailableStart = earliest;
                    } else if (earliest.getTime() === bestAvailableStart.getTime()) {
                        if (intent.priority > best.priority) {
                            best = intent;
                            bestAvailableStart = earliest;
                        }
                    }
                }
            }

            if (!best) {
                break;
            }

            // ---- HARD FIXED SLOTS: adjust previous flexible slot if needed, then travel → stay ----
            if (best.ruleType === SCHEDULE_RULES.fixed) {
                const winStart = best.windowStart;
                const winEnd = best.windowEnd;
                // 1) Compute travel if we leave at the current cursor time
                let travelPlan = this._computeTravelPlan(
                    npc,
                    currentLocation,
                    best.location,
                    cursor
                );
                let travelMinutes = travelPlan.minutes || 0;
                let arrivalIfLeaveNow = new Date(cursor.getTime() + travelMinutes * MS_PER_MINUTE);

                // 2) If we'd arrive AFTER the fixed window starts, pull departure earlier
                //    by shrinking previous "stay" slots as much as needed (ignoring rule min-stays).
                let safety = 0;
                while (arrivalIfLeaveNow > winStart && slots.length && safety < 20) {
                    const lastSlot = slots[slots.length - 1];

                    // We can only shrink "stay" slots; if last one isn't a stay, we give up.
                    if (!lastSlot || lastSlot.activityType !== "stay") break;

                    const lastDur = minutesBetween(lastSlot.from, lastSlot.to);
                    if (lastDur <= 0) {
                        slots.pop();
                        continue;
                    }

                    const neededShiftMin = Math.ceil(
                        (arrivalIfLeaveNow.getTime() - winStart.getTime()) / MS_PER_MINUTE
                    );

                    // For fixed rules, we don't respect per-rule minStay; we can cut into any stay.
                    const shrinkBy = Math.min(neededShiftMin, lastDur);

                    // Shrink this slot from the end
                    lastSlot.to = new Date(lastSlot.to.getTime() - shrinkBy * MS_PER_MINUTE);
                    cursor = new Date(cursor.getTime() - shrinkBy * MS_PER_MINUTE);

                    // If the slot has collapsed, drop it and update currentLocation/place
                    if (lastSlot.to <= lastSlot.from) {
                        slots.pop();
                        const prev = slots[slots.length - 1];
                        if (prev && prev.activityType === "stay") {
                            currentLocation = prev.location;
                            currentPlace = prev.place || null;
                        } else {
                            currentLocation = homeLocation || null;
                            currentPlace = null;
                        }
                    }

                    // Recompute travel with the earlier departure (for bus timing, env, etc.)
                    travelPlan = this._computeTravelPlan(
                        npc,
                        currentLocation,
                        best.location,
                        cursor
                    );
                    travelMinutes = travelPlan.minutes || 0;
                    arrivalIfLeaveNow = new Date(cursor.getTime() + travelMinutes * MS_PER_MINUTE);

                    safety++;
                }

                // 3) Emit travel segments starting at cursor
                let t = new Date(cursor.getTime());

                for (const seg of travelPlan.segments) {
                    const segFrom = new Date(t.getTime());
                    const segTo = new Date(t.getTime() + seg.minutes * MS_PER_MINUTE);

                    let loc = null;
                    let place = null;

                    if (seg.locationId) {
                        loc = this.world?.locations?.get(String(seg.locationId)) || null;
                    }
                    if (seg.place && seg.place.id) {
                        place = seg.place;
                    }

                    pushSlot(segFrom, segTo, loc, place, best.ruleId, best.ruleType, {
                        activityType: "travel",
                        travelMode: seg.mode,
                        travelSegmentKind: seg.kind,
                        travelMeta: {
                            fromLocationId: seg.fromLocationId || null,
                            toLocationId: seg.toLocationId || null,
                            busStopId: seg.busStopId || null,
                        },
                    });

                    t = segTo;
                }

                const arrival = t;

                // 4) Stay at the fixed location from arrival until the fixed window end.
                // If arrival <= winStart, they are early; if slightly later, they're a bit late,
                // but the 09:00–15:00 window is still the "hard" presence window we aim for.
                const stayFrom = clampToWeek(arrival);
                const stayTo = clampToWeek(winEnd);

                if (stayTo > stayFrom) {
                    pushSlot(
                        stayFrom,
                        stayTo,
                        best.location,
                        best.place,
                        best.ruleId,
                        best.ruleType,
                        {
                            activityType: "stay",
                        }
                    );
                }

                currentLocation = best.location;
                currentPlace = best.place || null;
                cursor = stayTo;

                const idxFixed = remaining.indexOf(best);
                if (idxFixed >= 0) remaining.splice(idxFixed, 1);

                continue;
            }

            if (bestAvailableStart > cursor && best.ruleType !== SCHEDULE_RULES.fixed) {
                const gapEnd = clampToWeek(bestAvailableStart);

                if (currentLocation && gapEnd > cursor) {
                    const lastSlot = slots[slots.length - 1];

                    // If the previous slot is a stay at the same location/place and is
                    // exactly contiguous with the gap, just extend it.
                    if (
                        lastSlot &&
                        lastSlot.activityType === "stay" &&
                        lastSlot.to.getTime() === cursor.getTime() &&
                        lastSlot.locationId === (currentLocation && currentLocation.id) &&
                        lastSlot.placeId === (currentPlace && currentPlace.id)
                    ) {
                        lastSlot.to = gapEnd;
                    } else {
                        // Otherwise create a new idle stay slot for the gap.
                        pushSlot(cursor, gapEnd, currentLocation, currentPlace, null, null, {
                            activityType: "stay",
                            isIdle: true,
                        });
                    }
                }

                cursor = gapEnd;
                if (cursor >= weekEnd) break;
            }

            // Now we're at the earliest time we can consider starting this intent
            const winEnd = best.windowEnd;

            // Compute travel from currentLocation -> best.location
            const travelPlan = this._computeTravelPlan(npc, currentLocation, best.location, cursor);
            const arrivalMs = cursor.getTime() + travelPlan.minutes * MS_PER_MINUTE;

            // Check if arrival + minStay fits into the window
            if (arrivalMs + best.minStay * MS_PER_MINUTE > winEnd.getTime()) {
                // Can't fit this intent; drop it and continue
                const idxDrop = remaining.indexOf(best);
                if (idxDrop >= 0) remaining.splice(idxDrop, 1);
                continue;
            }

            // Emit travel slots (if any)
            let t = cursor;
            for (const seg of travelPlan.segments) {
                const segFrom = new Date(t.getTime());
                const segTo = new Date(t.getTime() + seg.minutes * MS_PER_MINUTE);

                let loc = null;
                let place = null;

                if (seg.locationId) {
                    loc = this.world?.locations?.get(String(seg.locationId)) || null;
                }

                if (seg.place && seg.place.id) {
                    place = seg.place;
                }

                pushSlot(segFrom, segTo, loc, place, best.ruleId, best.ruleType, {
                    activityType: "travel",
                    travelMode: seg.mode,
                    travelSegmentKind: seg.kind,
                    travelMeta: {
                        fromLocationId: seg.fromLocationId || null,
                        toLocationId: seg.toLocationId || null,
                        busStopId: seg.busStopId || null,
                    },
                });

                t = segTo;
            }

            const arrival = new Date(arrivalMs);

            // Determine stay duration
            const maxPossibleStay = Math.min(best.maxStay, minutesBetween(arrival, winEnd));
            if (maxPossibleStay < best.minStay) {
                // Shouldn't happen given earlier checks, but be safe
                const idxDrop = remaining.indexOf(best);
                if (idxDrop >= 0) remaining.splice(idxDrop, 1);
                cursor = arrival; // still move time forward
                continue;
            }

            let staySpan;
            if (best.ruleType === SCHEDULE_RULES.home) {
                staySpan = maxPossibleStay;
            } else {
                // existing behavior for random/daily/weekly/etc
                staySpan =
                    best.minStay + Math.floor(this.rnd() * (maxPossibleStay - best.minStay + 1));
            }

            const leave = new Date(arrival.getTime() + staySpan * MS_PER_MINUTE);

            const fromStay = clampToWeek(arrival);
            const toStay = clampToWeek(leave);

            pushSlot(fromStay, toStay, best.location, best.place, best.ruleId, best.ruleType, {
                activityType: "stay",
            });

            currentLocation = best.location;
            currentPlace = best.place || null;
            cursor = toStay;

            // Remove the intent now that it's consumed
            const idx = remaining.indexOf(best);
            if (idx >= 0) remaining.splice(idx, 1);
        }

        // Ensure sorted by time
        slots.sort((a, b) => a.from - b.from || a.to - b.to);
        return slots;
    }

    _getRuleMinStayForSlot(npc, slot) {
        if (!npc || !slot) return 0;
        const tpl = npc.scheduleTemplate || {};
        const rules = Array.isArray(tpl.rules) ? tpl.rules : [];
        const ruleId = slot.sourceRuleId;
        if (!ruleId) return 0;

        const rule =
            rules.find((r) => r.id === ruleId && r.type === slot.ruleType) ||
            rules.find((r) => r.id === ruleId);

        if (!rule) return 0;

        const stay = rule.stayMinutes || {};
        const min = Number(stay.min);
        if (!Number.isFinite(min) || min <= 0) return 0;

        return min;
    }

    // ---------------------------------------------------------------------
    // TRAVEL PLANNING (walk / bus / car)
    // ---------------------------------------------------------------------

    /**
     * Compute how the NPC travels between two locations at a given time.
     *
     * Returns:
     * {
     *   mode: "none" | "walk" | "bus" | "car",
     *   minutes: number, // total travel time including linger/wait
     *   segments: [
     *     {
     *       mode: "walk"|"bus"|"car",
     *       kind: "walk_edge"|"walk_linger"|"bus_wait"|"bus_ride"|"bus_linger"|"car_drive",
     *       minutes: number,
     *       locationId?: string,     // for linger/wait at a location
     *       fromLocationId?: string, // for edges / bus ride
     *       toLocationId?: string,
     *       busStopId?: string,
     *       place?: Place,           // for bus_stop place, if desired
     *     },
     *   ]
     * }
     */
    _computeTravelPlan(npc, currentLocation, targetLocation, departureTime) {
        const world = this.world;
        const map = world && world.map;
        const template = npc.scheduleTemplate || {};

        // If we don't have map or locations, or same location, teleport.
        if (!map || !world.locations || !currentLocation || !targetLocation) {
            return {
                mode: "none",
                minutes: 0,
                segments: [],
            };
        }

        const fromId = String(currentLocation.id);
        const toId = String(targetLocation.id);
        if (!fromId || !toId || fromId === toId) {
            return {
                mode: "none",
                minutes: 0,
                segments: [],
            };
        }

        const walkRoute = map.getTravelTotal(fromId, toId);
        if (!walkRoute || !Number.isFinite(walkRoute.minutes)) {
            // unreachable? fall back to teleport
            return {
                mode: "none",
                minutes: 0,
                segments: [],
            };
        }

        // Full walking plan including micro-stops
        const walkPlan = this._buildWalkingPlanFromRoute(walkRoute);
        const walkTotalMinutes = walkPlan.totalMinutes;
        const edgesCount = walkRoute.edges
            ? walkRoute.edges.length
            : Math.max(0, walkRoute.locations.length - 1);

        const env = this._getEnvironmentState(departureTime);
        const density = env.density;
        const preferVehicle = env.badWeather || env.isCold || env.isNight;
        const densityScaledEdgeThreshold = Math.max(1, Math.round(3 * density));

        const canUseBus = !!template.useBus;
        const canUseCar = !!template.useCar;

        // --- Build a bus candidate plan (but don't decide yet) ---
        let busCandidate = null;
        if (canUseBus) {
            busCandidate = this._buildBusPlan(
                npc,
                currentLocation,
                targetLocation,
                departureTime,
                walkRoute,
                env
            );
        }

        // --- Build a car candidate plan (but don't decide yet) ---
        let carCandidate = null;
        if (canUseCar) {
            const baseWalkMinutes = walkRoute.minutes; // WITHOUT micro-stops
            const carTravelMinutes = Math.ceil(baseWalkMinutes * 0.4); // 0.4x speed
            if (Number.isFinite(carTravelMinutes) && carTravelMinutes >= 0) {
                carCandidate = {
                    mode: "car",
                    minutes: carTravelMinutes,
                    segments: [
                        {
                            mode: "car",
                            kind: "car_drive",
                            minutes: carTravelMinutes,
                            fromLocationId: fromId,
                            toLocationId: toId,
                        },
                    ],
                };
            }
        }

        // --- Decide which of walk / bus / car to use ---

        const plainWalkMinutes = walkRoute.minutes; // base Dijkstra minutes

        // Car conditions (from your spec):
        // useCar && (
        //   bad weather / cold / night
        //   OR pure walking time > 15
        //   OR edges > 3 (scaled with density)
        // )
        let useCar = false;
        if (carCandidate) {
            const carEdgesCondition = edgesCount > densityScaledEdgeThreshold;
            const carTimeCondition = plainWalkMinutes > 15;
            const carEnvCondition = preferVehicle;
            if (carEnvCondition || carTimeCondition || carEdgesCondition) {
                useCar = true;
            }
        }

        // Bus conditions (from your spec):
        // useBus && (
        //   bad weather / cold / night
        //   OR pure walking time > bus time (including buses & walks)
        //   OR edges > 3 (scaled with density)
        // )
        let useBus = false;
        if (busCandidate) {
            const busTotal = busCandidate.totalMinutes; // with waits, micro-stops, etc.
            const busEdgesCondition = edgesCount > densityScaledEdgeThreshold;
            const busTimeCondition = plainWalkMinutes > busTotal;
            const busEnvCondition = preferVehicle;

            if (busEnvCondition || busTimeCondition || busEdgesCondition) {
                useBus = true;
            }
        }

        // Priority: car > bus > walk
        if (useCar && carCandidate) {
            return {
                mode: "car",
                minutes: carCandidate.minutes,
                segments: carCandidate.segments,
            };
        }

        if (useBus && busCandidate) {
            return {
                mode: "bus",
                minutes: busCandidate.totalMinutes,
                segments: busCandidate.segments,
            };
        }

        // Fallback: walk
        return {
            mode: "walk",
            minutes: walkPlan.totalMinutes,
            segments: walkPlan.segments,
        };
    }

    /**
     * Build a walking plan from a map route:
     * - travel along each edge (edge.minutes)
     * - linger 1–2 minutes at each intermediate location (still travel)
     */
    _buildWalkingPlanFromRoute(route) {
        const segments = [];
        let totalMinutes = 0;

        const locIds = route.locations || [];
        const edges = route.edges || [];

        for (let i = 0; i < edges.length; i++) {
            const fromId = String(locIds[i]);
            const toId = String(locIds[i + 1]);
            const edge = edges[i];
            const edgeMinutes = edge && typeof edge.minutes === "number" ? edge.minutes : 1;

            // Segment: moving along the edge
            segments.push({
                mode: "walk",
                kind: "walk_edge",
                minutes: edgeMinutes,
                fromLocationId: fromId,
                toLocationId: toId,
            });
            totalMinutes += edgeMinutes;

            // Segment: linger at intermediate location (not at final target)
            if (i + 1 < locIds.length - 1) {
                const lingerMinutes = 1 + (this.rnd() < 0.5 ? 0 : 1); // 1–2 minutes
                segments.push({
                    mode: "walk",
                    kind: "walk_linger",
                    minutes: lingerMinutes,
                    locationId: toId,
                });
                totalMinutes += lingerMinutes;
            }
        }

        return { segments, totalMinutes };
    }

    /**
     * Build a bus travel plan, including:
     * - walk to nearest bus stop
     * - wait for bus
     * - bus ride between stops (shortened by travelTimeMult)
     * - linger at arrival stop
     * - walk to final target (if needed)
     *
     * Returns null if bus is not viable.
     */
    _buildBusPlan(npc, currentLocation, targetLocation, departureTime, walkRoute, env) {
        const world = this.world;
        const map = world && world.map;
        if (!map || !world.locations) return null;

        const fromId = String(currentLocation.id);
        const toId = String(targetLocation.id);

        // 1) Find nearest bus stops to current and target
        const fromBus = this._findNearestBusStop(fromId);
        const toBus = this._findNearestBusStop(toId);

        if (!fromBus || !toBus) return null;

        // If origin and destination stops are the same, bus makes no sense → walk
        if (String(fromBus.location.id) === String(toBus.location.id)) {
            return null;
        }

        const walkToStopRoute = map.getTravelTotal(fromId, fromBus.location.id);
        const walkFromStopRoute = map.getTravelTotal(toBus.location.id, toId);
        const busRoute = map.getTravelTotal(fromBus.location.id, toBus.location.id);

        if (!walkToStopRoute || !walkFromStopRoute || !busRoute) return null;

        const busBaseMinutes = busRoute.minutes;
        if (!Number.isFinite(busBaseMinutes) || busBaseMinutes <= 0) {
            return null;
        }

        const props = (fromBus.place && fromBus.place.props) || {};
        const travelMult = typeof props.travelTimeMult === "number" ? props.travelTimeMult : 0.6;
        const busRideMinutes = Math.ceil(busBaseMinutes * travelMult);

        // --- Build walking plan to the stop first ---
        const walkToPlan = this._buildWalkingPlanFromRoute(walkToStopRoute);
        const walkToMinutes = walkToPlan.totalMinutes;

        // 2) Bus frequency and waiting time (based on arrival at the stop)
        const freqDay = typeof props.busFrequencyDay === "number" ? props.busFrequencyDay : 15;
        const freqNight =
            typeof props.busFrequencyNight === "number" ? props.busFrequencyNight : 35;

        const isNight = env.isNight;
        const freq = isNight ? freqNight : freqDay;

        // Arrival at stop in minutes since midnight
        const baseMinutesSinceMidnight = departureTime.getHours() * 60 + departureTime.getMinutes();
        const minutesSinceMidnightAtStop =
            (baseMinutesSinceMidnight + walkToMinutes) % MINUTES_PER_DAY;

        let waitMinutes = 0;
        if (freq > 0) {
            const mod = minutesSinceMidnightAtStop % freq;
            waitMinutes = mod === 0 ? 0 : freq - mod; // next bus aligned to 00:00
        }

        // 3) Build segments for schedule (including linger)
        const segments = [];
        let totalMinutes = 0;

        // Walking to stop
        for (const seg of walkToPlan.segments) {
            segments.push(seg);
            totalMinutes += seg.minutes;
        }

        // Wait at bus stop
        if (waitMinutes > 0) {
            segments.push({
                mode: "bus",
                kind: "bus_wait",
                minutes: waitMinutes,
                locationId: fromBus.location.id,
                busStopId: fromBus.location.id,
                place: fromBus.place || null,
            });
            totalMinutes += waitMinutes;
        }

        // Bus ride
        segments.push({
            mode: "bus",
            kind: "bus_ride",
            minutes: busRideMinutes,
            fromLocationId: fromBus.location.id,
            toLocationId: toBus.location.id,
            busStopId: toBus.location.id,
        });
        totalMinutes += busRideMinutes;

        // Linger at arrival stop (1–2 mins)
        const lingerAtStop = 1 + (this.rnd() < 0.5 ? 0 : 1);
        segments.push({
            mode: "bus",
            kind: "bus_linger",
            minutes: lingerAtStop,
            locationId: toBus.location.id,
            busStopId: toBus.location.id,
            place: toBus.place || null,
        });
        totalMinutes += lingerAtStop;

        // Walking from stop to final target
        const walkFromPlan = this._buildWalkingPlanFromRoute(walkFromStopRoute);
        for (const seg of walkFromPlan.segments) {
            segments.push(seg);
            totalMinutes += seg.minutes;
        }

        return {
            totalMinutes,
            segments,
        };
    }

    /**
     * Find nearest location with a place whose key is "bus_stop" or "bus_station".
     */
    _findNearestBusStop(fromLocationId) {
        const world = this.world;
        const map = world && world.map;
        const locations = world && world.locations;
        if (!map || !locations) return null;

        const startId = String(fromLocationId);
        let best = null;
        let bestMinutes = Infinity;

        for (const loc of locations.values()) {
            const places = loc.places || [];
            for (const place of places) {
                if (!place) continue;
                const key = place.key;
                if (key !== "bus_stop" && key !== "bus_station") continue;

                const minutes = map.getTravelMinutes(startId, loc.id);
                if (!Number.isFinite(minutes)) continue;
                if (minutes < bestMinutes) {
                    bestMinutes = minutes;
                    best = { location: loc, place };
                }
            }
        }

        return best;
    }

    /**
     * Get environment/context at a given time.
     * This is intentionally defensive: if your world doesn't yet expose
     * weather/temperature/density, we fall back to sane defaults.
     */
    _getEnvironmentState(date) {
        const world = this.world || {};
        let weather = "clear";
        let temperature = 15;
        let density = 1;

        // Try a few possible hooks; you can adapt to your actual API
        if (typeof world.getEnvironmentAt === "function") {
            const env = world.getEnvironmentAt(date) || {};
            weather = env.weather || env.type || weather;
            if (typeof env.temperature === "number") temperature = env.temperature;
            if (typeof env.density === "number") density = env.density;
        } else if (typeof world.getWeatherAt === "function") {
            const env = world.getWeatherAt(date) || {};
            weather = env.weather || env.type || weather;
            if (typeof env.temperature === "number") temperature = env.temperature;
        } else if (world.weather) {
            const env = world.weather;
            weather = env.weather || env.type || weather;
            if (typeof env.temperature === "number") temperature = env.temperature;
        }

        if (world.map && typeof world.map.density === "number") {
            density = world.map.density;
        } else if (typeof world.density === "number") {
            density = world.density;
        }

        const hour = date.getHours();
        const isNight = hour >= 22 || hour < 6;

        const badWeather =
            typeof weather === "string" &&
            ["rain", "storm", "snow", "snowstorm", "hail"].some((w) =>
                weather.toLowerCase().includes(w)
            );

        const isCold = typeof temperature === "number" && temperature < 0;

        return { weather, temperature, density, badWeather, isCold, isNight };
    }

    // ---------------------------------------------------------------------
    // RULE PROBABILITY / PRIORITY
    // ---------------------------------------------------------------------

    /**
     * Returns true if this rule should be applied for this "consideration".
     * - If rule.probability is undefined/null => always true
     * - If <= 0 => never
     * - If >= 1 => always
     * - Else => true with that probability
     */
    _rulePassesProbability(rule) {
        if (!rule || rule.probability == null) return true;
        let p = Number(rule.probability);
        if (!Number.isFinite(p)) return true;
        if (p <= 0) return false;
        if (p >= 1) return true;
        return this.rnd() < p;
    }

    _priorityForRule(rule) {
        const t = rule && rule.type;
        const p = RULE_PRIORITY && RULE_PRIORITY[t];
        if (typeof p === "number") return p;
        switch (t) {
            case SCHEDULE_RULES.home:
                return 0;
            case SCHEDULE_RULES.random:
                return 1;
            case SCHEDULE_RULES.daily:
                return 2;
            case SCHEDULE_RULES.weekly:
                return 2;
            case SCHEDULE_RULES.fixed:
                return 3;
            default:
                return 4;
        }
    }

    _pickRandomTarget(targets) {
        if (!Array.isArray(targets) || !targets.length) return null;
        const idx = (this.rnd() * targets.length) | 0;
        return targets[idx];
    }

    // ---------------------------------------------------------------------
    // TARGET RESOLUTION (unified targets: type + candidates[])
    // ---------------------------------------------------------------------

    /**
     * Expand a single target into concrete (location, place) candidates.
     *
     * Unified target schema:
     *   - { type: TARGET_TYPE.home }
     *   - { type: TARGET_TYPE.placeKeys,      candidates: ["key1","key2", ...], nearest?: true }
     *   - { type: TARGET_TYPE.placeCategory, candidates: [PLACE_TAGS.*],        nearest?: true }
     *
     * Backwards compatibility also supports:
     *   - target.key / target.keys
     *   - target.categories
     *   - type TARGET_TYPE.placeKeys
     */
    _collectCandidatesForTarget({ npc, target, from, to, respectOpeningHours }) {
        if (!target || !this.world) return [];

        const isOpenForSpan = (place) => {
            if (!respectOpeningHours || !place || typeof place.isOpen !== "function") {
                return true;
            }
            const endCheck = new Date(to.getTime() - MS_PER_MINUTE);
            return place.isOpen(from) && place.isOpen(endCheck);
        };

        // --- Home target ---
        if (target.type === TARGET_TYPE.home) {
            const homeLoc = this._getHomeLocation(npc);
            if (!homeLoc) return [];
            return [{ location: homeLoc, place: null }];
        }

        const locations = this.world.locations || new Map();

        // Unified candidate list
        const baseCandidates = Array.isArray(target.candidates)
            ? target.candidates
            : target.candidates != null
            ? [target.candidates]
            : [];

        // Legacy key/category fields
        const legacyKeys =
            target.key != null
                ? [target.key]
                : Array.isArray(target.keys)
                ? target.keys
                : target.keys != null
                ? [target.keys]
                : [];

        const legacyCategories = Array.isArray(target.categories)
            ? target.categories
            : target.categories != null
            ? [target.categories]
            : [];

        let keysList = [];
        let categoryList = [];

        if (target.type === TARGET_TYPE.placeKeys || target.type === TARGET_TYPE.placeKeys) {
            keysList = baseCandidates.length ? baseCandidates : legacyKeys;
        } else if (target.type === TARGET_TYPE.placeCategory) {
            categoryList = baseCandidates.length ? baseCandidates : legacyCategories;
        }

        const isCandidatePlace = (place) => {
            if (!place) return false;

            if (target.type === TARGET_TYPE.placeKeys || target.type === TARGET_TYPE.placeKeys) {
                if (!keysList.length) return false;
                return keysList.includes(place.key);
            }

            if (target.type === TARGET_TYPE.placeCategory) {
                if (!categoryList.length) return false;
                const cat = place.props && place.props.category;
                if (!cat) return false;
                const cats = Array.isArray(cat) ? cat : [cat];
                return cats.some((c) => categoryList.includes(c));
            }

            return false;
        };

        const items = [];
        for (const loc of locations.values()) {
            const places = loc.places || [];
            for (const place of places) {
                if (!isCandidatePlace(place)) continue;
                if (!isOpenForSpan(place)) continue;
                items.push({ location: loc, place });
            }
        }

        // If nearest is requested, collapse to the nearest candidate
        if (target.nearest && items.length && this.world.map && npc && npc.homeLocationId) {
            const originId = String(npc.homeLocationId);
            let best = null;
            let bestMinutes = Infinity;
            for (const item of items) {
                const minutes = this.world.map.getTravelMinutes
                    ? this.world.map.getTravelMinutes(originId, item.location.id)
                    : 0;
                if (!Number.isFinite(minutes)) continue;
                if (minutes < bestMinutes) {
                    bestMinutes = minutes;
                    best = item;
                }
            }
            return best ? [best] : items;
        }

        return items;
    }

    /**
     * Flatten all rule.targets into concrete candidates and pick one uniformly,
     * weighted by number of actual options.
     */
    _pickLocationFromTargets({ npc, rule, from, to }) {
        const targets = Array.isArray(rule.targets) ? rule.targets : [];
        const respectOpeningHours = !!rule.respectOpeningHours;

        let allCandidates = [];
        for (const target of targets) {
            const candidatesForTarget = this._collectCandidatesForTarget({
                npc,
                target,
                from,
                to,
                respectOpeningHours,
            });
            if (candidatesForTarget && candidatesForTarget.length) {
                allCandidates = allCandidates.concat(candidatesForTarget);
            }
        }

        if (!allCandidates.length) return null;

        const idx = (this.rnd() * allCandidates.length) | 0;
        const chosen = allCandidates[idx];
        return {
            location: chosen.location,
            place: chosen.place || null,
        };
    }

    /**
     * Backwards compat: resolve a single target object using the same logic
     * as rule.targets.
     */
    _pickLocationForTarget({ npc, target, from, to, respectOpeningHours }) {
        const syntheticRule = {
            targets: target ? [target] : [],
            respectOpeningHours: !!respectOpeningHours,
        };
        return this._pickLocationFromTargets({ npc, rule: syntheticRule, from, to });
    }

    _getHomeLocation(npc) {
        if (!npc) return null;
        const locId = npc.homeLocationId;
        if (!locId || !this.world || !this.world.locations) return null;
        return this.world.locations.get(String(locId)) || null;
    }
}
