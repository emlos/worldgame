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
  ENCOUNTER_SUPPORT,
  getEncounterFacing,
  getEncounterRange,
} from "./state.js";

const FRONT_OR_SIDE = Object.freeze([ENCOUNTER_FACING.toward, ENCOUNTER_FACING.side]);
const GROUND_POSES = Object.freeze([
  ENCOUNTER_POSE.kneeling,
  ENCOUNTER_POSE.supine,
  ENCOUNTER_POSE.prone,
]);
const REACHABLE_RANGES = Object.freeze([ENCOUNTER_RANGE.reach, ENCOUNTER_RANGE.clinch]);

function geometryRule({
  ranges = null,
  actorFacings = null,
  targetFacings = null,
  actorPoses = null,
  targetPoses = null,
  actorSupports = null,
  targetSupports = null,
  anyOf = null,
} = {}) {
  const freezeList = (values) => values ? Object.freeze([...values]) : null;
  return Object.freeze({
    ranges: freezeList(ranges),
    actorFacings: freezeList(actorFacings),
    targetFacings: freezeList(targetFacings),
    actorPoses: freezeList(actorPoses),
    targetPoses: freezeList(targetPoses),
    actorSupports: freezeList(actorSupports),
    targetSupports: freezeList(targetSupports),
    anyOf: freezeList(anyOf),
  });
}

// Physical access belongs to the action, not to whichever caller happens to
// enumerate it. Relational responses such as wrenching a known hold
// deliberately omit facing requirements because touch supplies their access.
export const ACTION_GEOMETRY = Object.freeze({
  "controlled-disengage": geometryRule({
    ranges: [ENCOUNTER_RANGE.clinch],
    actorPoses: [ENCOUNTER_POSE.standing],
  }),
  "search-money": geometryRule({
    ranges: [ENCOUNTER_RANGE.clinch],
    actorFacings: FRONT_OR_SIDE,
  }),
  "strike-face": geometryRule({
    ranges: REACHABLE_RANGES,
    actorFacings: FRONT_OR_SIDE,
    targetFacings: FRONT_OR_SIDE,
  }),
  "drive-body": geometryRule({
    ranges: REACHABLE_RANGES,
    actorFacings: FRONT_OR_SIDE,
  }),
  "rough-up": geometryRule({
    ranges: REACHABLE_RANGES,
    actorFacings: FRONT_OR_SIDE,
  }),
  "strike-holding-arm": geometryRule({
    ranges: REACHABLE_RANGES,
    actorFacings: FRONT_OR_SIDE,
  }),
  headbutt: geometryRule({
    ranges: [ENCOUNTER_RANGE.clinch],
    actorFacings: [ENCOUNTER_FACING.toward],
    targetFacings: FRONT_OR_SIDE,
    actorPoses: [ENCOUNTER_POSE.standing, ENCOUNTER_POSE.kneeling],
  }),
  "knee-strike": geometryRule({
    ranges: [ENCOUNTER_RANGE.clinch],
    actorFacings: FRONT_OR_SIDE,
    actorPoses: [ENCOUNTER_POSE.standing],
    targetPoses: [ENCOUNTER_POSE.standing, ENCOUNTER_POSE.kneeling, ENCOUNTER_POSE.supine],
  }),
  "attack-limb": geometryRule({
    ranges: REACHABLE_RANGES,
    actorFacings: FRONT_OR_SIDE,
    targetFacings: FRONT_OR_SIDE,
  }),
  "shove-away": geometryRule({
    ranges: REACHABLE_RANGES,
    actorFacings: FRONT_OR_SIDE,
  }),
  "create-distance": geometryRule({
    ranges: REACHABLE_RANGES,
    actorPoses: [ENCOUNTER_POSE.standing],
  }),
  "stand-up": geometryRule({ actorPoses: GROUND_POSES }),
  "roll-toward": geometryRule({
    anyOf: [
      geometryRule({ actorPoses: GROUND_POSES }),
      geometryRule({ actorSupports: [ENCOUNTER_SUPPORT.wall] }),
    ],
  }),
  "close-distance": geometryRule({
    ranges: [ENCOUNTER_RANGE.far],
    actorFacings: FRONT_OR_SIDE,
    actorPoses: [ENCOUNTER_POSE.standing],
  }),
  run: geometryRule({
    ranges: [ENCOUNTER_RANGE.far],
    actorPoses: [ENCOUNTER_POSE.standing],
  }),
  flee: geometryRule({
    ranges: [ENCOUNTER_RANGE.reach, ENCOUNTER_RANGE.far],
    actorPoses: [ENCOUNTER_POSE.standing],
  }),
  "grab-arm": geometryRule({
    ranges: REACHABLE_RANGES,
    actorFacings: FRONT_OR_SIDE,
  }),
  "wrench-free": geometryRule({ ranges: [ENCOUNTER_RANGE.clinch] }),
  "tighten-hold": geometryRule({ ranges: [ENCOUNTER_RANGE.clinch] }),
  "force-to-wall": geometryRule({
    ranges: [ENCOUNTER_RANGE.clinch],
    actorFacings: FRONT_OR_SIDE,
    actorPoses: [ENCOUNTER_POSE.standing],
    targetPoses: [ENCOUNTER_POSE.standing],
    targetSupports: [ENCOUNTER_SUPPORT.free],
  }),
  "force-to-ground": geometryRule({
    ranges: [ENCOUNTER_RANGE.clinch],
    actorFacings: FRONT_OR_SIDE,
    actorPoses: [ENCOUNTER_POSE.standing],
    targetPoses: [ENCOUNTER_POSE.standing],
  }),
  "turn-target-away": geometryRule({
    ranges: [ENCOUNTER_RANGE.clinch],
    actorFacings: FRONT_OR_SIDE,
    targetFacings: FRONT_OR_SIDE,
    anyOf: [
      geometryRule({ targetSupports: [ENCOUNTER_SUPPORT.wall] }),
      geometryRule({ targetPoses: GROUND_POSES }),
    ],
  }),
  "pin-limb": geometryRule({
    ranges: [ENCOUNTER_RANGE.clinch],
    actorFacings: FRONT_OR_SIDE,
    anyOf: [
      geometryRule({
        targetPoses: [ENCOUNTER_POSE.standing],
        targetSupports: [ENCOUNTER_SUPPORT.wall],
      }),
      geometryRule({
        actorPoses: [ENCOUNTER_POSE.kneeling],
        targetPoses: GROUND_POSES,
      }),
    ],
  }),
});

function matchesGeometryRule(context, actorId, targetId, rule) {
  const actor = getParticipant(context, actorId);
  const target = getParticipant(context, targetId);
  if (rule.ranges && !rule.ranges.includes(getEncounterRange(context.state))) return false;
  if (rule.actorFacings
    && !rule.actorFacings.includes(getEncounterFacing(context.state, actorId))) return false;
  if (rule.targetFacings
    && !rule.targetFacings.includes(getEncounterFacing(context.state, targetId))) return false;
  if (rule.actorPoses && !rule.actorPoses.includes(actor.pose)) return false;
  if (rule.targetPoses && !rule.targetPoses.includes(target.pose)) return false;
  if (rule.actorSupports && !rule.actorSupports.includes(actor.support)) return false;
  if (rule.targetSupports && !rule.targetSupports.includes(target.support)) return false;
  return !rule.anyOf
    || rule.anyOf.some((alternative) => matchesGeometryRule(
      context,
      actorId,
      targetId,
      alternative,
    ));
}

export function hasActionGeometry(context, instance) {
  const rule = ACTION_GEOMETRY[instance.actionId];
  if (!rule) {
    throw new Error(`Physical encounter: action '${instance.actionId}' has no geometry rule`);
  }
  return matchesGeometryRule(context, instance.actorId, instance.targetId, rule);
}

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

export function getDisengagementHoldState(context, actorId) {
  const controls = hostileHoldsOn(context, actorId).map((hold) => ({
    hold,
    effective: getEffectiveHoldLeverage(context, hold),
  }));
  if (!controls.length) return "free";
  if (controls.some(({ hold }) => hold.kind === "limb-pin")) return "blocked";
  const total = controls.reduce((sum, { effective }) => sum + effective, 0);
  if (total <= 18) return "free";
  return total <= 30 ? "contested" : "blocked";
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
