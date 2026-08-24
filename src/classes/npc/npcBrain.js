import { parseTimeToMinutes } from "../../shared/util/date.js";
import { deriveSeed, makeRNG, randInt, weightedPick } from "../../shared/util/random.js";
import { GOAL_TYPE, TARGET_TYPE, NPC_ACTION_TYPE } from "../../data/npc/behavior.js";
import { DAY_KEYS, MS_PER_MINUTE, MS_PER_DAY } from "../../data/world/time.js";

const EPSILON_MS = 1;
const MAX_DECISIONS_PER_UPDATE = 100_000;

function asDate(value) {
    if (value instanceof Date) return new Date(value.getTime());
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function cloneData(value) {
    if (value == null || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
}

function utcDayStart(date, dayOffset = 0) {
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + dayOffset),
    );
}

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * MS_PER_MINUTE);
}

function minDate(...dates) {
    let best = null;
    for (const date of dates) {
        if (!(date instanceof Date) || !Number.isFinite(date.getTime())) continue;
        if (!best || date < best) best = date;
    }
    return best;
}

function categoriesOf(place) {
    const category = place?.props?.category;
    if (Array.isArray(category)) return category;
    return category == null ? [] : [category];
}

function ruleWeight(rule) {
    if (rule?.weight == null) return 1;

    const weight = Number(rule.weight);
    if (!Number.isFinite(weight) || weight < 0) {
        throw new TypeError(`Invalid NPC goal weight: ${rule.weight}`);
    }
    return weight;
}

function descriptorMatchesPlace(descriptor, place) {
    if (!descriptor || !place) return false;

    if (descriptor.type === TARGET_TYPE.placeKeys) {
        const candidates = Array.isArray(descriptor.candidates) ? descriptor.candidates : [];
        return candidates.includes(place.key);
    }

    if (descriptor.type === TARGET_TYPE.placeCategory) {
        const candidates = Array.isArray(descriptor.candidates) ? descriptor.candidates : [];
        return categoriesOf(place).some((category) => candidates.includes(category));
    }

    return false;
}

export class NPCBrain {
    constructor(npc, behavior = null) {
        this.npc = npc;
        this.behavior = behavior || { goals: [] };
        this._fallbackRng = makeRNG();
        this._rngOverride = null;

        this.currentGoal = null;
        this.currentAction = null;
        this.nextDecisionAt = null;
        this.lastUpdatedAt = null;
    }

    _rng(game) {
        return (
            this._rngOverride ??
            game?.getRNG?.(`npc:${this.npc?.id ?? "unknown"}`) ??
            this._fallbackRng
        );
    }

    get rules() {
        return Array.isArray(this.behavior?.goals) ? this.behavior.goals : [];
    }

    initialize(game, at = game?.now) {
        const now = asDate(at);
        if (!now) return;
        if (this.lastUpdatedAt) return;

        // A supplied game start is an absolute world snapshot, not the moment
        // every NPC wakes up at home. Reconstruct the schedule state that should
        // already exist at that timestamp.
        return this.resyncAt(now, game);
    }

    /**
     * Reconstruct a coherent NPC snapshot at an absolute date without replaying
     * every skipped decision. Random choices are keyed to the destination and do
     * not consume the NPC's normal sequential RNG stream.
     */
    resyncAt(at, game) {
        const targetDate = asDate(at);
        if (!targetDate) throw new Error(`Invalid NPC resync date: ${at}`);

        // Historical micro-state is intentionally discarded. Home is the stable
        // anchor used to calculate the schedule and any pre-obligation travel.
        if (this.npc.homeLocationId != null) {
            this.npc.setLocationAndPlace(this.npc.homeLocationId, this.npc.homePlaceId ?? null);
        }
        this.currentGoal = null;
        this.currentAction = null;
        this.nextDecisionAt = null;
        this.lastUpdatedAt = targetDate;

        const candidates = this._getDecisionCandidates(targetDate, game);
        const bestPriority = candidates.length
            ? Math.max(...candidates.map((candidate) => candidate.priority))
            : -Infinity;
        let remaining = candidates.filter((candidate) => candidate.priority === bestPriority);
        const signature = remaining
            .map(
                (candidate) =>
                    `${candidate.rule.id}@${candidate.interval.start.toISOString()}-${candidate.interval.end.toISOString()}`,
            )
            .sort()
            .join("|");
        const jumpSeed = deriveSeed(
            game?.seed ?? 0,
            `npc-resync:${this.npc?.id ?? "unknown"}:${signature || targetDate.toISOString()}`,
        );

        this._rngOverride = makeRNG(jumpSeed);
        try {
            let selected = null;
            let resolvedTarget = null;

            while (remaining.length && !resolvedTarget) {
                selected = weightedPick(remaining, this._rng(game), (candidate) => candidate.weight);
                if (!selected) break;
                resolvedTarget =
                    selected.target ||
                    this._resolveTarget(selected.rule, targetDate, game, {
                        deterministic: selected.rule.type === GOAL_TYPE.obligation,
                    });
                if (!resolvedTarget) {
                    remaining = remaining.filter((candidate) => candidate !== selected);
                    selected = null;
                }
            }

            if (!selected || !resolvedTarget) {
                this.currentAction = {
                    type: NPC_ACTION_TYPE.idle,
                    startedAt: targetDate.toISOString(),
                };
            } else if (selected.interval.start > targetDate) {
                // The NPC is already en route to an upcoming obligation. Rebuild
                // that travel from its calculated departure and advance it only
                // to the destination timestamp.
                const travelMinutes = Math.max(0, Number(resolvedTarget.travelMinutes) || 0);
                const departureAt = addMinutes(selected.interval.start, -travelMinutes);
                this._startGoal({ ...selected, target: resolvedTarget }, departureAt, game);
                this._advanceActionTo(targetDate);
            } else {
                // An active schedule window means the NPC is already at its
                // destination; skipped travel is not replayed.
                this.npc.setLocationAndPlace(
                    resolvedTarget.locationId,
                    resolvedTarget.placeId ?? null,
                );
                this._startGoal({ ...selected, target: resolvedTarget }, targetDate, game);
            }

            if (!this.currentAction) {
                this.currentGoal = null;
                this.currentAction = {
                    type: NPC_ACTION_TYPE.idle,
                    startedAt: targetDate.toISOString(),
                };
            }
            this._scheduleNextWake(targetDate, game);
        } finally {
            this._rngOverride = null;
        }

        this.lastUpdatedAt = targetDate;
        return this.toJSON();
    }

    updateTo(at, game) {
        const target = asDate(at);
        if (!target) return;

        if (!this.lastUpdatedAt) {
            this.initialize(game, target);
            return;
        }

        if (target < this.lastUpdatedAt) {
            this.lastUpdatedAt = target;
            this.nextDecisionAt = target;
            return;
        }

        let decisions = 0;
        while (this.nextDecisionAt && this.nextDecisionAt.getTime() <= target.getTime()) {
            if (decisions >= MAX_DECISIONS_PER_UPDATE) {
                throw new Error(
                    `NPCBrain decision loop exceeded ${MAX_DECISIONS_PER_UPDATE} decisions for '${this.npc?.id}'`,
                );
            }

            const decisionAt = new Date(this.nextDecisionAt.getTime());
            this._advanceActionTo(decisionAt);
            this.lastUpdatedAt = decisionAt;
            this._completeActionIfDue(decisionAt);
            this._decideAt(decisionAt, game);
            decisions++;

            if (this.nextDecisionAt && this.nextDecisionAt.getTime() <= decisionAt.getTime()) {
                throw new Error(
                    `NPCBrain failed to schedule a future decision for '${this.npc?.id}' at ${decisionAt.toISOString()}`,
                );
            }
        }

        this._advanceActionTo(target);
        this.lastUpdatedAt = target;
    }

    _decideAt(at, game) {
        const currentRule = this.currentGoal ? this._findRule(this.currentGoal.ruleId) : null;
        const currentStillValid = this._goalStillValid(this.currentGoal, currentRule, at, game);
        const candidates = this._getDecisionCandidates(at, game);
        const bestPriority = candidates.length
            ? Math.max(...candidates.map((candidate) => candidate.priority))
            : -Infinity;

        if (this.currentAction && currentStillValid && this.currentGoal?.priority >= bestPriority) {
            this._scheduleNextWake(at, game);
            return;
        }

        if (
            this.currentAction &&
            (!currentStillValid || bestPriority > this.currentGoal?.priority)
        ) {
            this.currentGoal = null;
            this.currentAction = null;
        }

        if (this.currentGoal && !this.currentAction) {
            if (currentStillValid) {
                this._continueGoal(this.currentGoal, currentRule, at, game);
                this._scheduleNextWake(at, game);
                return;
            }
            this.currentGoal = null;
        }

        if (!candidates.length) {
            this.currentGoal = null;
            this.currentAction = {
                type: NPC_ACTION_TYPE.idle,
                startedAt: at.toISOString(),
            };
            this._scheduleNextWake(at, game);
            return;
        }

        const topPriority = Math.max(...candidates.map((candidate) => candidate.priority));
        const top = candidates.filter((candidate) => candidate.priority === topPriority);
        const selected = weightedPick(top, this._rng(game), (candidate) => candidate.weight);

        if (!selected) {
            this.currentGoal = null;
            this.currentAction = {
                type: NPC_ACTION_TYPE.idle,
                startedAt: at.toISOString(),
            };
            this._scheduleNextWake(at, game);
            return;
        }

        const target = this._resolveTarget(selected.rule, at, game, {
            deterministic: selected.rule.type === GOAL_TYPE.obligation,
        });

        if (!target) {
            // A place may have closed between candidate discovery and resolution.
            // Remove this rule for this decision and fall back to another eligible rule.
            const fallback = top.filter((candidate) => candidate !== selected);
            const alternate = weightedPick(
                fallback,
                this._rng(game),
                (candidate) => candidate.weight,
            );
            if (alternate) {
                this._startGoal(alternate, at, game);
            } else {
                this.currentGoal = null;
                this.currentAction = { type: NPC_ACTION_TYPE.idle, startedAt: at.toISOString() };
            }
            this._scheduleNextWake(at, game);
            return;
        }

        this._startGoal({ ...selected, target }, at, game);
        this._scheduleNextWake(at, game);
    }

    _startGoal(candidate, at, game) {
        const target =
            candidate.target ||
            this._resolveTarget(candidate.rule, at, game, {
                deterministic: candidate.rule.type === GOAL_TYPE.obligation,
            });
        if (!target) return;

        this.currentGoal = {
            ruleId: candidate.rule.id,
            type: candidate.rule.type,
            priority: candidate.priority,
            startedAt: at.toISOString(),
            windowStart: candidate.interval.start.toISOString(),
            windowEnd: candidate.interval.end.toISOString(),
            targetLocationId: target.locationId,
            targetPlaceId: target.placeId,
        };

        this._continueGoal(this.currentGoal, candidate.rule, at, game);
    }

    _continueGoal(goal, rule, at, game) {
        if (!goal || !rule) return;

        const target = {
            locationId: goal.targetLocationId,
            placeId: goal.targetPlaceId,
        };

        const atTarget =
            String(this.npc.locationId) === String(target.locationId) &&
            String(this.npc.currentPlaceId ?? "") === String(target.placeId ?? "");

        if (!atTarget) {
            this._startTravel(goal, target, at, game);
            return;
        }

        this._startStay(goal, rule, at, game);
    }

    _startTravel(goal, target, at, game) {
        const route = game?.world?.map?.getTravelTotal(this.npc.locationId, target.locationId);
        const minutes = route?.minutes;

        if (!route || !Number.isFinite(minutes)) {
            this.currentGoal = null;
            this.currentAction = { type: NPC_ACTION_TYPE.idle, startedAt: at.toISOString() };
            return;
        }

        if (minutes <= 0) {
            this.npc.setLocationAndPlace(target.locationId, target.placeId);
            const rule = this._findRule(goal.ruleId);
            this._startStay(goal, rule, at, game);
            return;
        }

        this.npc.currentPlaceId = null;
        const legMinutes = (route.edges || []).map((edge) =>
            Number.isFinite(edge?.minutes) ? edge.minutes : 1,
        );

        this.currentAction = {
            type: NPC_ACTION_TYPE.travel,
            startedAt: at.toISOString(),
            arrivalAt: addMinutes(at, minutes).toISOString(),
            fromLocationId: String(this.npc.locationId),
            targetLocationId: String(target.locationId),
            targetPlaceId: target.placeId ?? null,
            route: {
                locations: (route.locations || []).map(String),
                legMinutes,
                currentLegIndex: 0,
            },
        };
    }

    _startStay(goal, rule, at, game) {
        if (!goal || !rule) return;

        const intervalEnd = asDate(goal.windowEnd);
        let until = intervalEnd;

        if (rule.type === GOAL_TYPE.visit) {
            const stay = rule.stayMinutes || {};
            const min = Math.max(1, Number(stay.min) || 20);
            const max = Math.max(min, Number(stay.max) || min);
            const duration = randInt(min, max, this._rng(game));
            until = minDate(addMinutes(at, duration), intervalEnd) || addMinutes(at, duration);

            if (rule.requireOpen && goal.targetPlaceId != null) {
                const location = game?.world?.getLocation(goal.targetLocationId);
                const place = (location?.places || []).find(
                    (candidate) => String(candidate.id) === String(goal.targetPlaceId),
                );
                const closesAt = place?.getClosingTime?.(at);
                until = minDate(until, closesAt) || until;
            }
        }

        if (!until || until <= at) {
            this.currentGoal = null;
            this.currentAction = null;
            return;
        }

        this.currentAction = {
            type: NPC_ACTION_TYPE.stay,
            startedAt: at.toISOString(),
            until: until.toISOString(),
            locationId: String(goal.targetLocationId),
            placeId: goal.targetPlaceId ?? null,
        };
    }

    _advanceActionTo(at) {
        if (this.currentAction?.type !== NPC_ACTION_TYPE.travel) return;

        const action = this.currentAction;
        const start = asDate(action.startedAt);
        const arrival = asDate(action.arrivalAt);
        if (!start || !arrival) return;

        if (at >= arrival) {
            this.npc.setLocationAndPlace(action.targetLocationId, action.targetPlaceId);
            if (action.route) {
                action.route.currentLegIndex = Math.max(
                    0,
                    (action.route.locations?.length || 1) - 1,
                );
            }
            return;
        }

        const elapsed = Math.max(0, (at.getTime() - start.getTime()) / MS_PER_MINUTE);
        const locations = action.route?.locations || [];
        const legMinutes = action.route?.legMinutes || [];
        let cumulative = 0;
        let currentIndex = 0;

        for (let i = 0; i < legMinutes.length; i++) {
            cumulative += legMinutes[i];
            if (elapsed >= cumulative) currentIndex = i + 1;
            else break;
        }

        action.route.currentLegIndex = currentIndex;
        if (locations[currentIndex] != null) {
            this.npc.locationId = String(locations[currentIndex]);
        }
        this.npc.currentPlaceId = null;
    }

    _completeActionIfDue(at) {
        if (!this.currentAction) return;

        if (this.currentAction.type === NPC_ACTION_TYPE.travel) {
            const arrival = asDate(this.currentAction.arrivalAt);
            if (arrival && at >= arrival) {
                this.npc.setLocationAndPlace(
                    this.currentAction.targetLocationId,
                    this.currentAction.targetPlaceId,
                );
                this.currentAction = null;
            }
            return;
        }

        if (this.currentAction.type === NPC_ACTION_TYPE.stay) {
            const until = asDate(this.currentAction.until);
            if (until && at >= until) {
                this.currentAction = null;
                this.currentGoal = null;
            }
        }
    }

    _getDecisionCandidates(at, game) {
        const candidates = [];

        for (const rule of this.rules) {
            const activeInterval = this._findContainingInterval(rule, at, game);
            if (activeInterval) {
                if (rule.type === GOAL_TYPE.visit && !this._hasValidTarget(rule, at, game))
                    continue;
                candidates.push({
                    rule,
                    interval: activeInterval,
                    priority: Number(rule.priority) || 0,
                    weight: ruleWeight(rule),
                });
            }
        }

        for (const rule of this.rules.filter((rule) => rule.type === GOAL_TYPE.obligation)) {
            const upcoming = this._findUpcomingInterval(rule, at, game);
            if (!upcoming) continue;

            const target = this._resolveTarget(rule, at, game, { deterministic: true });
            if (!target) continue;

            const travelMinutes = game?.world?.map?.getTravelMinutes(
                this.npc.locationId,
                target.locationId,
            );
            if (!Number.isFinite(travelMinutes)) continue;

            const departureAt = addMinutes(upcoming.start, -travelMinutes);
            if (at >= departureAt && at < upcoming.start) {
                candidates.push({
                    rule,
                    interval: upcoming,
                    target,
                    priority: Number(rule.priority) || 0,
                    weight: ruleWeight(rule),
                });
            }
        }

        return candidates;
    }

    _goalStillValid(goal, rule, at, game) {
        if (!goal || !rule) return false;
        const end = asDate(goal.windowEnd);
        if (!end || at >= end) return false;

        if (rule.type === GOAL_TYPE.obligation) {
            return true;
        }

        return Boolean(this._findContainingInterval(rule, at, game));
    }

    _scheduleNextWake(at, game) {
        const actionEnd =
            this.currentAction?.type === NPC_ACTION_TYPE.travel
                ? asDate(this.currentAction.arrivalAt)
                : this.currentAction?.type === NPC_ACTION_TYPE.stay
                  ? asDate(this.currentAction.until)
                  : null;

        const nextRuleStart = this._findNextRuleStart(at, game);
        const nextDeparture = this._findNextObligationDeparture(at, game);
        let next = minDate(actionEnd, nextRuleStart, nextDeparture);

        if (!next || next.getTime() <= at.getTime()) {
            next = new Date(at.getTime() + 6 * 60 * MS_PER_MINUTE);
        }

        this.nextDecisionAt = next;
    }

    _findRule(ruleId) {
        return this.rules.find((rule) => String(rule.id) === String(ruleId)) || null;
    }

    _ruleIntervals(rule, around, game, daysBefore = 1, daysAfter = 2) {
        const from = parseTimeToMinutes(rule?.when?.from, { defaultValue: 0 }) ?? 0;
        const to = parseTimeToMinutes(rule?.when?.to, { defaultValue: 24 * 60 }) ?? 24 * 60;
        const out = [];

        for (let offset = -daysBefore; offset <= daysAfter; offset++) {
            const anchor = utcDayStart(around, offset);
            const dayKinds = Array.isArray(rule?.when?.dayKinds) ? rule.when.dayKinds : null;
            if (dayKinds?.length) {
                const kind = game?.world?.getDayInfo(anchor)?.kind;
                if (!dayKinds.includes(kind)) continue;
            }

            const daysOfWeek = Array.isArray(rule?.when?.daysOfWeek) ? rule.when.daysOfWeek : null;
            if (daysOfWeek?.length) {
                const dayIndex = anchor.getUTCDay();
                const dayKey = DAY_KEYS[dayIndex];
                if (!daysOfWeek.includes(dayKey) && !daysOfWeek.includes(dayIndex)) continue;
            }

            const start = addMinutes(anchor, from);
            let end = addMinutes(anchor, to);
            if (to <= from) end = new Date(end.getTime() + MS_PER_DAY);
            out.push({ start, end });
        }

        return out;
    }

    _findContainingInterval(rule, at, game) {
        return (
            this._ruleIntervals(rule, at, game, 1, 1).find(
                (interval) => at >= interval.start && at < interval.end,
            ) || null
        );
    }

    _findUpcomingInterval(rule, at, game) {
        return (
            this._ruleIntervals(rule, at, game, 0, 3)
                .filter((interval) => interval.start > at)
                .sort((a, b) => a.start.getTime() - b.start.getTime())[0] || null
        );
    }

    _findNextRuleStart(at, game) {
        let best = null;
        for (const rule of this.rules) {
            for (const interval of this._ruleIntervals(rule, at, game, 0, 3)) {
                if (interval.start.getTime() <= at.getTime() + EPSILON_MS) continue;
                if (!best || interval.start < best) best = interval.start;
            }
        }
        return best;
    }

    _findNextObligationDeparture(at, game) {
        let best = null;

        for (const rule of this.rules.filter((rule) => rule.type === GOAL_TYPE.obligation)) {
            for (const interval of this._ruleIntervals(rule, at, game, 0, 3)) {
                if (interval.start <= at) continue;
                const target = this._resolveTarget(rule, at, game, { deterministic: true });
                if (!target) continue;

                const travelMinutes = game?.world?.map?.getTravelMinutes(
                    this.npc.locationId,
                    target.locationId,
                );
                if (!Number.isFinite(travelMinutes)) continue;

                const departureAt = addMinutes(interval.start, -travelMinutes);
                if (departureAt.getTime() <= at.getTime() + EPSILON_MS) continue;
                if (!best || departureAt < best) best = departureAt;
            }
        }

        return best;
    }

    _hasValidTarget(rule, at, game) {
        if (rule.type === GOAL_TYPE.home) return Boolean(this.npc.homeLocationId);
        return this._collectPlaceCandidates(rule, at, game).length > 0;
    }

    _resolveTarget(rule, at, game, { deterministic = false } = {}) {
        if (rule.type === GOAL_TYPE.home) {
            if (this.npc.homeLocationId == null) return null;
            return {
                locationId: String(this.npc.homeLocationId),
                placeId: this.npc.homePlaceId ?? null,
                travelMinutes: game?.world?.map?.getTravelMinutes(
                    this.npc.locationId,
                    this.npc.homeLocationId,
                ),
            };
        }

        const candidates = this._collectPlaceCandidates(rule, at, game);
        if (!candidates.length) return null;

        const targetDescriptors = [rule.target, ...(rule.targets || [])].filter(Boolean);
        const wantsNearest = targetDescriptors.some((descriptor) => descriptor.nearest === true);

        if (deterministic || wantsNearest) {
            return candidates.reduce((best, candidate) => {
                if (!best || candidate.travelMinutes < best.travelMinutes) return candidate;
                if (
                    candidate.travelMinutes === best.travelMinutes &&
                    String(candidate.placeId) < String(best.placeId)
                ) {
                    return candidate;
                }
                return best;
            }, null);
        }

        return weightedPick(candidates, this._rng(game), (candidate) => candidate.weight);
    }

    _collectPlaceCandidates(rule, at, game) {
        const descriptors = [rule.target, ...(rule.targets || [])].filter(Boolean);
        const disallowed = Array.isArray(rule.disallowedTargets) ? rule.disallowedTargets : [];
        const candidates = new Map();
        const worldMap = game?.world?.map;
        if (!worldMap) return [];

        for (const location of worldMap.locations.values()) {
            for (const place of location.places || []) {
                if (!descriptors.some((descriptor) => descriptorMatchesPlace(descriptor, place))) {
                    continue;
                }
                if (disallowed.some((descriptor) => descriptorMatchesPlace(descriptor, place))) {
                    continue;
                }

                const travelMinutes = worldMap.getTravelMinutes(this.npc.locationId, location.id);
                if (!Number.isFinite(travelMinutes)) continue;

                const arrivalAt = addMinutes(at, travelMinutes);
                const activeInterval = this._findContainingInterval(rule, at, game);
                if (activeInterval && arrivalAt >= activeInterval.end) continue;
                if (
                    rule.requireOpen &&
                    typeof place.isOpen === "function" &&
                    !place.isOpen(arrivalAt)
                ) {
                    continue;
                }

                let weight = 1 / (1 + 0.2 * travelMinutes);
                if (String(this.npc.currentPlaceId ?? "") === String(place.id)) {
                    weight *= 0.25;
                }

                candidates.set(String(place.id), {
                    locationId: String(location.id),
                    placeId: place.id,
                    travelMinutes,
                    arrivalAt: arrivalAt.toISOString(),
                    weight,
                });
            }
        }

        return [...candidates.values()];
    }

    toJSON() {
        return {
            currentGoal: cloneData(this.currentGoal),
            currentAction: cloneData(this.currentAction),
            nextDecisionAt: this.nextDecisionAt?.toISOString?.() ?? null,
            lastUpdatedAt: this.lastUpdatedAt?.toISOString?.() ?? null,
        };
    }

    restoreJSON(data) {
        this.currentGoal = cloneData(data?.currentGoal ?? null);
        this.currentAction = cloneData(data?.currentAction ?? null);
        this.nextDecisionAt = asDate(data?.nextDecisionAt);
        this.lastUpdatedAt = asDate(data?.lastUpdatedAt);
        return this;
    }
}
