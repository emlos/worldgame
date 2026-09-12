import { BodyPartId } from "../../characters/core/body.js";
import {
  getEffectiveHoldLeverage,
  getPartCapacity,
  getParticipant,
  holdsControlledBy,
  hostileHoldsOn,
  isDazed,
  isEncounterIncapacitated,
} from "./combatants.js";
import { ENCOUNTER_POSE, ENCOUNTER_RANGE, getEncounterRange } from "./state.js";

export function canBeginPhysicalAction(context, actorId) {
  return context.state.phase === "active" && !isEncounterIncapacitated(context, actorId);
}

export function isStanding(context, actorId) {
  return getParticipant(context, actorId).pose === ENCOUNTER_POSE.standing;
}

export function getMovementCapacity(context, actorId) {
  const left = Math.min(
    getPartCapacity(context, actorId, BodyPartId.THIGH_L),
    getPartCapacity(context, actorId, BodyPartId.KNEE_L),
    getPartCapacity(context, actorId, BodyPartId.FOOT_L),
  );
  const right = Math.min(
    getPartCapacity(context, actorId, BodyPartId.THIGH_R),
    getPartCapacity(context, actorId, BodyPartId.KNEE_R),
    getPartCapacity(context, actorId, BodyPartId.FOOT_R),
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
  return (getStrongestHostileHold(context, actorId)?.effective || 0) >= 35;
}

export function hasUsableControl(context, controllerId, targetId) {
  const hold = holdsControlledBy(context, controllerId).find(
    (candidate) => candidate.targetId === targetId,
  );
  if (!hold || getEncounterRange(context.state) !== ENCOUNTER_RANGE.clinch) return false;
  const target = getParticipant(context, targetId);
  return getEffectiveHoldLeverage(context, hold) >= 38
    && (target.support === "wall" || isDazed(context, targetId));
}

export function isAtStrikingRange(context) {
  return getEncounterRange(context.state) !== ENCOUNTER_RANGE.far;
}

