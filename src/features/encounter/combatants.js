import { Body, BodyPartId } from "../../characters/core/body.js";

const HAND_CHAINS = Object.freeze({
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
});

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
  const alias = state.participants.mugger.ref.alias;
  const actor = sceneActor(game, alias);
  const actorBody = Body.fromJSON(actor.body);
  return {
    game,
    state,
    instanceKey,
    combatants: {
      player: {
        id: "player",
        title: "you",
        body: game.player.body,
        stat: (name) => playerStat(game, name),
        persist() {},
      },
      mugger: {
        id: "mugger",
        title: actor.title,
        actor,
        body: actorBody,
        stat: (name) => actorStat(actor, name),
        persist() {
          actor.body = actorBody.toJSON();
        },
      },
    },
  };
}

export function persistCombatantBodies(context) {
  for (const combatant of Object.values(context.combatants)) combatant.persist();
}

export function otherParticipantId(actorId) {
  if (actorId === "player") return "mugger";
  if (actorId === "mugger") return "player";
  fail(`unknown participant '${String(actorId)}'`);
}

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

export function getStat(context, actorId, name) {
  return getCombatant(context, actorId).stat(name);
}

export function getAcute(context, actorId, acuteId) {
  return getParticipant(context, actorId).acute.find(({ id }) => id === acuteId) || null;
}

export function isDazed(context, actorId, minimumSeverity = 1) {
  return (getAcute(context, actorId, "dazed")?.severity || 0) >= minimumSeverity;
}

export function isEncounterIncapacitated(context, actorId) {
  if (getBodyPain(context, actorId) >= 80) return true;
  if (isDazed(context, actorId, 3)) return true;
  const head = getBodyPart(context, actorId, BodyPartId.HEAD);
  const chest = getBodyPart(context, actorId, BodyPartId.CHEST);
  return Boolean((head && head.integrityRatio <= 0.1) || (chest && chest.integrityRatio <= 0.1));
}

export function getPartCapacity(context, actorId, partId) {
  const combatant = getCombatant(context, actorId);
  const chain = HAND_CHAINS[partId] || [partId];
  let capacity = 1;
  for (const id of chain) {
    const part = combatant.body.getPart(id);
    if (!part || part.isBroken || part.health <= 0) return 0;
    capacity = Math.min(capacity, part.integrityRatio);
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
  return holdsControlledBy(context, actorId).some(({ sourcePartId }) => sourcePartId === handId);
}

export function isArmHeld(context, actorId, handId) {
  const targetPartId = handId === BodyPartId.HAND_L
    ? BodyPartId.LOWER_ARM_L
    : BodyPartId.LOWER_ARM_R;
  return hostileHoldsOn(context, actorId).some((hold) => hold.targetPartId === targetPartId);
}

export function getUsableHands(context, actorId) {
  return [BodyPartId.HAND_L, BodyPartId.HAND_R].filter((handId) =>
    isPartFunctional(context, actorId, handId)
    && !isHandCommitted(context, actorId, handId)
    && !isArmHeld(context, actorId, handId));
}

export function getUsableArmTargets(context, actorId) {
  return [BodyPartId.LOWER_ARM_L, BodyPartId.LOWER_ARM_R].filter((partId) => {
    if (!isPartFunctional(context, actorId, partId)) return false;
    return !context.state.relationships.holds.some(
      (hold) => hold.targetId === actorId && hold.targetPartId === partId,
    );
  });
}

export function getEffectiveHoldLeverage(context, hold) {
  const capacity = getPartCapacity(context, hold.controllerId, hold.sourcePartId);
  const participant = getParticipant(context, hold.controllerId);
  const dazeMultiplier = isDazed(context, hold.controllerId) ? 0.7 : 1;
  const exertionMultiplier = Math.max(0.55, 1 - participant.exertion * 0.0045);
  return hold.leverage * capacity * dazeMultiplier * exertionMultiplier;
}

export function validateCombatantInvariants(context) {
  for (const hold of context.state.relationships.holds) {
    if (!getBodyPart(context, hold.controllerId, hold.sourcePartId)) {
      fail(`hold '${hold.id}' uses a missing source part`);
    }
    if (!getBodyPart(context, hold.targetId, hold.targetPartId)) {
      fail(`hold '${hold.id}' targets a missing body part`);
    }
    if (!isPartFunctional(context, hold.controllerId, hold.sourcePartId)) {
      fail(`hold '${hold.id}' uses a nonfunctional source limb`);
    }
  }
  if (context.state.phase === "active") {
    for (const actorId of ["player", "mugger"]) {
      if (isEncounterIncapacitated(context, actorId)) {
        fail(`active participant '${actorId}' is incapacitated`);
      }
    }
  }
}

