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
 */
function ruleAppliesOnDay(rule, dayInfo, dayKey) {
    const { dayKinds, daysOfWeek, candidateDays } = rule || {};
    const kinds = Array.isArray(dayKinds) ? dayKinds : dayKinds ? [dayKinds] : null;

    if (kinds && kinds.length && !kinds.includes(dayInfo.kind)) return false;

    const dows =
        (Array.isArray(candidateDays) && candidateDays.length && candidateDays) ||
        (Array.isArray(daysOfWeek) && daysOfWeek.length && daysOfWeek) ||
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

        console.log(slots);
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

        // For now, use the week starting at the day of "origin"
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
        const proposed = [];

        // --- Generate from home/fixed/random rules on a per-day basis ---
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const dayDate = new Date(weekStartMs + dayOffset * MS_PER_DAY);
            const dayInfo = this.world.getDayInfo(dayDate);
            const dow = dayDate.getDay(); // 0=Sun
            const dayKey = DAY_KEYS[dow];

            for (const rule of rules) {
                if (!rule || !rule.type) continue;

                // weekly rules handled separately
                if (rule.type === SCHEDULE_RULES.weekly) continue;

                // Day filters (home ignores them by design)
                if (!ruleAppliesOnDay(rule, dayInfo, dayKey) && rule.type !== SCHEDULE_RULES.home) {
                    continue;
                }

                // Probability gating: per day, per rule
                if (!this._rulePassesProbability(rule)) {
                    continue;
                }

                switch (rule.type) {
                    case SCHEDULE_RULES.home:
                        this._generateHomeSlotsForDay({
                            npc,
                            npcId,
                            dayDate,
                            rule,
                            proposed,
                        });
                        break;

                    case SCHEDULE_RULES.fixed:
                        this._generateFixedSlotsForDay({
                            npc,
                            npcId,
                            dayDate,
                            rule,
                            proposed,
                        });
                        break;

                    case SCHEDULE_RULES.random:
                        this._generateRandomSlotsForDay({
                            npc,
                            npcId,
                            dayDate,
                            rule,
                            proposed,
                        });
                        break;

                    case SCHEDULE_RULES.daily:
                        this._generateDailySlotsForDay({
                            npc,
                            npcId,
                            dayDate,
                            rule,
                            proposed,
                        });
                        break;

                    default:
                        // ignore follow/unknown for now
                        break;
                }
            }
        }

        // --- Weekly (once per week) rules ---
        for (const rule of rules) {
            if (!rule || rule.type !== SCHEDULE_RULES.weekly) continue;

            // Probability gating: once per week
            if (!this._rulePassesProbability(rule)) continue;

            this._generateWeeklySlotsForWeek({
                npc,
                npcId,
                weekStart,
                rule,
                proposed,
            });
        }

        // --- Merge & resolve overlaps via priority ---
        const merged = this._mergeSlotsByPriority(proposed, weekStart, weekEndMs);

        return merged;
    }

    _generateHomeSlotsForDay({ npc, npcId, dayDate, rule, proposed }) {
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

            const from = new Date(dayDate.getTime() + fromM * MS_PER_MINUTE);
            const to = new Date(dayDate.getTime() + toM * MS_PER_MINUTE);

            proposed.push({
                npcId,
                from,
                to,
                location: homeLocation,
                locationId: homeLocation.id,
                place: null,
                placeId: null,
                target: homeLocation,
                sourceRuleId: rule.id || null,
                ruleType: rule.type,
                priority,
            });
        }
    }

    _generateFixedSlotsForDay({ npc, npcId, dayDate, rule, proposed }) {
        const time = rule.time;
        if (!time || !time.from || !time.to) return;
        const { start, end } = makeWindowRange(dayDate, time);
        const priority = this._priorityForRule(rule);

        const locInfo = this._pickLocationForTarget({
            npc,
            target: rule.target,
            from: start,
            to: end,
            respectOpeningHours: !!rule.respectOpeningHours,
        });
        if (!locInfo) return;

        proposed.push({
            npcId,
            from: start,
            to: end,
            location: locInfo.location,
            locationId: locInfo.location.id,
            place: locInfo.place || null,
            placeId: locInfo.place ? locInfo.place.id : null,
            target: locInfo.location,
            sourceRuleId: rule.id || null,
            ruleType: rule.type,
            priority,
        });
    }

    _generateRandomSlotsForDay({ npc, npcId, dayDate, rule, proposed }) {
        const window = rule.window;
        const stay = rule.stayMinutes || {};
        const minStay = Math.max(1, Number(stay.min) || 30);
        const maxStay = Math.max(minStay, Number(stay.max) || minStay);
        if (!window || !window.from || !window.to) return;

        const { start: windowStart, end: windowEnd } = makeWindowRange(dayDate, window);
        const totalWindowMinutes = minutesBetween(windowStart, windowEnd);
        if (totalWindowMinutes <= 0) return;

        const priority = this._priorityForRule(rule);

        let cursor = new Date(windowStart.getTime());
        let lastLocInfo = null;

        // Fill the entire window [windowStart, windowEnd) with back-to-back slots
        while (cursor < windowEnd) {
            const remaining = Math.floor(minutesBetween(cursor, windowEnd));
            if (remaining <= 0) break;

            // For the last chunk, we allow it to be shorter than minStay
            const minForThis = Math.min(minStay, remaining);
            const maxForThis = Math.min(maxStay, remaining);

            const span = minForThis + Math.floor(this.rnd() * (maxForThis - minForThis + 1));
            const slotEnd = new Date(cursor.getTime() + span * MS_PER_MINUTE);

            const locInfo = this._pickLocationForRandomRule({
                npc,
                rule,
                from: cursor,
                to: slotEnd,
                previousLocInfo: lastLocInfo,
            });

            // Extremely defensive: if we REALLY can't find anything, bail out to avoid infinite loop.
            if (!locInfo) break;

            const location = locInfo.location;
            const place = locInfo.place || null;

            proposed.push({
                npcId,
                from: cursor,
                to: slotEnd,
                location,
                locationId: location.id,
                place,
                placeId: place ? place.id : null,
                target: location,
                sourceRuleId: rule.id || null,
                ruleType: rule.type,
                priority,
            });

            lastLocInfo = locInfo;
            cursor = slotEnd;
        }
    }

    _generateDailySlotsForDay({ npc, npcId, dayDate, rule, proposed }) {
        const stay = rule.stayMinutes || {};
        const minStay = Math.max(1, Number(stay.min) || 30);
        const maxStay = Math.max(minStay, Number(stay.max) || minStay);

        if (!rule.time || !rule.time.from || !rule.time.to) return;

        const { start: windowStart, end: windowEnd } = makeWindowRange(dayDate, rule.time);
        const windowMinutes = minutesBetween(windowStart, windowEnd);
        if (windowMinutes <= minStay) return;

        const maxDur = Math.min(maxStay, windowMinutes);
        const duration = minStay + Math.floor(this.rnd() * (maxDur - minStay + 1));

        const latestStartOffset = windowMinutes - duration;
        const startOffset =
            latestStartOffset > 0 ? Math.floor(this.rnd() * (latestStartOffset + 1)) : 0;

        const from = new Date(windowStart.getTime() + startOffset * MS_PER_MINUTE);
        const to = new Date(from.getTime() + duration * MS_PER_MINUTE);

        const locInfo = this._pickLocationForTarget({
            npc,
            target: rule.target,
            from,
            to,
            respectOpeningHours: !!rule.respectOpeningHours,
        });
        if (!locInfo) return;

        const priority = this._priorityForRule(rule);

        proposed.push({
            npcId,
            from,
            to,
            location: locInfo.location,
            locationId: locInfo.location.id,
            place: locInfo.place || null,
            placeId: locInfo.place ? locInfo.place.id : null,
            target: locInfo.location,
            sourceRuleId: rule.id || null,
            ruleType: rule.type,
            priority,
        });
    }

    /**
     * For random rules: pick a valid location for [from,to) by
     * expanding ALL targets into their concrete candidate places,
     * then choosing one uniformly from that combined list.
     *
     * This means:
     *   - "home" contributes 1 option
     *   - a category with 10 matching places contributes 10 options
     * So "go out" naturally wins over "stay home" if there are many places.
     */
    _pickLocationForRandomRule({ npc, rule, from, to, previousLocInfo }) {
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

        // If we have any candidates at all, pick one uniformly
        if (allCandidates.length) {
            const idx = (this.rnd() * allCandidates.length) | 0;
            const chosen = allCandidates[idx];
            return {
                location: chosen.location,
                place: chosen.place || null,
            };
        }

        // --- Fallbacks if *nothing* is open / available ---

        // 1. Home
        const homeLoc = this._getHomeLocation(npc);
        if (homeLoc) {
            return { location: homeLoc, place: null };
        }

        // 2. Previous location in this window
        if (previousLocInfo && previousLocInfo.location) {
            return previousLocInfo;
        }

        // 3. Any location on the map (last resort)
        if (this.world && this.world.locations && this.world.locations.size) {
            const first = this.world.locations.values().next().value;
            if (first) {
                return { location: first, place: null };
            }
        }

        // Truly nothing
        return null;
    }

    _generateWeeklySlotsForWeek({ npc, npcId, weekStart, rule, proposed }) {
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
        if (!rule.time || !rule.time.from || !rule.time.to) return;
        const { start: windowStart, end: windowEnd } = makeWindowRange(dayDate, rule.time);
        const windowMinutes = minutesBetween(windowStart, windowEnd);
        if (windowMinutes <= minStay) return;

        const maxDur = Math.min(maxStay, windowMinutes);
        const duration = minStay + Math.floor(this.rnd() * (maxDur - minStay + 1));
        const latestStartOffset = windowMinutes - duration;
        const startOffset =
            latestStartOffset > 0 ? Math.floor(this.rnd() * (latestStartOffset + 1)) : 0;

        const from = new Date(windowStart.getTime() + startOffset * MS_PER_MINUTE);
        const to = new Date(from.getTime() + duration * MS_PER_MINUTE);

        const locInfo = this._pickLocationForTarget({
            npc,
            target: rule.target,
            from,
            to,
            respectOpeningHours: !!rule.respectOpeningHours,
        });
        if (!locInfo) return;

        const priority = this._priorityForRule(rule);

        proposed.push({
            npcId,
            from,
            to,
            location: locInfo.location,
            locationId: locInfo.location.id,
            place: locInfo.place || null,
            placeId: locInfo.place ? locInfo.place.id : null,
            target: locInfo.location,
            sourceRuleId: rule.id || null,
            ruleType: rule.type,
            priority,
        });
    }

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

        const categories = Array.isArray(target.categories)
            ? target.categories
            : target.categories
            ? [target.categories]
            : [];

        const keysList = Array.isArray(target.keys)
            ? target.keys
            : target.keys
            ? [target.keys]
            : [];

        const isCandidatePlace = (place) => {
            if (!place) return false;

            if (target.type === "placeKey") {
                return place.key === target.key;
            }

            if (target.type === "placeKeys") {
                if (!keysList.length) return false;
                return keysList.includes(place.key);
            }

            if (target.type === "placeCategory") {
                const cat = place.props && place.props.category;
                if (!cat) return false;
                const cats = Array.isArray(cat) ? cat : [cat];
                return categories.some((c) => cats.includes(c));
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
     * Resolve a rule target (home, placeKey, placeCategory) to a concrete Location / Place.
     *
     * For now, "nearest" is computed relative to the NPC's home location.
     * (We’re ignoring travel time along the route, as requested.)
     */
    _pickLocationForTarget({ npc, target, from, to, respectOpeningHours }) {
        const candidates = this._collectCandidatesForTarget({
            npc,
            target,
            from,
            to,
            respectOpeningHours,
        });
        if (!candidates.length) return null;
        const idx = (this.rnd() * candidates.length) | 0;
        const chosen = candidates[idx];
        return {
            location: chosen.location,
            place: chosen.place || null,
        };
    }

    _getHomeLocation(npc) {
        if (!npc) return null;
        const locId = npc.homeLocationId;
        if (!locId || !this.world || !this.world.locations) return null;
        return this.world.locations.get(String(locId)) || null;
    }

    /**
     * Merge overlapping slots by picking the highest-priority rule
     * for each minute of the week.
     *
     * Output slots are normalized to:
     * {
     *   npcId,
     *   from: Date,
     *   to: Date,
     *   target: Location,
     *   location: Location,
     *   locationId: string,
     *   place: Place|null,
     *   placeId: string|null,
     *   sourceRuleId: string|null,
     *   ruleType: SCHEDULE_RULES.*
     * }
     */
    _mergeSlotsByPriority(proposed, weekStart, weekEndMs) {
        if (!proposed.length) return [];

        const startMs = weekStart.getTime();
        const endMs = weekEndMs;
        const totalMinutes = Math.max(0, Math.round((endMs - startMs) / MS_PER_MINUTE));
        const owner = new Array(totalMinutes).fill(-1);

        // normalize & clamp each proposed slot to [weekStart, weekEnd)
        const normSlots = proposed
            .map((s, idx) => {
                const fromMs = Math.max(startMs, s.from.getTime());
                const toMs = Math.min(endMs, s.to.getTime());
                return { slot: s, idx, fromMs, toMs };
            })
            .filter((x) => x.toMs > x.fromMs);

        // cheap map from idx -> priority for lookups
        const priorityByIdx = new Map();
        for (const ns of normSlots) {
            priorityByIdx.set(ns.idx, ns.slot.priority || 0);
        }

        for (const { slot, idx, fromMs, toMs } of normSlots) {
            const startMin = Math.floor((fromMs - startMs) / MS_PER_MINUTE);
            const endMin = Math.ceil((toMs - startMs) / MS_PER_MINUTE);
            const pri = typeof slot.priority === "number" ? slot.priority : 0;

            for (let m = startMin; m < endMin && m < totalMinutes; m++) {
                if (m < 0) continue;
                const curIdx = owner[m];
                if (curIdx === -1) {
                    owner[m] = idx;
                } else {
                    const curPri =
                        priorityByIdx.get(curIdx) != null ? priorityByIdx.get(curIdx) : 0;
                    if (pri > curPri) owner[m] = idx;
                }
            }
        }

        const result = [];
        let currentIdx = owner[0];
        let segmentStartMin = 0;

        const flushSegment = (endMin) => {
            if (currentIdx == null || currentIdx === -1) return;
            const base = proposed[currentIdx];
            const from = new Date(startMs + segmentStartMin * MS_PER_MINUTE);
            const to = new Date(startMs + endMin * MS_PER_MINUTE);
            result.push({
                npcId: base.npcId,
                from,
                to,
                target: base.target,
                location: base.location,
                locationId: base.locationId,
                place: base.place || null,
                placeId: base.placeId || null,
                sourceRuleId: base.sourceRuleId || null,
                ruleType: base.ruleType,
            });
        };

        for (let m = 1; m < totalMinutes; m++) {
            const idxAtM = owner[m];
            if (idxAtM !== currentIdx) {
                flushSegment(m);
                currentIdx = idxAtM;
                segmentStartMin = m;
            }
        }
        flushSegment(totalMinutes);

        // sort by start time ascending
        result.sort((a, b) => a.from - b.from || a.to - b.to);
        return result;
    }
}
