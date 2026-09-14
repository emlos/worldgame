import { Body, BodyPartId, InjuryCondition } from "../../characters/core/body.js";
import {
  ENCOUNTER_FACING,
  ENCOUNTER_POSE,
  ENCOUNTER_RANGE,
  ENCOUNTER_SUPPORT,
  getEncounterFacing,
  getEncounterRange,
} from "./state.js";
import {
  controlledParticipantId,
  opponentParticipantId,
  participantIds,
} from "./roles.js";

const PART_CHAINS = Object.freeze({
  [BodyPartId.HAND_L]: Object.freeze([
    BodyPartId.HAND_L,
    BodyPartId.LOWER_ARM_L,
    BodyPartId.UPPER_ARM_L,
    BodyPartId.SHOULDER_L,
  ]),
  [BodyPartId.HAND_R]: Object.freeze([
    BodyPartId.HAND_R,
    BodyPartId.LOWER_ARM_R,
    BodyPartId.UPPER_ARM_R,
    BodyPartId.SHOULDER_R,
  ]),
  [BodyPartId.LOWER_ARM_L]: Object.freeze([
    BodyPartId.LOWER_ARM_L,
    BodyPartId.UPPER_ARM_L,
    BodyPartId.SHOULDER_L,
  ]),
  [BodyPartId.LOWER_ARM_R]: Object.freeze([
    BodyPartId.LOWER_ARM_R,
    BodyPartId.UPPER_ARM_R,
    BodyPartId.SHOULDER_R,
  ]),
  [BodyPartId.UPPER_ARM_L]: Object.freeze([BodyPartId.UPPER_ARM_L, BodyPartId.SHOULDER_L]),
  [BodyPartId.UPPER_ARM_R]: Object.freeze([BodyPartId.UPPER_ARM_R, BodyPartId.SHOULDER_R]),
  [BodyPartId.FOOT_L]: Object.freeze([
    BodyPartId.FOOT_L,
    BodyPartId.ANKLE_L,
    BodyPartId.CALF_L,
    BodyPartId.KNEE_L,
    BodyPartId.THIGH_L,
  ]),
  [BodyPartId.FOOT_R]: Object.freeze([
    BodyPartId.FOOT_R,
    BodyPartId.ANKLE_R,
    BodyPartId.CALF_R,
    BodyPartId.KNEE_R,
    BodyPartId.THIGH_R,
  ]),
  [BodyPartId.KNEE_L]: Object.freeze([BodyPartId.KNEE_L, BodyPartId.THIGH_L]),
  [BodyPartId.KNEE_R]: Object.freeze([BodyPartId.KNEE_R, BodyPartId.THIGH_R]),
  [BodyPartId.HEAD]: Object.freeze([BodyPartId.HEAD, BodyPartId.NECK]),
});

const LEFT_ARM = new Set([
  BodyPartId.HAND_L,
  BodyPartId.LOWER_ARM_L,
  BodyPartId.UPPER_ARM_L,
  BodyPartId.SHOULDER_L,
]);
const RIGHT_ARM = new Set([
  BodyPartId.HAND_R,
  BodyPartId.LOWER_ARM_R,
  BodyPartId.UPPER_ARM_R,
  BodyPartId.SHOULDER_R,
]);
const LEFT_LEG = new Set([
  BodyPartId.FOOT_L,
  BodyPartId.ANKLE_L,
  BodyPartId.CALF_L,
  BodyPartId.KNEE_L,
  BodyPartId.THIGH_L,
]);
const RIGHT_LEG = new Set([
  BodyPartId.FOOT_R,
  BodyPartId.ANKLE_R,
  BodyPartId.CALF_R,
  BodyPartId.KNEE_R,
  BodyPartId.THIGH_R,
]);

function fail(message) {
  throw new Error(`Physical encounter combatant: ${message}`);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sceneActor(game, alias) {
  const actor = game.currentStory?.actors?.[alias];
  if (!actor) fail(`scene actor '${alias}' is unavailable`);
  return actor;
}

function playerStat(game, name) {
  return finite(game.player.getSkillValue(name), 0);
}

function actorStat(actor, name) {
  if (name === "fitness") {
    return (finite(actor.stats?.strength) + finite(actor.stats?.endurance)) / 2;
  }
  return finite(actor.stats?.[name], 0);
}

export function createCombatContext({ game, state, instanceKey }) {
  const combatants = {};
  for (const participantId of participantIds(state)) {
    const participant = state.participants[participantId];
    if (participant.ref.type === "player") {
      combatants[participantId] = {
        id: participantId,
        title: "you",
        body: game.player.body,
        stat: (name) => playerStat(game, name),
        persist() {},
      };
      continue;
    }
    const actor = sceneActor(game, participant.ref.alias);
    const actorBody = Body.fromJSON(actor.body);
    combatants[participantId] = {
      id: participantId,
      title: actor.title,
      actor,
      body: actorBody,
      stat: (name) => actorStat(actor, name),
      persist() {
        actor.body = actorBody.toJSON();
      },
    };
  }
  return {
    game,
    state,
    instanceKey,
    combatants,
  };
}

export function persistCombatantBodies(context) {
  for (const combatant of Object.values(context.combatants)) combatant.persist();
}

export function otherParticipantId(contextOrState, actorId) {
  const state = contextOrState?.state || contextOrState;
  return opponentParticipantId(state, actorId);
}

export const getControlledParticipantId = (context) => controlledParticipantId(context.state);
export const getOpponentParticipantId = (context, actorId) =>
  opponentParticipantId(context.state, actorId);

export function getCombatant(context, actorId) {
  const combatant = context.combatants[actorId];
  if (!combatant) fail(`unknown participant '${String(actorId)}'`);
  return combatant;
}

export function getParticipant(context, actorId) {
  const participant = context.state.participants[actorId];
  if (!participant) fail(`unknown participant '${String(actorId)}'`);
  return participant;
}

export function getBodyPart(context, actorId, partId) {
  return getCombatant(context, actorId).body.getPart(partId);
}

export function getBodyPain(context, actorId) {
  return getCombatant(context, actorId).body.getTotalPain();
}

export function getBodyPerformance(context, actorId) {
  return getCombatant(context, actorId).body.getPhysicalPerformanceMultiplier();
}

export function getPartChain(partId) {
  return PART_CHAINS[partId] || [partId];
}

export function getLimbGroup(partId) {
  if (LEFT_ARM.has(partId)) return "arm-left";
  if (RIGHT_ARM.has(partId)) return "arm-right";
  if (LEFT_LEG.has(partId)) return "leg-left";
  if (RIGHT_LEG.has(partId)) return "leg-right";
  if ([BodyPartId.HEAD, BodyPartId.FACE, BodyPartId.NECK].includes(partId)) return "head";
  return `part-${partId}`;
}

export function isSameLimb(leftPartId, rightPartId) {
  return getLimbGroup(leftPartId) === getLimbGroup(rightPartId);
}

export function getStat(context, actorId, name) {
  return getCombatant(context, actorId).stat(name);
}

export function getAcute(context, actorId, acuteId) {
  return getParticipant(context, actorId).acute.find(({ id }) => id === acuteId) || null;
}

export function isDazed(context, actorId, minimumSeverity = 1) {
  return (getAcute(context, actorId, "dazed")?.severity || 0) >= minimumSeverity;
}

export function isOffBalance(context, actorId, minimumSeverity = 1) {
  return (getAcute(context, actorId, "off-balance")?.severity || 0) >= minimumSeverity;
}

export function isWinded(context, actorId, minimumSeverity = 1) {
  return (getAcute(context, actorId, "winded")?.severity || 0) >= minimumSeverity;
}

export function isEncounterIncapacitated(context, actorId) {
  if (isDazed(context, actorId, 3)) return true;
  const headCapacity = getPartCapacity(context, actorId, BodyPartId.HEAD);
  const chestCapacity = getPartCapacity(context, actorId, BodyPartId.CHEST);
  if (headCapacity <= 0.08 || chestCapacity <= 0.06) return true;

  // Encounter incapacitation is broader than unconsciousness. If neither an
  // arm nor a leg can supply gross movement, the current action catalogue has
  // no honest physical response to offer, even if the actor is still awake.
  const legCapacity = Math.max(
    getPartCapacity(context, actorId, BodyPartId.FOOT_L),
    getPartCapacity(context, actorId, BodyPartId.FOOT_R),
  );
  const armCapacity = Math.max(
    getPartCapacity(context, actorId, BodyPartId.HAND_L),
    getPartCapacity(context, actorId, BodyPartId.HAND_R),
  );
  if (legCapacity <= 0.15 && armCapacity <= 0.15) return true;

  const pain = getBodyPain(context, actorId);
  const threshold = Math.min(
    95,
    78 + getStat(context, actorId, "resolve") * 1.2 + getStat(context, actorId, "endurance") * 0.7,
  );
  if (pain >= threshold) return true;

  const participant = getParticipant(context, actorId);
  if (participant.pose !== ENCOUNTER_POSE.standing && pain >= 62) {
    if (legCapacity < 0.25 && armCapacity < 0.25) return true;
  }
  return isWinded(context, actorId, 3) && pain >= 68;
}

export function getPartCapacity(context, actorId, partId) {
  const combatant = getCombatant(context, actorId);
  const chain = getPartChain(partId);
  let capacity = 1;
  for (const id of chain) {
    const part = combatant.body.getPart(id);
    if (!part || part.isBroken || part.health <= 0) return 0;
    let partCapacity = part.integrityRatio;
    if (part.conditions.has(InjuryCondition.WOUNDED)) partCapacity *= 0.8;
    else if (part.conditions.has(InjuryCondition.BRUISED)) partCapacity *= 0.94;
    partCapacity *= Math.max(0.65, 1 - part.pain * 0.0035);
    capacity = Math.min(capacity, partCapacity);
  }
  return Math.max(0, Math.min(1, capacity));
}

export function isPartFunctional(context, actorId, partId) {
  return getPartCapacity(context, actorId, partId) > 0.15;
}

export function holdsControlledBy(context, actorId) {
  return context.state.relationships.holds.filter(({ controllerId }) => controllerId === actorId);
}

export function hostileHoldsOn(context, actorId) {
  return context.state.relationships.holds.filter(({ targetId }) => targetId === actorId);
}

export function isHandCommitted(context, actorId, handId) {
  return holdsControlledBy(context, actorId).some(
    ({ sourcePartId }) => isSameLimb(sourcePartId, handId),
  );
}

function holdPositionMultiplier(context, hold) {
  const target = getParticipant(context, hold.targetId);
  if (hold.kind !== "limb-pin") return 1;

  let multiplier = target.support === ENCOUNTER_SUPPORT.wall ? 1.08 : 1.18;
  if (getEncounterFacing(context.state, hold.targetId) === ENCOUNTER_FACING.away) {
    multiplier += 0.08;
  }
  return multiplier;
}

function unrestrainedHoldLeverage(context, hold) {
  const participant = getParticipant(context, hold.controllerId);
  const dazeMultiplier = isDazed(context, hold.controllerId) ? 0.7 : 1;
  const exertionMultiplier = Math.max(0.55, 1 - participant.exertion * 0.0045);
  return hold.leverage
    * getPartCapacity(context, hold.controllerId, hold.sourcePartId)
    * getBalanceCapacity(context, hold.controllerId)
    * dazeMultiplier
    * exertionMultiplier
    * holdPositionMultiplier(context, hold);
}

function restraintMultiplier(context, actorId, partId, effectiveByHoldId) {
  let multiplier = 1;
  for (const hold of hostileHoldsOn(context, actorId)) {
    if (!isSameLimb(hold.targetPartId, partId)) continue;
    const effective = effectiveByHoldId.get(hold.id) || 0;
    const denominator = hold.kind === "limb-pin" ? 70 : 105;
    const floor = hold.kind === "limb-pin" ? 0.02 : 0.12;
    multiplier *= Math.max(floor, 1 - effective / denominator);
  }
  return multiplier;
}

function solveEffectiveHoldLeverages(context) {
  const holds = context.state.relationships.holds;
  const baseByHoldId = new Map(
    holds.map((hold) => [hold.id, unrestrainedHoldLeverage(context, hold)]),
  );
  let effectiveByHoldId = new Map(baseByHoldId);

  // Holds can restrain limbs which are themselves maintaining other holds.
  // Resolve that small coupled system together so the answer does not depend
  // on hold array order. Damping also gives reciprocal restraint a stable,
  // deterministic result instead of alternating between two extremes.
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const next = new Map();
    let largestChange = 0;
    for (const hold of holds) {
      const constrained = baseByHoldId.get(hold.id) * restraintMultiplier(
        context,
        hold.controllerId,
        hold.sourcePartId,
        effectiveByHoldId,
      );
      const previous = effectiveByHoldId.get(hold.id);
      const value = (previous + constrained) / 2;
      next.set(hold.id, value);
      largestChange = Math.max(largestChange, Math.abs(value - previous));
    }
    effectiveByHoldId = next;
    if (largestChange < 0.0001) break;
  }
  return effectiveByHoldId;
}

export function getLimbCapacity(context, actorId, partId) {
  const effectiveByHoldId = solveEffectiveHoldLeverages(context);
  const capacity = getPartCapacity(context, actorId, partId)
    * restraintMultiplier(context, actorId, partId, effectiveByHoldId);
  return Math.max(0, Math.min(1, capacity));
}

export function getUsableHands(context, actorId) {
  return [BodyPartId.HAND_L, BodyPartId.HAND_R].filter((handId) =>
    isPartFunctional(context, actorId, handId)
    && !isHandCommitted(context, actorId, handId)
    && getLimbCapacity(context, actorId, handId) > 0.55)
    .sort((left, right) =>
      getLimbCapacity(context, actorId, right) - getLimbCapacity(context, actorId, left)
      || left.localeCompare(right));
}

export function getUsableKnees(context, actorId) {
  return [BodyPartId.KNEE_L, BodyPartId.KNEE_R].filter((kneeId) =>
    isPartFunctional(context, actorId, kneeId)
    && !holdsControlledBy(context, actorId).some(
      ({ sourcePartId }) => isSameLimb(sourcePartId, kneeId),
    ))
    .sort((left, right) =>
      getLimbCapacity(context, actorId, right) - getLimbCapacity(context, actorId, left)
      || left.localeCompare(right));
}

export function getUsableArmTargets(context, actorId) {
  return [BodyPartId.LOWER_ARM_L, BodyPartId.LOWER_ARM_R].filter((partId) => {
    if (!isPartFunctional(context, actorId, partId)) return false;
    return !context.state.relationships.holds.some(
      (hold) => hold.targetId === actorId && isSameLimb(hold.targetPartId, partId),
    );
  });
}

export function getBalanceCapacity(context, actorId) {
  const left = getPartCapacity(context, actorId, BodyPartId.FOOT_L);
  const right = getPartCapacity(context, actorId, BodyPartId.FOOT_R);
  let capacity = Math.max(left, right) * 0.7 + Math.min(left, right) * 0.3;
  const pose = getParticipant(context, actorId).pose;
  if (pose === ENCOUNTER_POSE.kneeling) capacity *= 0.72;
  else if (pose === ENCOUNTER_POSE.supine || pose === ENCOUNTER_POSE.prone) capacity *= 0.35;
  const offBalance = getAcute(context, actorId, "off-balance")?.severity || 0;
  const daze = getAcute(context, actorId, "dazed")?.severity || 0;
  capacity *= Math.max(0.25, 1 - offBalance * 0.2 - daze * 0.12);
  return Math.max(0, Math.min(1, capacity));
}

export function getEffectiveHoldLeverage(context, hold) {
  const solved = solveEffectiveHoldLeverages(context).get(hold.id);
  if (solved !== undefined) return solved;
  return unrestrainedHoldLeverage(context, hold);
}

export function getHoldGeometryProblem(context, hold) {
  if (!getBodyPart(context, hold.controllerId, hold.sourcePartId)) {
    return {
      code: "source-missing",
      message: `hold '${hold.id}' uses a missing source part`,
    };
  }
  if (!getBodyPart(context, hold.targetId, hold.targetPartId)) {
    return {
      code: "target-missing",
      message: `hold '${hold.id}' targets a missing body part`,
    };
  }
  if (!isPartFunctional(context, hold.controllerId, hold.sourcePartId)) {
    return {
      code: "source-disabled",
      message: `hold '${hold.id}' uses a nonfunctional source limb`,
    };
  }
  if (getLimbCapacity(context, hold.controllerId, hold.sourcePartId) <= 0.15) {
    return {
      code: "source-restrained",
      message: `hold '${hold.id}' uses a source limb disabled by restraint`,
    };
  }
  if (getEncounterRange(context.state) !== ENCOUNTER_RANGE.clinch) {
    return {
      code: "range-opened",
      message: `hold '${hold.id}' requires clinch range`,
    };
  }
  if (hold.kind !== "limb-pin") return null;

  const target = getParticipant(context, hold.targetId);
  if (target.pose === ENCOUNTER_POSE.standing
    && target.support !== ENCOUNTER_SUPPORT.wall) {
    return {
      code: "pin-target-unconstrained",
      message: `pin '${hold.id}' requires a grounded or wall-supported target`,
    };
  }
  if (hold.sourcePartId.startsWith("knee_")) {
    const controller = getParticipant(context, hold.controllerId);
    if (controller.pose !== ENCOUNTER_POSE.kneeling
      || target.pose === ENCOUNTER_POSE.standing) {
      return {
        code: "knee-pin-geometry-lost",
        message: `knee pin '${hold.id}' requires kneeling ground control`,
      };
    }
  }
  return null;
}

export function validateCombatantInvariants(context) {
  for (const hold of context.state.relationships.holds) {
    const problem = getHoldGeometryProblem(context, hold);
    if (problem) fail(problem.message);
  }
  if (context.state.phase === "active") {
    for (const actorId of participantIds(context.state)) {
      if (isEncounterIncapacitated(context, actorId)) {
        fail(`active participant '${actorId}' is incapacitated`);
      }
    }
  }
}
