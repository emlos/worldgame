import {
    DAY_KEYS,
    TARGET_TYPE,
    SCHEDULE_RULES,
    RULE_PRIORITY,
    MS_PER_DAY,
    WeatherType,
} from "../../../data/data.js";

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;

// We build each week's timeline with a small lookahead past Monday 00:00.
// This prevents Sunday-night rules (that cross midnight) from being clipped,
// and gives us a deterministic "handoff" prefix for the next week's schedule.
//
// 12h is enough for typical "nightlife → sleep" patterns (e.g. 20:00–03:00 + travel),
// without swallowing too much of Monday's daytime schedule.
const ROLLOVER_BUFFER_MINUTES = 12 * 60;

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
        // cache: npcId -> weekKey -> {
        //   startDate, endDate,
        //   slots: slots clamped to [startDate, endDate)
        //   carrySlots: slots in [endDate, endDate + ROLLOVER_BUFFER)
        // }
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
        const base = this._weekStartForDate(weekStartDate);
        const weekKey = weekKeyFrom(base);

        let perNpc = this.cache.get(npcId);
        if (!perNpc) {
            perNpc = new Map();
            this.cache.set(npcId, perNpc);
        }
        const cached = perNpc.get(weekKey);
        if (cached) return cached.slots;

        // Seed week rollover from the previous cached week (if present).
        // We intentionally do NOT auto-generate the previous week here to avoid
        // recursive "generate all weeks back in time" cascades.
        const prevBase = new Date(base.getTime() - 7 * MS_PER_DAY);
        const prevKey = weekKeyFrom(prevBase);
        const prevCached = perNpc.get(prevKey) || null;
        const seedSlots = Array.isArray(prevCached?.carrySlots) ? prevCached.carrySlots : [];

        // If the previous week didn't have any carrySlots (common when the last slot ends exactly at Monday 00:00),
        // we still want to start the new week from the previous week's final location rather than "snap" to home.
        let seedState = null;
        if (
            (!seedSlots || !seedSlots.length) &&
            Array.isArray(prevCached?.slots) &&
            prevCached.slots.length
        ) {
            const last = prevCached.slots[prevCached.slots.length - 1];
            if (last) {
                if (last.activityType === "stay") {
                    seedState = { location: last.location || null, place: last.place || null };
                } else if (last.activityType === "travel") {
                    const toId = last.travelMeta?.toLocationId || null;
                    const loc =
                        (toId && this.world?.locations?.get(String(toId))) || last.location || null;
                    seedState = { location: loc, place: null };
                }
            }
        }

        const built = this._buildWeekSchedule(npc, base, { seedSlots, seedState });
        const slots = built.slots;

        perNpc.set(weekKey, {
            startDate: base,
            endDate: new Date(base.getTime() + 7 * MS_PER_DAY),
            slots,
            carrySlots: built.carrySlots || [],
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
        const limit = new Date(origin.getTime() + nextMinutes * MS_PER_MINUTE);

        const weekStart = this._weekStartForDate(origin);
        const weekEnd = new Date(weekStart.getTime() + 7 * MS_PER_DAY);

        // Search this week, and if the peek window crosses the boundary, also search next week.
        // This fixes Sunday-night peeks missing Monday-early rollover travel/home.
        const candidates = [];

        const thisWeekSlots = this.getWeekSchedule(npc, weekStart);
        if (Array.isArray(thisWeekSlots) && thisWeekSlots.length) {
            candidates.push(...thisWeekSlots);
        }

        if (limit > weekEnd) {
            const nextWeekStart = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
            const nextWeekSlots = this.getWeekSchedule(npc, nextWeekStart);
            if (Array.isArray(nextWeekSlots) && nextWeekSlots.length) {
                candidates.push(...nextWeekSlots);
            }
        }

        let best = null;
        for (const slot of candidates) {
            if (!slot) continue;
            if (slot.from <= origin) continue;
            if (slot.from > limit) continue;
            if (!best || slot.from < best.from) best = slot;
        }

        if (!best) {
            return { willMove: false, at: limit, nextSlot: null };
        }

        return { willMove: true, at: best.from, nextSlot: best };
    }

    // ---------------------------------------------------------------------
    // Internal: schedule construction
    // ---------------------------------------------------------------------

    _buildWeekSchedule(npc, weekStart, { seedSlots = [], seedState = null } = {}) {
        const template = npc.scheduleTemplate;
        const rules = template.rules;

        const weekStartMs = weekStart.getTime();
        const weekEndMs = weekStartMs + 7 * MS_PER_DAY;
        const horizonEndMs = weekEndMs + ROLLOVER_BUFFER_MINUTES * MS_PER_MINUTE;

        const allowedSeasons = template.season || [];

        if (allowedSeasons.length) {
            const env = this._getEnvironmentState(weekStart);
            const currentSeason = env.season;

            // If current season is not in the whitelist → no schedule at all.
            if (!allowedSeasons.includes(currentSeason)) {
                return { slots: [], carrySlots: [] };
            }
        }

        // 1) Generate intents for the week + small lookahead.
        const intents = this._generateIntentsForWeek(npc, weekStart, rules, {
            horizonEnd: new Date(horizonEndMs),
        });

        // 2) Build a continuous timeline from intents + travel, including lookahead.
        const horizonSlots = this._buildWeekTimelineFromIntents(
            npc,
            intents,
            weekStart,
            new Date(horizonEndMs),
            { seedSlots, seedState }
        );

        // 3) Clamp/slice into "this week" and "carryover".
        const clampRange = (slots, aMs, bMs) => {
            const out = [];
            for (const s of slots) {
                const fromMs = s.from.getTime();
                const toMs = s.to.getTime();
                if (toMs <= aMs) continue;
                if (fromMs >= bMs) continue;
                const from = new Date(Math.max(fromMs, aMs));
                const to = new Date(Math.min(toMs, bMs));
                if (to <= from) continue;
                out.push({ ...s, from, to });
            }
            out.sort((a, b) => a.from - b.from || a.to - b.to);
            return out;
        };

        const weekSlots = clampRange(horizonSlots, weekStartMs, weekEndMs);
        const carrySlots = clampRange(horizonSlots, weekEndMs, horizonEndMs);

        return { slots: weekSlots, carrySlots };
    }

    /**
     * Given any Date, return the local Monday 00:00 that starts its week.
     * Week is always Monday–Sunday, independent of the current client day.
     */
    _weekStartForDate(date) {
        const base = normalizeMidnight(date);
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

    _generateIntentsForWeek(npc, weekStart, rules, { horizonEnd = null } = {}) {
        const npcId = String(npc.id || npc.key || npc.name);
        const intents = [];

        const weekStartMs = weekStart.getTime();
        const horizonMs =
            (horizonEnd && horizonEnd.getTime && horizonEnd.getTime()) ||
            weekStartMs + 7 * MS_PER_DAY;
        // How many day "bases" we should generate per-day intents for.
        // Example: week + 12h rollover buffer => 8 day bases (Mon..next Mon).
        const dayCount = Math.max(7, Math.ceil((horizonMs - weekStartMs) / MS_PER_DAY));

        // First pass: per-day rules (home, fixed, random, daily)
        for (let dayOffset = 0; dayOffset < dayCount; dayOffset++) {
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
    _buildWeekTimelineFromIntents(
        npc,
        intents,
        weekStart,
        weekEnd,
        { seedSlots = [], seedState = null } = {}
    ) {
        const resolveIntentTarget = (intent) => {
            if (!intent) return;

            // Already resolved
            if (intent.location) return;

            // Deferred nearest choice
            if (intent.nearest && Array.isArray(intent.candidates) && intent.candidates.length) {
                const originLoc = currentLocation || homeLocation || null;
                const pick = this._pickNearestCandidate(intent.candidates, originLoc?.id);

                if (pick) {
                    intent.location = pick.location;
                    intent.place = pick.place || null;
                    return;
                }
            }

            // Worst-case fallback: go home
            if (!intent.location && homeLocation) {
                intent.location = homeLocation;
                intent.place = null;
            }
        };

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

        // Base start state:
        //   1) previous week's end state (seedState)
        //   2) NPC's persisted location (useful for tests/spawn)
        //   3) home
        let currentLocation =
            (seedState && seedState.location) ||
            (npc.locationId && this.world?.locations?.get(String(npc.locationId))) ||
            homeLocation ||
            null;
        let currentPlace = (seedState && seedState.place) || null;

        const clampToHorizon = (d) =>
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

        // If the previous week provided a carryover prefix, splice it in.
        if (Array.isArray(seedSlots) && seedSlots.length) {
            const usable = seedSlots
                .filter((s) => s && s.from && s.to)
                .map((s) => ({ ...s }))
                .filter((s) => {
                    const fromMs = new Date(s.from).getTime();
                    const toMs = new Date(s.to).getTime();
                    return toMs > weekStartMs && fromMs < weekEndMs;
                })
                .map((s) => {
                    const from = new Date(Math.max(new Date(s.from).getTime(), weekStartMs));
                    const to = new Date(Math.min(new Date(s.to).getTime(), weekEndMs));
                    return { ...s, npcId, from, to };
                })
                .filter((s) => s.to > s.from)
                .sort((a, b) => a.from - b.from || a.to - b.to);

            if (usable.length) {
                const first = usable[0];
                if (first.from.getTime() > weekStartMs && currentLocation) {
                    pushSlot(
                        new Date(weekStartMs),
                        first.from,
                        currentLocation,
                        currentPlace,
                        null,
                        null,
                        { activityType: "stay", isIdle: true }
                    );
                }
            }

            for (const s of usable) slots.push(s);

            const last = slots[slots.length - 1];
            if (last) {
                cursor = new Date(last.to.getTime());

                if (last.activityType === "stay") {
                    currentLocation = last.location || null;
                    currentPlace = last.place || null;
                } else if (last.activityType === "travel") {
                    const toId = last.travelMeta?.toLocationId || null;
                    currentLocation =
                        (toId && this.world?.locations?.get(String(toId))) ||
                        last.location ||
                        currentLocation ||
                        null;
                    currentPlace = null;
                }
            }
        }

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

            resolveIntentTarget(best);

            // ---- HOME SLOTS: try to be at home by windowStart (sleep starts at 'from') ----
            // Without this, "home" blocks like 03:00–10:00 can end up starting travel at 03:00,
            // which makes the NPC appear to arrive "late" for sleep.
            if (best.ruleType === SCHEDULE_RULES.home && cursor < best.windowStart) {
                const winStart = best.windowStart;
                const winEnd = best.windowEnd;

                // 1) First, see if leaving now would already be too late.
                let travelPlan = this._computeFastestTravelPlan(
                    npc,
                    currentLocation,
                    best.location,
                    cursor
                );
                let travelMinutes = travelPlan.minutes || 0;
                let arrivalIfLeaveNow = new Date(cursor.getTime() + travelMinutes * MS_PER_MINUTE);

                // 2) If we'd arrive after the home window starts, backtrack by shrinking previous stays.
                let safety = 0;
                while (arrivalIfLeaveNow > winStart && slots.length && safety < 30) {
                    const lastSlot = slots[slots.length - 1];
                    if (!lastSlot || lastSlot.activityType !== "stay") break;

                    const lastDur = minutesBetween(lastSlot.from, lastSlot.to);
                    if (lastDur <= 0) {
                        slots.pop();
                        continue;
                    }

                    const neededShiftMin = Math.ceil(
                        (arrivalIfLeaveNow.getTime() - winStart.getTime()) / MS_PER_MINUTE
                    );
                    const shrinkBy = Math.min(neededShiftMin, lastDur);

                    lastSlot.to = new Date(lastSlot.to.getTime() - shrinkBy * MS_PER_MINUTE);
                    cursor = new Date(cursor.getTime() - shrinkBy * MS_PER_MINUTE);

                    if (lastSlot.to <= lastSlot.from) {
                        slots.pop();
                        const prev = slots[slots.length - 1];
                        if (prev && prev.activityType === "stay") {
                            currentLocation = prev.location;
                            currentPlace = prev.place || null;
                        } else {
                            currentLocation = homeLocation || currentLocation || null;
                            currentPlace = null;
                        }
                    }

                    travelPlan = this._computeFastestTravelPlan(
                        npc,
                        currentLocation,
                        best.location,
                        cursor
                    );
                    travelMinutes = travelPlan.minutes || 0;
                    arrivalIfLeaveNow = new Date(cursor.getTime() + travelMinutes * MS_PER_MINUTE);
                    safety++;
                }

                // 3) If leaving now is early enough, delay departure so arrival is ~winStart.
                // Use a short fixed-point iteration because bus waits can change with departure time.
                let depart = new Date(cursor.getTime());
                if (arrivalIfLeaveNow <= winStart) {
                    let candidate = new Date(winStart.getTime() - travelMinutes * MS_PER_MINUTE);
                    if (candidate > cursor) {
                        depart = candidate;
                        for (let i = 0; i < 3; i++) {
                            const plan = this._computeFastestTravelPlan(
                                npc,
                                currentLocation,
                                best.location,
                                depart
                            );
                            const mins = plan.minutes || 0;
                            const nextCandidate = new Date(
                                winStart.getTime() - mins * MS_PER_MINUTE
                            );
                            travelPlan = plan;
                            travelMinutes = mins;
                            if (nextCandidate <= cursor) {
                                depart = new Date(cursor.getTime());
                                break;
                            }
                            if (Math.abs(nextCandidate.getTime() - depart.getTime()) < 60 * 1000) {
                                depart = nextCandidate;
                                break;
                            }
                            depart = nextCandidate;
                        }
                    }
                }

                // Fill the idle gap up to departure, if any.
                if (depart > cursor) {
                    const lastSlot = slots[slots.length - 1];
                    if (
                        lastSlot &&
                        lastSlot.activityType === "stay" &&
                        lastSlot.to.getTime() === cursor.getTime() &&
                        lastSlot.locationId === (currentLocation && currentLocation.id) &&
                        lastSlot.placeId === (currentPlace && currentPlace.id)
                    ) {
                        lastSlot.to = depart;
                    } else if (currentLocation) {
                        pushSlot(cursor, depart, currentLocation, currentPlace, null, null, {
                            activityType: "stay",
                            isIdle: true,
                        });
                    }
                    cursor = depart;
                }

                // Emit travel segments starting at `cursor`.
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

                // Stay home until the end of the block (or horizon end).
                const stayFrom = clampToHorizon(arrival);
                const stayTo = clampToHorizon(winEnd);
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

                const idxHome = remaining.indexOf(best);
                if (idxHome >= 0) remaining.splice(idxHome, 1);
                continue;
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
                const stayFrom = clampToHorizon(arrival);
                const stayTo = clampToHorizon(winEnd);

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
                const gapEnd = clampToHorizon(bestAvailableStart);

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
            let travelPlan =
                best.ruleType === SCHEDULE_RULES.home
                    ? this._computeFastestTravelPlan(npc, currentLocation, best.location, cursor)
                    : this._computeTravelPlan(npc, currentLocation, best.location, cursor);

            let arrivalMs = cursor.getTime() + (travelPlan.minutes || 0) * MS_PER_MINUTE;
            const latestArrivalMs = winEnd.getTime() - best.minStay * MS_PER_MINUTE;

            // If we can't arrive in time:
            if (arrivalMs > latestArrivalMs) {
                if (best.ruleType !== SCHEDULE_RULES.home) {
                    // normal behavior: drop non-home intents that don't fit
                    const idxDrop = remaining.indexOf(best);
                    if (idxDrop >= 0) remaining.splice(idxDrop, 1);
                    continue;
                }

                // HOME behavior: trim previous "stay" time to leave earlier (like your fixed-slot backtracking)
                let safety = 0;
                while (arrivalMs > latestArrivalMs && slots.length && safety < 40) {
                    const lastSlot = slots[slots.length - 1];
                    if (!lastSlot || lastSlot.activityType !== "stay") break;

                    const lastDur = minutesBetween(lastSlot.from, lastSlot.to);
                    if (lastDur <= 0) {
                        slots.pop();
                        continue;
                    }

                    const neededShiftMin = Math.ceil((arrivalMs - latestArrivalMs) / MS_PER_MINUTE);
                    const shrinkBy = Math.min(neededShiftMin, lastDur);

                    lastSlot.to = new Date(lastSlot.to.getTime() - shrinkBy * MS_PER_MINUTE);
                    cursor = new Date(cursor.getTime() - shrinkBy * MS_PER_MINUTE);

                    // If collapsed, pop and restore currentLocation/currentPlace from previous slot
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

                    // Recompute fastest travel for the earlier departure
                    travelPlan = this._computeFastestTravelPlan(
                        npc,
                        currentLocation,
                        best.location,
                        cursor
                    );
                    arrivalMs = cursor.getTime() + (travelPlan.minutes || 0) * MS_PER_MINUTE;

                    safety++;
                }
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

            const fromStay = clampToHorizon(arrival);
            const toStay = clampToHorizon(leave);

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

        // Trailing fill: if we ran out of intents, keep the NPC somewhere until weekEnd.
        // This is the direct fix for "end-of-week gaps" where the NPC would otherwise
        // disappear for the remaining minutes.
        if (cursor < weekEnd) {
            const end = clampToHorizon(weekEnd);
            const loc = currentLocation || homeLocation || null;
            const place = loc === currentLocation ? currentPlace : null;

            if (loc && end > cursor) {
                const lastSlot = slots[slots.length - 1];
                if (
                    lastSlot &&
                    lastSlot.activityType === "stay" &&
                    lastSlot.to.getTime() === cursor.getTime() &&
                    lastSlot.locationId === loc.id &&
                    lastSlot.placeId === (place && place.id)
                ) {
                    lastSlot.to = end;
                } else {
                    pushSlot(cursor, end, loc, place, null, null, {
                        activityType: "stay",
                        isIdle: true,
                    });
                }
                cursor = end;
            }
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

        // walking speed modifier (only affects walking edges)
        const walkMult =
            typeof template.travelModifier === "number" && template.travelModifier > 0
                ? template.travelModifier
                : 1;

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
        const walkPlan = this._buildWalkingPlanFromRoute(walkRoute, walkMult);
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
                env,
                walkMult
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

        // Bus conditions:
        // useBus && (
        //   bad weather / cold / night
        //   OR pure walking time > bus time (including buses & walks)
        //   OR edges > 3 (scaled with density)
        // )
        let useBus = false;
        if (busCandidate) {
            const busTotal = busCandidate.totalMinutes; // waits + micro-stops
            const busEdgesCondition = edgesCount > densityScaledEdgeThreshold;

            // Compare against FULL walking time (including micro-lingers), not plain Dijkstra minutes.
            const busFasterThanWalk = busTotal < walkTotalMinutes;

            // If we "preferVehicle" (night/cold/badWeather), only allow bus when it's not meaningfully worse.
            const busNotMuchWorse = busTotal <= walkTotalMinutes + 3;

            const busEnvCondition = preferVehicle && busNotMuchWorse;

            if (busFasterThanWalk || busEnvCondition || busEdgesCondition) {
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

    _computeFastestTravelPlan(npc, currentLocation, targetLocation, departureTime) {
        const world = this.world;
        const map = world && world.map;
        const template = npc.scheduleTemplate || {};

        if (!map || !world.locations || !currentLocation || !targetLocation) {
            return { mode: "none", minutes: 0, segments: [] };
        }

        const fromId = String(currentLocation.id);
        const toId = String(targetLocation.id);
        if (!fromId || !toId || fromId === toId) {
            return { mode: "none", minutes: 0, segments: [] };
        }

        const walkRoute = map.getTravelTotal(fromId, toId);
        if (!walkRoute || !Number.isFinite(walkRoute.minutes)) {
            return { mode: "none", minutes: 0, segments: [] };
        }

        const walkMult =
            typeof template.travelModifier === "number" && template.travelModifier > 0
                ? template.travelModifier
                : 1;

        const walkPlan = this._buildWalkingPlanFromRoute(walkRoute, walkMult);
        let best = { mode: "walk", minutes: walkPlan.totalMinutes, segments: walkPlan.segments };

        if (template.useBus) {
            const env = this._getEnvironmentState(departureTime);
            const busCandidate = this._buildBusPlan(
                npc,
                currentLocation,
                targetLocation,
                departureTime,
                walkRoute,
                env,
                walkMult
            );
            if (busCandidate && busCandidate.totalMinutes < best.minutes) {
                best = {
                    mode: "bus",
                    minutes: busCandidate.totalMinutes,
                    segments: busCandidate.segments,
                };
            }
        }

        if (template.useCar) {
            const baseWalkMinutes = walkRoute.minutes;
            const carMinutes = Math.ceil(baseWalkMinutes * 0.4);
            if (Number.isFinite(carMinutes) && carMinutes >= 0 && carMinutes < best.minutes) {
                best = {
                    mode: "car",
                    minutes: carMinutes,
                    segments: [
                        {
                            mode: "car",
                            kind: "car_drive",
                            minutes: carMinutes,
                            fromLocationId: fromId,
                            toLocationId: toId,
                        },
                    ],
                };
            }
        }

        return best;
    }

    /**
     * Build a walking plan from a map route:
     * - travel along each edge (edge.minutes), scaled by travelModifier if present
     * - linger 1–2 minutes at each intermediate location (still travel, NOT scaled)
     */
    _buildWalkingPlanFromRoute(route, walkMult = 1) {
        const segments = [];
        let totalMinutes = 0;

        const locIds = route.locations || [];
        const edges = route.edges || [];

        for (let i = 0; i < edges.length; i++) {
            const fromId = String(locIds[i]);
            const toId = String(locIds[i + 1]);
            const edge = edges[i];
            const edgeMinutes = edge && typeof edge.minutes === "number" ? edge.minutes : 1;

            // NEW: apply travelModifier to walking *speed* (edges only)
            let effectiveEdgeMinutes = edgeMinutes;
            if (walkMult && walkMult !== 1) {
                effectiveEdgeMinutes = Math.max(1, Math.ceil(edgeMinutes * walkMult));
            }

            // Segment: moving along the edge
            segments.push({
                mode: "walk",
                kind: "walk_edge",
                minutes: effectiveEdgeMinutes,
                fromLocationId: fromId,
                toLocationId: toId,
            });
            totalMinutes += effectiveEdgeMinutes;

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
    _buildBusPlan(
        npc,
        currentLocation,
        targetLocation,
        departureTime,
        walkRoute,
        env,
        walkMult = 1 // NEW
    ) {
        const world = this.world;
        const map = world && world.map;
        if (!map || !world.locations) return null;

        const fromId = String(currentLocation.id);
        const toId = String(targetLocation.id);

        // 1) Find nearest bus stops to current and target
        const fromBus = this._findNearestBusStop(fromId);
        const toBus = this._findNearestBusStop(toId);

        if (!fromBus || !toBus) return null;

        // If origin and destination share the same bus stop, bus makes no sense.
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
        const travelMult = props.travelTimeMult;
        const busRideMinutes = Math.ceil(busBaseMinutes * travelMult);

        // Build walking plan to the stop first (with micro-lingers).
        const walkToPlan = this._buildWalkingPlanFromRoute(walkToStopRoute, walkMult);
        const walkToMinutes = walkToPlan.totalMinutes;

        // Compute arrival time *at the bus stop*.
        const departureMs = departureTime.getTime();
        const arrivalAtStopMs = departureMs + walkToMinutes * MS_PER_MINUTE;
        const arrivalAtStop = new Date(arrivalAtStopMs);

        // 2) Bus frequency and waiting time — align to arrivalAtStop, not departureTime.
        const freqDay = props.busFrequencyDay;
        const freqNight = props.busFrequencyNight;

        const hour = arrivalAtStop.getHours();
        const minute = arrivalAtStop.getMinutes();
        const minutesSinceMidnight = hour * 60 + minute;

        const hStop = arrivalAtStop.getHours();
        const isNightAtStop = hStop >= 22 || hStop < 6;
        const freq = isNightAtStop ? freqNight : freqDay;

        let waitMinutes = 0;
        if (freq > 0) {
            const mod = minutesSinceMidnight % freq;
            waitMinutes = mod === 0 ? 0 : freq - mod; // next bus aligned to 00:00
        }

        // 3) Build segments for schedule (including linger)
        const segments = [];
        let totalMinutes = 0;

        // Walking to stop (already computed)
        for (const seg of walkToPlan.segments) {
            segments.push(seg);
            totalMinutes += seg.minutes;
        }

        // Wait at bus stop — strictly on the 15/35 minute cycle.
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
        const walkFromPlan = this._buildWalkingPlanFromRoute(walkFromStopRoute, walkMult);
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
     */
    _getEnvironmentState(date) {
        const env = this.world.getEnvironmentAt(date);

        const { weather, temperature, density, season } = env;
        const hour = date.getHours();
        const isNight = hour >= 22 || hour < 6;

        const badWeather =
            typeof weather === "string" &&
            [WeatherType.RAIN, WeatherType.SNOW, WeatherType.STORM].some((w) =>
                weather.toLowerCase().includes(w)
            );

        const isCold = temperature < 0;

        return { weather, temperature, density, badWeather, isCold, isNight, season };
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
        if (p <= 0) return false;
        if (p >= 1) return true;
        return this.rnd() < p;
    }

    _priorityForRule(rule) {
        const t = rule && rule.type;
        const p = RULE_PRIORITY && RULE_PRIORITY[t];
        return p;
    }

    _pickRandomTarget(targets) {
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
            if (!respectOpeningHours || !place || typeof place.isOpen !== "function") return true;
            const endCheck = new Date(to.getTime() - MS_PER_MINUTE);
            return place.isOpen(from) && place.isOpen(endCheck);
        };

        if (target.type === TARGET_TYPE.home) {
            const homeLoc = this._getHomeLocation(npc);
            if (!homeLoc) return [];
            return [{ location: homeLoc, place: null }];
        }

        const locations = this.world.locations || new Map();

        const baseCandidates = Array.isArray(target.candidates)
            ? target.candidates
            : target.candidates != null
            ? [target.candidates]
            : [];

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

        if (target.type === TARGET_TYPE.placeKeys) {
            keysList = baseCandidates.length ? baseCandidates : legacyKeys;
        } else if (target.type === TARGET_TYPE.placeCategory) {
            categoryList = baseCandidates.length ? baseCandidates : legacyCategories;
        }

        const isCandidatePlace = (place) => {
            if (!place) return false;

            if (target.type === TARGET_TYPE.placeKeys) {
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

        // DO NOT collapse to nearest here.
        // defer "nearest" until scheduling time, when we know currentLocation.
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
        let wantsNearest = false;

        for (const target of targets) {
            if (target && target.nearest) wantsNearest = true;

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

        if (wantsNearest) {
            // Defer picking until timeline build (we need currentLocation there).
            return {
                location: null,
                place: null,
                candidates: allCandidates,
                nearest: true,
            };
        }

        const idx = (this.rnd() * allCandidates.length) | 0;
        const chosen = allCandidates[idx];
        return {
            location: chosen.location,
            place: chosen.place || null,
            candidates: null,
            nearest: false,
        };
    }

    _pickNearestCandidate(candidates, originLocationId) {
        if (!candidates || !candidates.length) return null;
        if (!this.world?.map || !originLocationId) {
            // fallback to random if we can’t compute distance
            return candidates[(this.rnd() * candidates.length) | 0] || null;
        }

        const originId = String(originLocationId);
        let best = null;
        let bestMinutes = Infinity;

        for (const item of candidates) {
            const locId = item?.location?.id;
            if (!locId) continue;

            const minutes = this.world.map.getTravelMinutes
                ? this.world.map.getTravelMinutes(originId, locId)
                : NaN;

            if (!Number.isFinite(minutes)) continue;

            if (minutes < bestMinutes) {
                bestMinutes = minutes;
                best = item;
            } else if (minutes === bestMinutes && this.rnd() < 0.5) {
                // tie-break
                best = item;
            }
        }

        return best || candidates[(this.rnd() * candidates.length) | 0] || null;
    }

    _getHomeLocation(npc) {
        if (!npc) return null;
        const locId = npc.homeLocationId;
        if (!locId || !this.world || !this.world.locations) return null;
        return this.world.locations.get(String(locId)) || null;
    }
}
