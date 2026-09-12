import { BodyPartId } from "../../characters/core/body.js";
import {
  getBalanceCapacity,
  getEffectiveHoldLeverage,
  getLimbCapacity,
  getParticipant,
  holdsControlledBy,
  hostileHoldsOn,
  isDazed,
  isEncounterIncapacitated,
} from "./combatants.js";
import {
  ENCOUNTER_FACING,
  ENCOUNTER_POSE,
  ENCOUNTER_RANGE,
  getEncounterFacing,
  getEncounterRange,
} from "./state.js";

export function canBeginPhysicalAction(context, actorId) {
  return context.state.phase === "active" && !isEncounterIncapacitated(context, actorId);
}

export function isStanding(context, actorId) {
  return getParticipant(context, actorId).pose === ENCOUNTER_POSE.standing;
}

export function isGrounded(context, actorId) {
  return [ENCOUNTER_POSE.kneeling, ENCOUNTER_POSE.supine, ENCOUNTER_POSE.prone]
    .includes(getParticipant(context, actorId).pose);
}

export function isFacingOpponent(context, actorId, { allowSide = false } = {}) {
  const facing = getEncounterFacing(context.state, actorId);
  return facing === ENCOUNTER_FACING.toward
    || (allowSide && facing === ENCOUNTER_FACING.side);
}

export function getMovementCapacity(context, actorId) {
  const left = Math.min(
    getLimbCapacity(context, actorId, BodyPartId.THIGH_L),
    getLimbCapacity(context, actorId, BodyPartId.KNEE_L),
    getLimbCapacity(context, actorId, BodyPartId.FOOT_L),
  );
  const right = Math.min(
    getLimbCapacity(context, actorId, BodyPartId.THIGH_R),
    getLimbCapacity(context, actorId, BodyPartId.KNEE_R),
    getLimbCapacity(context, actorId, BodyPartId.FOOT_R),
  );
  return Math.max(left, right);
}

export function canMove(context, actorId) {
  return isStanding(context, actorId) && getMovementCapacity(context, actorId) > 0.2;
}

export function getStrongestHostileHold(context, actorId) {
  return hostileHoldsOn(context, actorId)
    .map((hold) => ({ hold, effective: getEffectiveHoldLeverage(context, hold) }))
    .sort((left, right) => right.effective - left.effective)[0] || null;
}

export function hasMovementDenyingHold(context, actorId) {
  const controls = hostileHoldsOn(context, actorId).map((hold) => ({
    hold,
    effective: getEffectiveHoldLeverage(context, hold),
  }));
  return controls.some(({ hold, effective }) => hold.kind === "limb-pin" && effective >= 28)
    || controls.reduce((sum, { effective }) => sum + effective, 0) >= 52;
}

export function hasFirmPin(context, actorId) {
  return hostileHoldsOn(context, actorId).some(
    (hold) => hold.kind === "limb-pin" && getEffectiveHoldLeverage(context, hold) >= 32,
  );
}

export function canStandUp(context, actorId) {
  if (!isGrounded(context, actorId) || hasFirmPin(context, actorId)) return false;
  const arms = Math.max(
    getLimbCapacity(context, actorId, BodyPartId.HAND_L),
    getLimbCapacity(context, actorId, BodyPartId.HAND_R),
  );
  return getMovementCapacity(context, actorId) >= 0.22
    && (arms >= 0.2 || getBalanceCapacity(context, actorId) >= 0.28);
}

export function hasUsableControl(context, controllerId, targetId) {
  const holds = holdsControlledBy(context, controllerId).filter(
    (candidate) => candidate.targetId === targetId,
  );
  if (!holds.length || getEncounterRange(context.state) !== ENCOUNTER_RANGE.clinch) return false;
  const target = getParticipant(context, targetId);
  const effective = holds.map((hold) => ({ hold, value: getEffectiveHoldLeverage(context, hold) }));
  const controlTotal = effective.reduce((sum, entry) => sum + Math.min(70, entry.value), 0);
  const firmPin = effective.some(({ hold, value }) => hold.kind === "limb-pin" && value >= 38);
  const constrainedPosition = target.support === "wall"
    || target.pose !== ENCOUNTER_POSE.standing
    || isDazed(context, targetId);
  return constrainedPosition && (firmPin || controlTotal >= 72);
}

export function isAtStrikingRange(context, actorId, { allowSide = true } = {}) {
  return getEncounterRange(context.state) !== ENCOUNTER_RANGE.far
    && isFacingOpponent(context, actorId, { allowSide });
}
