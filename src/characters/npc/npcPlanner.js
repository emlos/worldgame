import {
    addMinutes,
    asDate,
    parseTimeToMinutes,
    utcDayStart,
} from "../../shared/util/date.js";
import {
    deriveSeed,
    makeRNG,
    randInt,
    ruleWeight,
    weightedPick,
} from "../../shared/util/random.js";
import {
    GOAL_TYPE,
    TARGET_TYPE,
    OBLIGATION_EARLY_ARRIVAL_MINUTES,
} from "./behavior.js";
import { DAY_KEYS, MS_PER_DAY } from "../../world/data/time.js";
import { getPlaceTransitionMinutes } from "../../world/data/travel.js";

const EPSILON_MS = 1;

function categoriesOf(place) {
    const category = place?.props?.category;
    if (Array.isArray(category)) return category;
    return category == null ? [] : [category];
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

/**
 * Stateless schedule and destination planning for one NPC brain.
 * Mutable action/goal state remains owned by NPCBrain; this module only
 * evaluates rules and returns plans/candidates.
 */
export function createNPCPlanner({ npc, getRules, getRng }) {
    if (!npc) throw new TypeError("NPC planner requires an NPC");
    if (typeof getRules !== "function") {
        throw new TypeError("NPC planner requires getRules()");
    }
    if (typeof getRng !== "function") {
        throw new TypeError("NPC planner requires getRng()");
    }

    const rules = () => {
        const value = getRules();
        return Array.isArray(value) ? value : [];
    };

    function ruleIntervals(rule, around, game, daysBefore = 1, daysAfter = 2) {
        const from = parseTimeToMinutes(rule?.when?.from, { defaultValue: 0 }) ?? 0;
        const to = parseTimeToMinutes(rule?.when?.to, { defaultValue: 24 * 60 }) ?? 24 * 60;
        const out = [];

        for (let offset = -daysBefore; offset <= daysAfter; offset++) {
            const anchor = utcDayStart(around, offset);
            if (!game.features.matchesNPCScheduleConditions(
                game,
                rule?.when,
                { date: anchor, npc, rule },
            )) {
                continue;
            }

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

    function findContainingInterval(rule, at, game) {
        return (
            ruleIntervals(rule, at, game, 1, 1).find(
                (interval) => at >= interval.start && at < interval.end,
            ) || null
        );
    }

    function findUpcomingInterval(rule, at, game) {
        return (
            ruleIntervals(rule, at, game, 0, 3)
                .filter((interval) => interval.start > at)
                .sort((a, b) => a.start.getTime() - b.start.getTime())[0] || null
        );
    }

    function obligationTiming(rule, interval, game) {
        const seed = deriveSeed(
            game?.seed ?? 0,
            `npc-obligation-early:${npc?.id ?? "unknown"}:${String(rule.id)}:${interval.start.toISOString()}`,
        );
        const earlyArrivalMinutes = randInt(
            OBLIGATION_EARLY_ARRIVAL_MINUTES.min,
            OBLIGATION_EARLY_ARRIVAL_MINUTES.max,
            makeRNG(seed),
        );
        return {
            earlyArrivalMinutes,
            requiredArrivalAt: addMinutes(interval.start, -earlyArrivalMinutes),
        };
    }

    function collectPlaceCandidates(
        rule,
        at,
        game,
        {
            originLocationId = npc.locationId,
            originPlaceId = npc.currentPlaceId,
        } = {},
    ) {
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

                const routeMinutes = worldMap.getTravelMinutes(originLocationId, location.id);
                if (!Number.isFinite(routeMinutes)) continue;
                const transition = getPlaceTransitionMinutes({
                    fromLocationId: originLocationId,
                    fromPlaceId: originPlaceId,
                    targetLocationId: location.id,
                    targetPlaceId: place.id,
                });
                const travelMinutes = routeMinutes + transition.totalMinutes;

                const arrivalAt = addMinutes(at, travelMinutes);
                const activeInterval = findContainingInterval(rule, at, game);
                if (activeInterval && arrivalAt >= activeInterval.end) continue;
                if (
                    rule.requireOpen &&
                    typeof place.isOpen === "function" &&
                    !place.isOpen(arrivalAt)
                ) {
                    continue;
                }

                let weight = 1 / (1 + 0.2 * travelMinutes);
                if (
                    String(originLocationId) === String(npc.locationId) &&
                    String(npc.currentPlaceId ?? "") === String(place.id)
                ) {
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

    function resolveTarget(
        rule,
        at,
        game,
        {
            deterministic = false,
            originLocationId = npc.locationId,
            originPlaceId = npc.currentPlaceId,
            targetFilter = null,
        } = {},
    ) {
        if (rule.type === GOAL_TYPE.home) {
            if (npc.homeLocationId == null) return null;
            const locationId = String(npc.homeLocationId);
            const placeId = npc.homePlaceId ?? null;
            const routeMinutes = game?.world?.map?.getTravelMinutes(
                originLocationId,
                locationId,
            );
            if (!Number.isFinite(routeMinutes)) return null;
            const transition = getPlaceTransitionMinutes({
                fromLocationId: originLocationId,
                fromPlaceId: originPlaceId,
                targetLocationId: locationId,
                targetPlaceId: placeId,
            });
            const target = {
                locationId,
                placeId,
                travelMinutes: routeMinutes + transition.totalMinutes,
            };
            return !targetFilter || targetFilter(target) ? target : null;
        }

        const candidates = collectPlaceCandidates(rule, at, game, {
            originLocationId,
            originPlaceId,
        }).filter((candidate) => !targetFilter || targetFilter(candidate));
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

        return weightedPick(candidates, getRng(game), (candidate) => candidate.weight);
    }

    function hasValidTarget(rule, at, game) {
        if (rule.type === GOAL_TYPE.home) return Boolean(npc.homeLocationId);
        return collectPlaceCandidates(rule, at, game).length > 0;
    }

    function findNextHigherPriorityObligation(
        at,
        currentPriority,
        originLocationId,
        originPlaceId,
        game,
    ) {
        let best = null;

        for (const rule of rules().filter((candidate) => candidate.type === GOAL_TYPE.obligation)) {
            const priority = Number(rule.priority) || 0;
            // Obligations win ties against discretionary goals.
            if (priority < currentPriority) continue;

            for (const interval of ruleIntervals(rule, at, game, 0, 3)) {
                if (interval.start <= at) continue;
                const target = resolveTarget(rule, at, game, {
                    deterministic: true,
                    originLocationId,
                    originPlaceId,
                });
                if (!target || !Number.isFinite(target.travelMinutes)) continue;

                const timing = obligationTiming(rule, interval, game);
                const departureAt = addMinutes(timing.requiredArrivalAt, -target.travelMinutes);
                const commitment = {
                    rule,
                    interval,
                    target,
                    priority,
                    travelMinutes: target.travelMinutes,
                    departureAt,
                    ...timing,
                };
                if (
                    !best ||
                    departureAt < best.departureAt ||
                    (departureAt.getTime() === best.departureAt.getTime() &&
                        timing.requiredArrivalAt < best.requiredArrivalAt) ||
                    (departureAt.getTime() === best.departureAt.getTime() &&
                        timing.requiredArrivalAt.getTime() === best.requiredArrivalAt.getTime() &&
                        priority > best.priority)
                ) {
                    best = commitment;
                }
            }
        }

        return best;
    }

    function targetFitsBeforeNextObligation(candidate, target, at, game) {
        if (candidate.rule.type === GOAL_TYPE.obligation) return true;

        const travelToTarget = Number(target.travelMinutes);
        if (!Number.isFinite(travelToTarget)) return false;

        const arrivalAt = addMinutes(at, travelToTarget);
        let readyToLeaveAt = arrivalAt;
        if (candidate.rule.type === GOAL_TYPE.visit) {
            const stay = candidate.rule.stayMinutes || {};
            const minimumStay = Math.max(1, Number(stay.min) || 20);
            readyToLeaveAt = addMinutes(arrivalAt, minimumStay);

            const intervalEnd = candidate.interval?.end;
            if (intervalEnd instanceof Date && readyToLeaveAt > intervalEnd) {
                readyToLeaveAt = intervalEnd;
            }
        }

        const commitment = findNextHigherPriorityObligation(
            at,
            candidate.priority,
            target.locationId,
            target.placeId,
            game,
        );
        if (!commitment) return true;

        const projectedArrival = addMinutes(readyToLeaveAt, commitment.travelMinutes);
        return projectedArrival <= commitment.requiredArrivalAt;
    }

    function resolveCandidateTarget(candidate, at, game) {
        if (candidate.target) return candidate.target;
        return resolveTarget(candidate.rule, at, game, {
            deterministic: candidate.rule.type === GOAL_TYPE.obligation,
            targetFilter: (target) => targetFitsBeforeNextObligation(candidate, target, at, game),
        });
    }

    function topCandidateTier(candidates) {
        // Weight zero explicitly disables a rule. Remove disabled candidates
        // before comparing priorities so an entirely disabled high-priority
        // tier cannot hide enabled fallback rules below it.
        const enabled = candidates.filter((candidate) => candidate.weight > 0);
        if (!enabled.length) return [];

        const topPriority = Math.max(...enabled.map((candidate) => candidate.priority));
        const top = enabled.filter((candidate) => candidate.priority === topPriority);
        const obligations = top.filter(
            (candidate) => candidate.rule.type === GOAL_TYPE.obligation,
        );
        if (!obligations.length) return top;

        const earliestDeparture = Math.min(
            ...obligations.map((candidate) => candidate.departureAt.getTime()),
        );
        const departingFirst = obligations.filter(
            (candidate) => candidate.departureAt.getTime() === earliestDeparture,
        );
        const earliestRequiredArrival = Math.min(
            ...departingFirst.map((candidate) => candidate.requiredArrivalAt.getTime()),
        );
        return departingFirst.filter(
            (candidate) =>
                candidate.requiredArrivalAt.getTime() === earliestRequiredArrival,
        );
    }

    function getDecisionCandidates(at, game) {
        const candidates = [];

        for (const rule of rules()) {
            const activeInterval = findContainingInterval(rule, at, game);
            if (activeInterval) {
                if (rule.type === GOAL_TYPE.visit && !hasValidTarget(rule, at, game)) {
                    continue;
                }
                const timing = rule.type === GOAL_TYPE.obligation
                    ? obligationTiming(rule, activeInterval, game)
                    : null;
                const target = rule.type === GOAL_TYPE.obligation
                    ? resolveTarget(rule, at, game, { deterministic: true })
                    : null;
                if (rule.type === GOAL_TYPE.obligation && !target) continue;
                candidates.push({
                    rule,
                    interval: activeInterval,
                    priority: Number(rule.priority) || 0,
                    weight: ruleWeight(rule, (weight) => `Invalid NPC goal weight: ${weight}`),
                    ...(timing || {}),
                    ...(target
                        ? {
                            target,
                            departureAt: addMinutes(
                                timing.requiredArrivalAt,
                                -target.travelMinutes,
                            ),
                        }
                        : {}),
                });
            }
        }

        for (const rule of rules().filter((rule) => rule.type === GOAL_TYPE.obligation)) {
            const upcoming = findUpcomingInterval(rule, at, game);
            if (!upcoming) continue;

            const target = resolveTarget(rule, at, game, { deterministic: true });
            if (!target) continue;

            const travelMinutes = Number(target.travelMinutes);
            if (!Number.isFinite(travelMinutes)) continue;

            const timing = obligationTiming(rule, upcoming, game);
            const departureAt = addMinutes(timing.requiredArrivalAt, -travelMinutes);
            if (at >= departureAt && at < upcoming.start) {
                candidates.push({
                    rule,
                    interval: upcoming,
                    target,
                    priority: Number(rule.priority) || 0,
                    weight: ruleWeight(rule, (weight) => `Invalid NPC goal weight: ${weight}`),
                    ...timing,
                    departureAt,
                });
            }
        }

        return candidates;
    }

    function goalStillValid(goal, rule, at, game) {
        if (!goal || !rule) return false;
        const end = asDate(goal.windowEnd);
        if (!end || at >= end) return false;

        if (rule.type === GOAL_TYPE.obligation) return true;
        return Boolean(findContainingInterval(rule, at, game));
    }

    function findNextRuleStart(at, game) {
        let best = null;
        for (const rule of rules()) {
            for (const interval of ruleIntervals(rule, at, game, 0, 3)) {
                if (interval.start.getTime() <= at.getTime() + EPSILON_MS) continue;
                if (!best || interval.start < best) best = interval.start;
            }
        }
        return best;
    }

    function findNextObligationDeparture(at, game) {
        let best = null;

        for (const rule of rules().filter((rule) => rule.type === GOAL_TYPE.obligation)) {
            for (const interval of ruleIntervals(rule, at, game, 0, 3)) {
                if (interval.start <= at) continue;
                const target = resolveTarget(rule, at, game, { deterministic: true });
                if (!target) continue;

                const travelMinutes = Number(target.travelMinutes);
                if (!Number.isFinite(travelMinutes)) continue;

                const timing = obligationTiming(rule, interval, game);
                const departureAt = addMinutes(timing.requiredArrivalAt, -travelMinutes);
                if (departureAt.getTime() <= at.getTime() + EPSILON_MS) continue;
                if (!best || departureAt < best) best = departureAt;
            }
        }

        return best;
    }

    return Object.freeze({
        findNextHigherPriorityObligation,
        findNextObligationDeparture,
        findNextRuleStart,
        getDecisionCandidates,
        goalStillValid,
        obligationTiming,
        resolveCandidateTarget,
        resolveTarget,
        topCandidateTier,
    });
}
