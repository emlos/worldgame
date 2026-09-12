import { DamageType } from "../../../characters/core/body.js";
import { keyedRandom01 } from "../../../shared/util/random.js";
import {
  getBalanceCapacity,
  getBodyPerformance,
  getCombatant,
  getParticipant,
  getStat,
  isDazed,
  isPartFunctional,
} from "../combatants.js";
import {
  ENCOUNTER_RANGE,
  getEncounterFacing,
  getEncounterRange,
  setEncounterFacing,
  setEncounterRange,
} from "../state.js";

export function actionInstance(actionId, actorId, targetId, parameters = {}) {
  return { actionId, actorId, targetId, parameters };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function roll(context, instance, purpose) {
  return keyedRandom01(
    context.game.seed,
    [
      "encounter-physical-v1",
      context.instanceKey,
      context.state.exchange,
      instance.actorId,
      instance.actionId,
      purpose,
    ].join(":"),
  );
}

export function chanceRoll(context, instance, runtime, purpose, chance, extra = {}) {
  const value = roll(context, instance, purpose);
  const success = value < chance;
  runtime.events.push({
    type: "chance.rolled",
    actorId: instance.actorId,
    actionId: instance.actionId,
    purpose,
    chance: Math.round(chance * 10000) / 10000,
    roll: Math.round(value * 10000) / 10000,
    success,
    ...extra,
  });
  return success;
}

export function contest(
  context,
  instance,
  runtime,
  { baseChance = 0.58, actorStat = "strength", targetStat = actorStat, modifier = 0 } = {},
) {
  const attacker = getParticipant(context, instance.actorId);
  const defender = getParticipant(context, instance.targetId);
  const statDifference = getStat(context, instance.actorId, actorStat)
    - getStat(context, instance.targetId, targetStat);
  let chance = baseChance + statDifference * 0.035 + modifier;
  chance += (getBodyPerformance(context, instance.actorId) - 1) * 0.4;
  chance += (getBalanceCapacity(context, instance.actorId)
    - getBalanceCapacity(context, instance.targetId)) * 0.18;
  chance -= attacker.exertion * 0.0025;
  chance += defender.exertion * 0.0015;
  if (isDazed(context, instance.actorId)) chance -= 0.14;
  if (isDazed(context, instance.targetId)) chance += 0.12;
  if (runtime.guarded.has(instance.targetId)) chance -= 0.24;
  if (runtime.evading.has(instance.targetId)) chance -= 0.3;
  chance = clamp(chance, 0.18, 0.9);
  return chanceRoll(context, instance, runtime, "contest", chance);
}

export function addExertion(context, actorId, baseAmount) {
  const participant = getParticipant(context, actorId);
  const endurance = getStat(context, actorId, "endurance");
  const amount = Math.max(1, Math.round(baseAmount - endurance * 0.35));
  participant.exertion = clamp(participant.exertion + amount, 0, 100);
  return amount;
}

export function applyImpact(
  context,
  instance,
  runtime,
  { partId, baseDamage, strengthScale = 0.65 },
) {
  let damage = Math.round(baseDamage + getStat(context, instance.actorId, "strength") * strengthScale);
  if (runtime.guarded.has(instance.targetId)) damage = Math.max(1, Math.round(damage * 0.55));
  const part = getCombatant(context, instance.targetId).body.applyDamage({
    partId,
    amount: damage,
    damageType: DamageType.BLUNT,
  });
  if (!part) return 0;
  runtime.events.push({
    type: "impact.landed",
    actorId: instance.actorId,
    targetId: instance.targetId,
    partId,
    damage,
  });
  return damage;
}

export function addDaze(context, actorId, severity, runtime) {
  addAcute(context, actorId, "dazed", severity, 2, runtime);
}

export function addAcute(context, actorId, id, severity, exchanges, runtime) {
  const participant = getParticipant(context, actorId);
  const existing = participant.acute.find((acute) => acute.id === id);
  if (existing) {
    existing.severity = Math.max(existing.severity, severity);
    existing.exchanges = Math.max(existing.exchanges, exchanges);
  } else {
    participant.acute.push({ id, severity, exchanges });
  }
  runtime.events.push({ type: "acute.applied", actorId, id, severity });
}

export function tickAcuteEffects(context) {
  for (const participant of Object.values(context.state.participants)) {
    participant.acute = participant.acute
      .map((acute) => ({ ...acute, exchanges: acute.exchanges - 1 }))
      .filter(({ exchanges }) => exchanges > 0);
  }
}

export function removeHold(context, hold, runtime, reason = "broken") {
  context.state.relationships.holds = context.state.relationships.holds.filter(
    ({ id }) => id !== hold.id,
  );
  runtime.events.push({
    type: "hold.broken",
    holdId: hold.id,
    controllerId: hold.controllerId,
    targetId: hold.targetId,
    targetPartId: hold.targetPartId,
    kind: hold.kind,
    reason,
  });
}

export function removeNonfunctionalHolds(context, runtime) {
  for (const hold of [...context.state.relationships.holds]) {
    if (!isPartFunctional(context, hold.controllerId, hold.sourcePartId)) {
      removeHold(context, hold, runtime, "source-disabled");
    }
  }
}

export function changeRange(context, value, runtime) {
  const from = getEncounterRange(context.state);
  if (from === value) return;
  if (value !== ENCOUNTER_RANGE.clinch && context.state.relationships.holds.length) {
    throw new Error("Physical encounter: range cannot open while a hold remains active");
  }
  setEncounterRange(context.state, value);
  runtime.events.push({ type: "range.changed", from, to: value });
}

export function changePose(context, actorId, pose, runtime) {
  const participant = getParticipant(context, actorId);
  const from = participant.pose;
  if (from === pose) return;
  participant.pose = pose;
  if (pose !== "standing") participant.support = "free";
  runtime.events.push({ type: "pose.changed", actorId, from, to: pose });
}

export function changeFacing(context, actorId, value, runtime) {
  const from = getEncounterFacing(context.state, actorId);
  if (from === value) return;
  setEncounterFacing(context.state, actorId, value);
  runtime.events.push({ type: "facing.changed", actorId, from, to: value });
}

export function increaseDistance(context, runtime) {
  const current = getEncounterRange(context.state);
  if (current === ENCOUNTER_RANGE.clinch) changeRange(context, ENCOUNTER_RANGE.reach, runtime);
  else if (current === ENCOUNTER_RANGE.reach) changeRange(context, ENCOUNTER_RANGE.far, runtime);
}

export function failAction(runtime, instance, reason) {
  runtime.events.push({
    type: "action.failed",
    actorId: instance.actorId,
    actionId: instance.actionId,
    reason,
  });
}

export function proposeOutcome(runtime, id, moneyLost = 0) {
  if (!runtime.outcome) runtime.outcome = { id, moneyLost };
}
