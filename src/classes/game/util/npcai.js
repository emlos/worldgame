// worldgame/src/classes/game/util/npcai.js
import {
    DAY_KEYS,
    DayKind,
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
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
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
        const base = normalizeMidnight(weekStartDate || this.world.time.date);
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
        const weekStart = normalizeMidnight(this.world.time.date);
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

        const weekStart = normalizeMidnight(origin);
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

        // 2) Build a continuous week-long timeline from intents,
        //    sequentially, filling gaps with home/idle.
        const slots = this._buildWeekTimelineFromIntents(
            npc,
            intents,
            weekStart,
            new Date(weekEndMs)
        );

        return slots;
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
                id: `${npcId}:${rule.id || "home"}:${start.toISOString()}`,
                npcId,
                ruleId: rule.id || null,
                ruleType: rule.type,
                priority,
                windowStart: start,
                windowEnd: end,
                minStay: durMinutes,
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

        // Decide how many visits this random rule *intends* per day.
        // Heuristic: try to roughly fill the window with a handful of visits.
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
    // TIMELINE BUILDING (NO TRAVEL YET)
    // ---------------------------------------------------------------------

    /**
     * Build a continuous, non-overlapping week timeline from visit intents.
     * Currently:
     *   - Travel time is assumed 0 minutes (TODO: integrate map + bus later).
     *   - Any gap is filled with "home" (or "stay at current location" if no home).
     *   - Intents that cannot fit their minStay in their window at the time
     *     they're considered are skipped (not truncated).
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

        const clampToWeek = (d) =>
            new Date(Math.min(Math.max(d.getTime(), weekStartMs), weekEndMs));

        const pushSlot = (from, to, location, place, sourceRuleId, ruleType) => {
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
            });
        };

        // Fill gaps with home (or "stay where you are")
        const fillGapWithHome = (from, to) => {
            if (to <= from) return;
            const loc = homeLocation || currentLocation;
            if (!loc) return;
            pushSlot(from, to, loc, null, "auto_home_gap_fill", SCHEDULE_RULES.home);
            currentLocation = loc;
        };

        while (cursor < weekEnd) {
            // Try to find the best intent we can schedule starting at or after `cursor`
            let best = null;
            let bestAvailableStart = null;

            for (const intent of remaining) {
                const winStart = intent.windowStart;
                const winEnd = intent.windowEnd;

                if (winEnd <= cursor) continue; // window already passed
                if (winStart >= weekEnd) continue;

                const earliest = cursor > winStart ? cursor : winStart;

                // Can we fit at least minStay inside [earliest, winEnd]?
                if (earliest.getTime() + intent.minStay * MS_PER_MINUTE > winEnd.getTime()) {
                    continue;
                }

                if (!best) {
                    best = intent;
                    bestAvailableStart = earliest;
                } else {
                    // Prefer earlier availableStart; tie-break by higher priority
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
                // No more schedulable intents; fill the rest with home and stop
                if (cursor < weekEnd) {
                    fillGapWithHome(cursor, weekEnd);
                }
                break;
            }

            // If there's a gap before this intent's earliest start, fill with home
            if (bestAvailableStart > cursor) {
                const gapEnd = clampToWeek(bestAvailableStart);
                fillGapWithHome(cursor, gapEnd);
                cursor = gapEnd;
                if (cursor >= weekEnd) break;
            }

            // At this point, cursor == bestAvailableStart (or very close)
            const winEnd = best.windowEnd;

            // TODO: integrate travel time here later. For now, 0 minutes.
            // Example later:
            // const travelMinutes = this._computeTravelMinutes(currentLocation, best.location, cursor);
            // const arrival = new Date(cursor.getTime() + travelMinutes * MS_PER_MINUTE);
            const arrival = new Date(cursor.getTime());

            // Check again with arrival in case travel pushes us
            if (arrival.getTime() + best.minStay * MS_PER_MINUTE > winEnd.getTime()) {
                // Can't fit this intent; drop it and continue
                const idx = remaining.indexOf(best);
                if (idx >= 0) remaining.splice(idx, 1);
                continue;
            }

            // Determine stay duration
            const maxPossibleStay = Math.min(best.maxStay, minutesBetween(arrival, winEnd));
            if (maxPossibleStay < best.minStay) {
                // Shouldn't happen given earlier checks, but be safe
                const idx = remaining.indexOf(best);
                if (idx >= 0) remaining.splice(idx, 1);
                continue;
            }

            const staySpan =
                best.minStay + Math.floor(this.rnd() * (maxPossibleStay - best.minStay + 1));
            const leave = new Date(arrival.getTime() + staySpan * MS_PER_MINUTE);

            const from = clampToWeek(arrival);
            const to = clampToWeek(leave);

            pushSlot(from, to, best.location, best.place, best.ruleId, best.ruleType);
            currentLocation = best.location;
            cursor = to;

            // Remove the intent now that it's consumed
            const idx = remaining.indexOf(best);
            if (idx >= 0) remaining.splice(idx, 1);
        }

        // Ensure sorted by time
        slots.sort((a, b) => a.from - b.from || a.to - b.to);
        return slots;
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
     *   - { type: "home" }
     *   - { type: "placeKey",      candidates: ["key1","key2", ...], nearest?: true }
     *   - { type: "placeCategory", candidates: [PLACE_TAGS.*],        nearest?: true }
     *
     * Backwards compatibility also supports:
     *   - target.key / target.keys
     *   - target.categories
     *   - type "placeKeys"
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
        if (target.type === "home") {
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

        if (target.type === "placeKey" || target.type === "placeKeys") {
            keysList = baseCandidates.length ? baseCandidates : legacyKeys;
        } else if (target.type === "placeCategory") {
            categoryList = baseCandidates.length ? baseCandidates : legacyCategories;
        }

        const isCandidatePlace = (place) => {
            if (!place) return false;

            if (target.type === "placeKey" || target.type === "placeKeys") {
                if (!keysList.length) return false;
                return keysList.includes(place.key);
            }

            if (target.type === "placeCategory") {
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
