import {
  getEffectiveHoldLeverage,
  getParticipant,
  getUsableHands,
  holdsControlledBy,
  hostileHoldsOn,
  otherParticipantId,
} from "../combatants.js";
import {
  canStandUp,
  canBeginPhysicalAction,
  canMove,
  getDisengagementHoldState,
  hasMovementDenyingHold,
  isGrounded,
} from "../affordances.js";
import {
  actionInstance,
  addExertion,
  changeFacing,
  changePose,
  changeRange,
  changeSupport,
  clamp,
  contest,
  failAction,
  increaseDistance,
  recordTerminalFact,
  removeHold,
} from "./helpers.js";
import {
  ENCOUNTER_FACING,
  ENCOUNTER_POSE,
  ENCOUNTER_RANGE,
  ENCOUNTER_SUPPORT,
  getEncounterFacing,
  getEncounterRange,
} from "../state.js";
import { encounterPronoun, encounterVerb } from "../language.js";
import { requireEncounterObjective } from "../objectives/index.js";
import { controlledParticipantId, goalOwnerId } from "../roles.js";

export const SHOVE_AWAY = Object.freeze({
  id: "shove-away",
  tags: Object.freeze(["movement", "disrupt-hold", "control"]),
  durationSeconds: 2,
  usableBy: "any",
  playerOrder: 30,

  enumerateTargets(context, actorId) {
    if (!getUsableHands(context, actorId).length) return [];
    return [actionInstance(this.id, actorId, otherParticipantId(context, actorId))];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && getEncounterRange(context.state) !== ENCOUNTER_RANGE.far
      && getUsableHands(context, instance.actorId).length > 0;
  },

  label(context, instance) {
    return `Shove ${encounterPronoun(context, instance.targetId, "object")} away`;
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "leans", "lean")} in to shove you off balance`;
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 9);
    if (!contest(context, instance, runtime, { baseChance: 0.61 })) {
      failAction(runtime, instance, "held-ground");
      return;
    }
    const hostile = hostileHoldsOn(context, instance.actorId);
    for (const hold of hostile) {
      const effective = getEffectiveHoldLeverage(context, hold);
      if (effective < 48) removeHold(context, hold, runtime, "shoved-loose");
      else {
        hold.leverage = Math.max(1, hold.leverage - 20);
        runtime.events.push({ type: "hold.weakened", holdId: hold.id, amount: 20 });
      }
    }
    if (!hostileHoldsOn(context, instance.actorId).length) {
      for (const hold of [...holdsControlledBy(context, instance.actorId)]) {
        removeHold(context, hold, runtime, "released-to-shove");
      }
      increaseDistance(context, runtime);
    }
  },
});

export const CREATE_DISTANCE = Object.freeze({
  id: "create-distance",
  tags: Object.freeze(["movement", "escape"]),
  durationSeconds: 3,
  usableBy: "any",
  playerOrder: 50,

  enumerateTargets(context, actorId) {
    return [actionInstance(this.id, actorId, otherParticipantId(context, actorId))];
  },

  isAvailable(context, instance) {
    const holdState = getDisengagementHoldState(context, instance.actorId);
    return canBeginPhysicalAction(context, instance.actorId)
      && canMove(context, instance.actorId)
      && getEncounterRange(context.state) !== ENCOUNTER_RANGE.far
      && holdState !== "blocked";
  },

  label() {
    return "Create some distance";
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "shifts", "shift")} back, looking for room to get away`;
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 5);
    runtime.evading.add(instance.actorId);
    const hostile = hostileHoldsOn(context, instance.actorId);
    if (getDisengagementHoldState(context, instance.actorId) === "contested") {
      const totalLeverage = hostile.reduce(
        (sum, hold) => sum + getEffectiveHoldLeverage(context, hold),
        0,
      );
      if (!contest(context, instance, runtime, {
        baseChance: 0.58,
        actorStat: "fitness",
        targetStat: "strength",
        modifier: -totalLeverage * 0.006,
        defense: "neutral",
      })) {
        failAction(runtime, instance, "could-not-disengage");
        return;
      }
    }
    const disengagedHolds = [
      ...hostile,
      ...holdsControlledBy(context, instance.actorId),
    ];
    for (const hold of disengagedHolds) {
      removeHold(context, hold, runtime, "slipped-loose");
    }
    changeSupport(context, instance.actorId, ENCOUNTER_SUPPORT.free, runtime);
    increaseDistance(context, runtime);
  },
});

export const STAND_UP = Object.freeze({
  id: "stand-up",
  tags: Object.freeze(["movement", "position", "recovery"]),
  durationSeconds: 3,
  usableBy: "any",
  playerOrder: 2,

  enumerateTargets(context, actorId) {
    return [actionInstance(this.id, actorId, otherParticipantId(context, actorId))];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && canStandUp(context, instance.actorId);
  },

  label() {
    return "Try to stand up";
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "plants", "plant")} ${encounterPronoun(context, intent.actorId, "dependent")} limbs and ${encounterVerb(context, intent.actorId, "starts", "start")} to rise`;
  },

  resolve(context, instance, runtime) {
    const hostile = hostileHoldsOn(context, instance.actorId);
    addExertion(context, instance.actorId, 10);
    if (hostile.length && !contest(context, instance, runtime, {
      baseChance: 0.61,
      actorStat: "fitness",
      targetStat: "strength",
      modifier: -hostile.reduce(
        (sum, hold) => sum + getEffectiveHoldLeverage(context, hold) * 0.0015,
        0,
      ),
    })) {
      failAction(runtime, instance, "kept-down");
      return;
    }
    changePose(context, instance.actorId, ENCOUNTER_POSE.standing, runtime);
    changeFacing(context, instance.actorId, ENCOUNTER_FACING.toward, runtime);
  },
});

export const ROLL_TOWARD = Object.freeze({
  id: "roll-toward",
  tags: Object.freeze(["movement", "position", "facing", "disrupt-hold"]),
  durationSeconds: 2,
  usableBy: "any",
  playerOrder: 3,

  enumerateTargets(context, actorId) {
    return [actionInstance(this.id, actorId, otherParticipantId(context, actorId))];
  },

  isAvailable(context, instance) {
    const participant = getParticipant(context, instance.actorId);
    return canBeginPhysicalAction(context, instance.actorId)
      && (isGrounded(context, instance.actorId)
        || participant.support === ENCOUNTER_SUPPORT.wall)
      && (getEncounterFacing(context.state, instance.actorId) !== ENCOUNTER_FACING.toward
        || participant.pose === ENCOUNTER_POSE.prone);
  },

  label(context, instance) {
    return isGrounded(context, instance.actorId)
      ? `Roll to face ${encounterPronoun(context, instance.targetId, "object")}`
      : `Turn back toward ${encounterPronoun(context, instance.targetId, "object")}`;
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "twists", "twist")} to face you and recover a safer angle`;
  },

  resolve(context, instance, runtime) {
    const hostile = hostileHoldsOn(context, instance.actorId);
    addExertion(context, instance.actorId, 7);
    const strongest = hostile
      .map((hold) => ({ hold, effective: getEffectiveHoldLeverage(context, hold) }))
      .sort((left, right) => right.effective - left.effective)[0] || null;
    if (strongest && !contest(context, instance, runtime, {
      baseChance: 0.64,
      actorStat: "fitness",
      targetStat: "strength",
      modifier: -strongest.effective * 0.002,
    })) {
      strongest.hold.leverage = clamp(strongest.hold.leverage - 8, 1, 100);
      runtime.events.push({ type: "hold.weakened", holdId: strongest.hold.id, amount: 8 });
      failAction(runtime, instance, "turn-blocked");
      return;
    }
    changeFacing(context, instance.actorId, ENCOUNTER_FACING.toward, runtime);
    if (getParticipant(context, instance.actorId).pose === ENCOUNTER_POSE.prone) {
      changePose(context, instance.actorId, ENCOUNTER_POSE.supine, runtime);
    }
    for (const hold of [...hostile]) {
      const reduction = hold.kind === "limb-pin" ? 14 : 8;
      hold.leverage = Math.max(0, hold.leverage - reduction);
      runtime.events.push({ type: "hold.weakened", holdId: hold.id, amount: reduction });
      if (hold.leverage <= 0) removeHold(context, hold, runtime, "turned-free");
    }
  },
});

export const CLOSE_DISTANCE = Object.freeze({
  id: "close-distance",
  tags: Object.freeze(["movement", "control"]),
  durationSeconds: 2,
  usableBy: "goal-owner",
  playerOrder: 100,

  enumerateTargets(context, actorId) {
    return [actionInstance(this.id, actorId, otherParticipantId(context, actorId))];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && canMove(context, instance.actorId)
      && getEncounterRange(context.state) === ENCOUNTER_RANGE.far;
  },

  label() {
    return "Close the distance";
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "lunges", "lunge")} after you before you can get clear`;
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 6);
    if (!contest(context, instance, runtime, {
      baseChance: 0.68,
      actorStat: "fitness",
      targetStat: "fitness",
    })) {
      failAction(runtime, instance, "could-not-close");
      requireEncounterObjective(context.state).recordControlFailure?.(context, instance.actorId);
      return;
    }
    changeRange(context, ENCOUNTER_RANGE.reach, runtime);
  },
});

export const RUN = Object.freeze({
  id: "run",
  tags: Object.freeze(["movement", "escape", "terminal"]),
  durationSeconds: 4,
  usableBy: "controlled",
  playerOrder: 1,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, actorId)];
  },

  isAvailable(context, instance) {
    return instance.actorId === controlledParticipantId(context.state)
      && canBeginPhysicalAction(context, instance.actorId)
      && canMove(context, instance.actorId)
      && getEncounterRange(context.state) === ENCOUNTER_RANGE.far
      && !hasMovementDenyingHold(context, instance.actorId);
  },

  label() {
    return "Run from the alley";
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "turns", "turn")} to run`;
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 10);
    recordTerminalFact(runtime, { type: "participant-escaped", participantId: instance.actorId });
    runtime.events.push({ type: "escape.completed", actorId: instance.actorId });
  },
});

export const FLEE = Object.freeze({
  id: "flee",
  tags: Object.freeze(["movement", "retreat", "terminal"]),
  durationSeconds: 3,
  usableBy: "goal-owner",
  playerOrder: 100,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, actorId)];
  },

  isAvailable(context, instance) {
    return instance.actorId === goalOwnerId(context.state)
      && canBeginPhysicalAction(context, instance.actorId)
      && canMove(context, instance.actorId)
      && getEncounterRange(context.state) !== ENCOUNTER_RANGE.clinch;
  },

  label() {
    return "Flee";
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "glances", "glance")} toward the street and ${encounterVerb(context, intent.actorId, "prepares", "prepare")} to bolt`;
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 7);
    changeRange(context, ENCOUNTER_RANGE.far, runtime);
    recordTerminalFact(runtime, { type: "participant-escaped", participantId: instance.actorId });
    runtime.events.push({ type: "escape.completed", actorId: instance.actorId });
  },
});
