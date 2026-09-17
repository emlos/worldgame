import { addMinutes, asDate, minDate } from "../../shared/util/date.js";
import { deriveSeed, makeRNG, randInt, weightedPick } from "../../shared/util/random.js";
import { cloneData } from "../../shared/util/util.js";
import { GOAL_TYPE, NPC_ACTION_TYPE, NPC_SCHEDULE_PHASE } from "./behavior.js";
import { MS_PER_MINUTE } from "../../world/data/time.js";
import { getPlaceTransitionMinutes } from "../../world/data/travel.js";
import { createNPCPlanner } from "./npcPlanner.js";

const MAX_DECISIONS_PER_UPDATE = 100_000;

export class NPCBrain {
    constructor(npc, behavior = null) {
        this.npc = npc;
        this.behavior = behavior || { goals: [] };
        this._fallbackRng = makeRNG();
        this._rngOverride = null;
        this._planner = createNPCPlanner({
            npc: this.npc,
            getRules: () => this.rules,
            getRng: (game) => this._rng(game),
        });

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

    get isBusyWithObligation() {
        return this.currentGoal?.type === GOAL_TYPE.obligation;
    }

    getScheduleStatus(at = this.lastUpdatedAt) {
        const now = asDate(at);
        const goal = this.currentGoal;
        if (!now || goal?.type !== GOAL_TYPE.obligation) {
            return {
                phase: NPC_SCHEDULE_PHASE.free,
                obligationId: null,
                startsAt: null,
                requiredArrivalAt: null,
                earlyArrivalMinutes: null,
                minutesUntilStart: null,
            };
        }

        const startsAt = asDate(goal.windowStart);
        const requiredArrivalAt = asDate(goal.requiredArrivalAt);
        let phase = startsAt && now >= startsAt
            ? NPC_SCHEDULE_PHASE.active
            : NPC_SCHEDULE_PHASE.early;

        if (this.currentAction?.type === NPC_ACTION_TYPE.travel) {
            const departureAt = asDate(this.currentAction.startedAt);
            const leaveEndsAt = departureAt
                ? addMinutes(departureAt, Number(this.currentAction.leavePlaceMinutes) || 0)
                : null;
            phase = leaveEndsAt && now < leaveEndsAt
                ? NPC_SCHEDULE_PHASE.departing
                : NPC_SCHEDULE_PHASE.travelling;
        }

        return {
            phase,
            obligationId: String(goal.ruleId),
            startsAt: startsAt?.toISOString() ?? null,
            requiredArrivalAt: requiredArrivalAt?.toISOString() ?? null,
            earlyArrivalMinutes: Number(goal.earlyArrivalMinutes),
            minutesUntilStart: startsAt
                ? Math.max(0, (startsAt.getTime() - now.getTime()) / MS_PER_MINUTE)
                : null,
        };
    }

    getInteractionObligationConflict(
        game,
        { at = game?.now, durationMinutes = 0 } = {},
    ) {
        const now = asDate(at);
        const duration = Number(durationMinutes);
        if (!now) throw new TypeError("NPC interaction access requires a valid date");
        if (!Number.isFinite(duration) || duration < 0) {
            throw new TypeError("NPC interaction duration must be a non-negative number");
        }

        const commitment = this._planner.findNextHigherPriorityObligation(
            now,
            -Infinity,
            this.npc.locationId,
            this.npc.currentPlaceId,
            game,
        );
        if (!commitment) return null;

        const interactionEndsAt = addMinutes(now, duration);
        const projectedArrivalAt = addMinutes(
            interactionEndsAt,
            commitment.travelMinutes,
        );
        if (projectedArrivalAt <= commitment.requiredArrivalAt) return null;

        return {
            ruleId: String(commitment.rule.id),
            startsAt: commitment.interval.start.toISOString(),
            requiredArrivalAt: commitment.requiredArrivalAt.toISOString(),
            earlyArrivalMinutes: commitment.earlyArrivalMinutes,
            targetLocationId: commitment.target.locationId,
            targetPlaceId: commitment.target.placeId ?? null,
            travelMinutes: commitment.travelMinutes,
            interactionEndsAt: interactionEndsAt.toISOString(),
            latestDepartureAt: addMinutes(
                commitment.requiredArrivalAt,
                -commitment.travelMinutes,
            ).toISOString(),
            projectedArrivalAt: projectedArrivalAt.toISOString(),
        };
    }

    /**
     * Move the NPC to a temporary position without discarding obligations.
     * Discretionary schedules resume after the stay, while an obligation is
     * replanned from the new position and may require an immediate departure.
     */
    relocateTemporarily(
        game,
        { locationId, placeId = null, stayMinutes = 30, at = game?.now } = {},
    ) {
        const now = asDate(at);
        const duration = Number(stayMinutes);
        if (!now) throw new Error(`Invalid NPC relocation date: ${at}`);
        if (locationId == null) throw new Error("NPC relocation requires a locationId");
        if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error("NPC relocation stayMinutes must be a positive number");
        }

        this.updateTo(now, game);
        const busyWithObligation = this.isBusyWithObligation;
        this.npc.setLocationAndPlace(String(locationId), placeId ?? null);
        this.lastUpdatedAt = now;

        if (busyWithObligation) {
            this._replanCurrentObligation(now, game);
        } else {
            const until = addMinutes(now, duration);
            this.currentGoal = null;
            this.currentAction = {
                type: NPC_ACTION_TYPE.temporaryStay,
                startedAt: now.toISOString(),
                until: until.toISOString(),
                locationId: String(locationId),
                placeId: placeId ?? null,
            };

            // A temporary relocation should survive ordinary rule boundaries,
            // but an obligation departure may still interrupt it.
            this.nextDecisionAt =
                minDate(until, this._planner.findNextObligationDeparture(now, game)) || until;
        }

        return {
            busyWithObligation,
            currentAction: this.currentAction?.type ?? null,
            nextDecisionAt: this.nextDecisionAt?.toISOString?.() ?? null,
        };
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

        const candidates = this._planner.getDecisionCandidates(targetDate, game);
        let remaining = candidates.slice();
        const signature = this._planner.topCandidateTier(remaining)
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
                const top = this._planner.topCandidateTier(remaining);
                selected = weightedPick(top, this._rng(game), (candidate) => candidate.weight);
                if (!selected) break;
                resolvedTarget = this._planner.resolveCandidateTarget(selected, targetDate, game);
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
            } else if (
                selected.rule.type === GOAL_TYPE.obligation &&
                selected.requiredArrivalAt > targetDate
            ) {
                // The NPC is already en route to an upcoming obligation. Rebuild
                // that travel from its calculated departure and advance it only
                // to the destination timestamp.
                const travelMinutes = Math.max(0, Number(resolvedTarget.travelMinutes) || 0);
                const departureAt = addMinutes(selected.requiredArrivalAt, -travelMinutes);
                this._startGoal({ ...selected, target: resolvedTarget }, departureAt, game);
                this._advanceActionTo(targetDate);
            } else {
                // During the early-arrival or active window the NPC is already
                // at the destination; skipped travel is not replayed.
                const travelMinutes = Math.max(0, Number(resolvedTarget.travelMinutes) || 0);
                const goalActionAt = selected.rule.type === GOAL_TYPE.obligation
                    ? selected.requiredArrivalAt
                    : targetDate;
                const departureAt = selected.rule.type === GOAL_TYPE.obligation
                    ? addMinutes(selected.requiredArrivalAt, -travelMinutes)
                    : targetDate;
                this.npc.setLocationAndPlace(
                    resolvedTarget.locationId,
                    resolvedTarget.placeId ?? null,
                );
                this._startGoal(
                    { ...selected, target: resolvedTarget },
                    goalActionAt,
                    game,
                );
                if (this.currentGoal && selected.rule.type === GOAL_TYPE.obligation) {
                    this.currentGoal.startedAt = departureAt.toISOString();
                }
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
        const currentStillValid = this._planner.goalStillValid(this.currentGoal, currentRule, at, game);
        const candidates = this._planner.getDecisionCandidates(at, game);
        const preferredCandidates = this._planner.topCandidateTier(candidates);
        const bestPriority = preferredCandidates[0]?.priority ?? -Infinity;
        const obligationWinsTie =
            preferredCandidates[0]?.rule.type === GOAL_TYPE.obligation &&
            this.currentGoal?.type !== GOAL_TYPE.obligation &&
            this.currentGoal?.priority === bestPriority;

        if (
            this.currentAction &&
            currentStillValid &&
            this.currentGoal?.priority >= bestPriority &&
            !obligationWinsTie
        ) {
            this._scheduleNextWake(at, game);
            return;
        }

        if (
            this.currentAction &&
            (!currentStillValid ||
                bestPriority > this.currentGoal?.priority ||
                obligationWinsTie)
        ) {
            this.currentGoal = null;
            this.currentAction = null;
        }

        if (this.currentGoal && !this.currentAction) {
            if (
                currentStillValid &&
                this.currentGoal.priority >= bestPriority &&
                !obligationWinsTie
            ) {
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

        let remaining = candidates.slice();
        let selected = null;
        let target = null;

        // Resolve candidates in priority order. A discretionary destination can
        // be rejected when taking the trip (plus its minimum stay) would make a
        // higher-priority obligation unreachable on time.
        while (remaining.length && !target) {
            const top = this._planner.topCandidateTier(remaining);
            selected = weightedPick(top, this._rng(game), (candidate) => candidate.weight);
            if (!selected) break;
            target = this._planner.resolveCandidateTarget(selected, at, game);
            if (!target) {
                remaining = remaining.filter((candidate) => candidate !== selected);
                selected = null;
            }
        }

        if (selected && target) {
            this._startGoal({ ...selected, target }, at, game);
        } else {
            this.currentGoal = null;
            this.currentAction = { type: NPC_ACTION_TYPE.idle, startedAt: at.toISOString() };
        }
        this._scheduleNextWake(at, game);
    }

    _startGoal(candidate, at, game) {
        const target =
            candidate.target ||
            this._planner.resolveTarget(candidate.rule, at, game, {
                deterministic: candidate.rule.type === GOAL_TYPE.obligation,
            });
        if (!target) return;

        const obligationTiming = candidate.rule.type === GOAL_TYPE.obligation
            ? this._planner.obligationTiming(candidate.rule, candidate.interval, game)
            : null;
        this.currentGoal = {
            ruleId: candidate.rule.id,
            type: candidate.rule.type,
            priority: candidate.priority,
            startedAt: at.toISOString(),
            windowStart: candidate.interval.start.toISOString(),
            windowEnd: candidate.interval.end.toISOString(),
            targetLocationId: target.locationId,
            targetPlaceId: target.placeId,
            ...(obligationTiming
                ? {
                    earlyArrivalMinutes: obligationTiming.earlyArrivalMinutes,
                    requiredArrivalAt: obligationTiming.requiredArrivalAt.toISOString(),
                }
                : {}),
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

    _getTravelPlan(
        target,
        game,
        {
            originLocationId = this.npc.locationId,
            originPlaceId = this.npc.currentPlaceId,
        } = {},
    ) {
        const route = game?.world?.map?.getTravelTotal(originLocationId, target.locationId);
        const routeMinutes = Number(route?.minutes);
        if (!route || !Number.isFinite(routeMinutes)) return null;

        const transition = getPlaceTransitionMinutes({
            fromLocationId: originLocationId,
            fromPlaceId: originPlaceId,
            targetLocationId: target.locationId,
            targetPlaceId: target.placeId,
        });
        return {
            route,
            routeMinutes,
            leavePlaceMinutes: transition.leaveMinutes,
            enterPlaceMinutes: transition.enterMinutes,
            totalMinutes: routeMinutes + transition.totalMinutes,
            fromLocationId: String(originLocationId),
            fromPlaceId: originPlaceId ?? null,
        };
    }

    _makeTravelAction(plan, target, startedAt) {
        const legMinutes = (plan.route.edges || []).map((edge) =>
            Number.isFinite(edge?.minutes) ? edge.minutes : 1,
        );
        return {
            type: NPC_ACTION_TYPE.travel,
            startedAt: startedAt.toISOString(),
            arrivalAt: addMinutes(startedAt, plan.totalMinutes).toISOString(),
            fromLocationId: plan.fromLocationId,
            fromPlaceId: plan.fromPlaceId,
            targetLocationId: String(target.locationId),
            targetPlaceId: target.placeId ?? null,
            leavePlaceMinutes: plan.leavePlaceMinutes,
            enterPlaceMinutes: plan.enterPlaceMinutes,
            route: {
                locations: (plan.route.locations || []).map(String),
                legMinutes,
                currentLegIndex: 0,
            },
        };
    }

    _startTravel(goal, target, at, game) {
        const plan = this._getTravelPlan(target, game);

        if (!plan) {
            this.currentGoal = null;
            this.currentAction = { type: NPC_ACTION_TYPE.idle, startedAt: at.toISOString() };
            return;
        }

        if (plan.totalMinutes <= 0) {
            this.npc.setLocationAndPlace(target.locationId, target.placeId);
            const rule = this._findRule(goal.ruleId);
            this._startStay(goal, rule, at, game);
            return;
        }

        this.currentAction = this._makeTravelAction(plan, target, at);
        this._advanceActionTo(at);
    }

    _replanCurrentObligation(at, game) {
        const goal = this.currentGoal;
        const rule = goal ? this._findRule(goal.ruleId) : null;
        if (!goal || rule?.type !== GOAL_TYPE.obligation) {
            this.currentGoal = null;
            this.currentAction = null;
            this._decideAt(at, game);
            return;
        }

        const target = {
            locationId: goal.targetLocationId,
            placeId: goal.targetPlaceId ?? null,
        };
        const atTarget =
            String(this.npc.locationId) === String(target.locationId) &&
            String(this.npc.currentPlaceId ?? "") === String(target.placeId ?? "");
        if (atTarget) {
            this._startStay(goal, rule, at, game);
            this._scheduleNextWake(at, game);
            return;
        }

        const plan = this._getTravelPlan(target, game);
        if (!plan) {
            this.currentGoal = null;
            this.currentAction = {
                type: NPC_ACTION_TYPE.idle,
                startedAt: at.toISOString(),
            };
            this._scheduleNextWake(at, game);
            return;
        }

        if (plan.totalMinutes <= 0) {
            this.npc.setLocationAndPlace(target.locationId, target.placeId);
            this._startStay(goal, rule, at, game);
            this._scheduleNextWake(at, game);
            return;
        }

        const requiredArrivalAt = asDate(goal.requiredArrivalAt);
        const requiredDeparture = requiredArrivalAt
            ? addMinutes(requiredArrivalAt, -plan.totalMinutes)
            : at;
        const departureAt = requiredDeparture > at ? requiredDeparture : at;
        this.currentAction = this._makeTravelAction(plan, target, departureAt);
        this._advanceActionTo(at);
        this._scheduleNextWake(at, game);
        if (departureAt > at && departureAt < this.nextDecisionAt) {
            this.nextDecisionAt = departureAt;
        }
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

        // A future obligation trip can be planned before the NPC actually
        // leaves. Keep their exact position until the departure timestamp.
        if (at < start) return;

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
        const leavePlaceMinutes = Math.max(0, Number(action.leavePlaceMinutes) || 0);
        if (elapsed < leavePlaceMinutes) {
            this.npc.setLocationAndPlace(action.fromLocationId, action.fromPlaceId ?? null);
            action.route.currentLegIndex = 0;
            return;
        }

        const routeElapsed = elapsed - leavePlaceMinutes;
        const locations = action.route?.locations || [];
        const legMinutes = action.route?.legMinutes || [];
        let cumulative = 0;
        let currentIndex = 0;

        for (let i = 0; i < legMinutes.length; i++) {
            cumulative += legMinutes[i];
            if (routeElapsed >= cumulative) currentIndex = i + 1;
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

        if (
            this.currentAction.type === NPC_ACTION_TYPE.stay ||
            this.currentAction.type === NPC_ACTION_TYPE.temporaryStay
        ) {
            const until = asDate(this.currentAction.until);
            if (until && at >= until) {
                this.currentAction = null;
                this.currentGoal = null;
            }
        }
    }

    _scheduleNextWake(at, game) {
        const actionEnd =
            this.currentAction?.type === NPC_ACTION_TYPE.travel
                ? asDate(this.currentAction.arrivalAt)
                : this.currentAction?.type === NPC_ACTION_TYPE.stay ||
                    this.currentAction?.type === NPC_ACTION_TYPE.temporaryStay
                  ? asDate(this.currentAction.until)
                  : null;

        const nextRuleStart = this._planner.findNextRuleStart(at, game);
        const nextDeparture = this._planner.findNextObligationDeparture(at, game);
        let next = minDate(actionEnd, nextRuleStart, nextDeparture);

        if (!next || next.getTime() <= at.getTime()) {
            next = new Date(at.getTime() + 6 * 60 * MS_PER_MINUTE);
        }

        this.nextDecisionAt = next;
    }

    _findRule(ruleId) {
        return this.rules.find((rule) => String(rule.id) === String(ruleId)) || null;
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
