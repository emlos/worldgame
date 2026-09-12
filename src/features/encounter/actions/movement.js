import {
  getEffectiveHoldLeverage,
  getUsableHands,
  holdsControlledBy,
  hostileHoldsOn,
} from "../combatants.js";
import {
  canBeginPhysicalAction,
  canMove,
  hasMovementDenyingHold,
} from "../affordances.js";
import {
  actionInstance,
  addExertion,
  changeRange,
  contest,
  failAction,
  increaseDistance,
  proposeOutcome,
  removeHold,
} from "./helpers.js";
import {
  ENCOUNTER_OUTCOME,
  ENCOUNTER_RANGE,
  getEncounterRange,
} from "../state.js";

function opponent(actorId) {
  return actorId === "player" ? "mugger" : "player";
}

export const SHOVE_AWAY = Object.freeze({
  id: "shove-away",
  tags: Object.freeze(["movement", "disrupt-hold", "control"]),
  durationSeconds: 3,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 30,

  enumerateTargets(context, actorId) {
    if (!getUsableHands(context, actorId).length) return [];
    return [actionInstance(this.id, actorId, opponent(actorId))];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && getEncounterRange(context.state) !== ENCOUNTER_RANGE.far
      && getUsableHands(context, instance.actorId).length > 0;
  },

  label() {
    return "Shove them away";
  },

  intentLabel() {
    return "leans in to shove you off balance";
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
    if (!hostileHoldsOn(context, instance.actorId).length) increaseDistance(context, runtime);
  },
});

export const CREATE_DISTANCE = Object.freeze({
  id: "create-distance",
  tags: Object.freeze(["movement", "escape"]),
  durationSeconds: 2,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 50,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, opponent(actorId))];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && canMove(context, instance.actorId)
      && getEncounterRange(context.state) !== ENCOUNTER_RANGE.far
      && !hasMovementDenyingHold(context, instance.actorId);
  },

  label() {
    return "Create some distance";
  },

  intentLabel() {
    return "shifts back, looking for room to get away";
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 5);
    runtime.evading.add(instance.actorId);
    const disengagedHolds = [
      ...hostileHoldsOn(context, instance.actorId),
      ...holdsControlledBy(context, instance.actorId),
    ];
    for (const hold of disengagedHolds) {
      removeHold(context, hold, runtime, "slipped-loose");
    }
    increaseDistance(context, runtime);
  },
});

export const CLOSE_DISTANCE = Object.freeze({
  id: "close-distance",
  tags: Object.freeze(["movement", "control"]),
  durationSeconds: 2,
  usableBy: Object.freeze(["mugger"]),
  playerOrder: 100,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, opponent(actorId))];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && canMove(context, instance.actorId)
      && getEncounterRange(context.state) === ENCOUNTER_RANGE.far;
  },

  label() {
    return "Close the distance";
  },

  intentLabel() {
    return "lunges after you before you can get clear";
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 6);
    if (!contest(context, instance, runtime, {
      baseChance: 0.54,
      actorStat: "fitness",
      targetStat: "fitness",
    })) {
      failAction(runtime, instance, "could-not-close");
      context.state.objective.failedControlAttempts += 1;
      return;
    }
    changeRange(context, ENCOUNTER_RANGE.reach, runtime);
  },
});

export const RUN = Object.freeze({
  id: "run",
  tags: Object.freeze(["movement", "escape", "terminal"]),
  durationSeconds: 4,
  usableBy: Object.freeze(["player"]),
  playerOrder: 1,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, actorId)];
  },

  isAvailable(context, instance) {
    return instance.actorId === "player"
      && canBeginPhysicalAction(context, instance.actorId)
      && canMove(context, instance.actorId)
      && getEncounterRange(context.state) === ENCOUNTER_RANGE.far
      && !hasMovementDenyingHold(context, instance.actorId);
  },

  label() {
    return "Run from the alley";
  },

  intentLabel() {
    return "turns to run";
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 10);
    proposeOutcome(runtime, ENCOUNTER_OUTCOME.playerEscaped);
    runtime.events.push({ type: "escape.completed", actorId: instance.actorId });
  },
});

export const FLEE = Object.freeze({
  id: "flee",
  tags: Object.freeze(["movement", "retreat", "terminal"]),
  durationSeconds: 3,
  usableBy: Object.freeze(["mugger"]),
  playerOrder: 100,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, actorId)];
  },

  isAvailable(context, instance) {
    return instance.actorId === "mugger"
      && canBeginPhysicalAction(context, instance.actorId)
      && canMove(context, instance.actorId)
      && getEncounterRange(context.state) !== ENCOUNTER_RANGE.clinch;
  },

  label() {
    return "Flee";
  },

  intentLabel() {
    return "glances toward the street and prepares to bolt";
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 7);
    proposeOutcome(runtime, ENCOUNTER_OUTCOME.muggerFled);
    runtime.events.push({ type: "escape.completed", actorId: instance.actorId });
  },
});
