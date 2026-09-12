import {
  getEffectiveHoldLeverage,
  getParticipant,
  getStat,
  getUsableArmTargets,
  getUsableHands,
  holdsControlledBy,
  hostileHoldsOn,
} from "../combatants.js";
import {
  canBeginPhysicalAction,
  hasUsableControl,
  isStanding,
} from "../affordances.js";
import {
  actionInstance,
  addExertion,
  changeRange,
  clamp,
  contest,
  failAction,
  proposeOutcome,
  removeHold,
  roll,
} from "./helpers.js";
import {
  ENCOUNTER_OUTCOME,
  ENCOUNTER_RANGE,
  ENCOUNTER_SUPPORT,
  getEncounterRange,
} from "../state.js";

function opponent(actorId) {
  return actorId === "player" ? "mugger" : "player";
}

function sideName(partId) {
  return partId.endsWith("_l") ? "left" : "right";
}

export const GRAB_ARM = Object.freeze({
  id: "grab-arm",
  tags: Object.freeze(["hold", "control"]),
  durationSeconds: 2,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 40,

  enumerateTargets(context, actorId) {
    const sourcePartId = getUsableHands(context, actorId)[0];
    const targetId = opponent(actorId);
    const targetPartId = getUsableArmTargets(context, targetId)[0];
    if (!sourcePartId || !targetPartId) return [];
    return [actionInstance(this.id, actorId, targetId, { sourcePartId, targetPartId })];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && getEncounterRange(context.state) !== ENCOUNTER_RANGE.far
      && context.state.relationships.holds.length === 0
      && getUsableHands(context, instance.actorId).includes(instance.parameters.sourcePartId)
      && getUsableArmTargets(context, instance.targetId).includes(instance.parameters.targetPartId);
  },

  label(_context, instance) {
    return `Grab their ${sideName(instance.parameters.targetPartId)} arm`;
  },

  intentLabel(_context, instance) {
    return `reaches for your ${sideName(instance.parameters.targetPartId)} wrist`;
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 7);
    if (!contest(context, instance, runtime, { baseChance: 0.55 })) {
      failAction(runtime, instance, "grip-missed");
      if (instance.actorId === "mugger") context.state.objective.failedControlAttempts += 1;
      return;
    }
    if (context.state.relationships.holds.length) {
      failAction(runtime, instance, "control-contested");
      if (instance.actorId === "mugger") context.state.objective.failedControlAttempts += 1;
      return;
    }
    const leverage = clamp(
      Math.round(
        36
        + getStat(context, instance.actorId, "strength") * 3
        - getStat(context, instance.targetId, "strength"),
      ),
      22,
      68,
    );
    const hold = {
      id: `hold-${context.state.exchange + 1}-${instance.actorId}`,
      controllerId: instance.actorId,
      sourcePartId: instance.parameters.sourcePartId,
      targetId: instance.targetId,
      targetPartId: instance.parameters.targetPartId,
      kind: "wrist-grip",
      leverage,
    };
    context.state.relationships.holds.push(hold);
    changeRange(context, ENCOUNTER_RANGE.clinch, runtime);
    runtime.events.push({
      type: "hold.created",
      holdId: hold.id,
      controllerId: hold.controllerId,
      targetId: hold.targetId,
      targetPartId: hold.targetPartId,
    });
  },
});

export const WRENCH_FREE = Object.freeze({
  id: "wrench-free",
  tags: Object.freeze(["escape", "disrupt-hold"]),
  durationSeconds: 3,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 4,

  enumerateTargets(context, actorId) {
    return hostileHoldsOn(context, actorId).map((hold) =>
      actionInstance(this.id, actorId, hold.controllerId, { holdId: hold.id }));
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && hostileHoldsOn(context, instance.actorId).some(({ id }) => id === instance.parameters.holdId);
  },

  label() {
    return "Try to wrench your wrist free";
  },

  intentLabel() {
    return "twists hard against the wrist hold";
  },

  resolve(context, instance, runtime) {
    const hold = hostileHoldsOn(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    addExertion(context, instance.actorId, 11);
    if (!hold) {
      failAction(runtime, instance, "hold-gone");
      return;
    }
    const effective = getEffectiveHoldLeverage(context, hold);
    const chance = clamp(
      0.54
      + (getStat(context, instance.actorId, "strength")
        - getStat(context, hold.controllerId, "strength")) * 0.035
      - effective * 0.004,
      0.28,
      0.86,
    );
    const success = roll(context, instance, "wrench") < chance;
    runtime.events.push({
      type: "contest.rolled",
      actorId: instance.actorId,
      actionId: instance.actionId,
      success,
    });
    if (success) {
      removeHold(context, hold, runtime, "wrenched-free");
      return;
    }
    const reduction = Math.max(5, Math.round(8 + getStat(context, instance.actorId, "strength")));
    hold.leverage = Math.max(0, hold.leverage - reduction);
    runtime.events.push({ type: "hold.weakened", holdId: hold.id, amount: reduction });
    if (hold.leverage <= 0) removeHold(context, hold, runtime, "worn-loose");
    else failAction(runtime, instance, "grip-held");
  },
});

export const TIGHTEN_HOLD = Object.freeze({
  id: "tighten-hold",
  tags: Object.freeze(["hold", "control"]),
  durationSeconds: 2,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 70,

  enumerateTargets(context, actorId) {
    return holdsControlledBy(context, actorId).map((hold) =>
      actionInstance(this.id, actorId, hold.targetId, { holdId: hold.id }));
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && holdsControlledBy(context, instance.actorId).some(({ id }) => id === instance.parameters.holdId);
  },

  label() {
    return "Reinforce your grip";
  },

  intentLabel() {
    return "adjusts their grip to tighten control of your wrist";
  },

  resolve(context, instance, runtime) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    addExertion(context, instance.actorId, 6);
    if (!hold) {
      failAction(runtime, instance, "hold-gone");
      return;
    }
    const amount = Math.max(8, Math.round(14 + getStat(context, instance.actorId, "strength") * 0.5));
    hold.leverage = clamp(hold.leverage + amount, 1, 100);
    runtime.events.push({ type: "hold.strengthened", holdId: hold.id, amount });
  },
});

export const FORCE_TO_WALL = Object.freeze({
  id: "force-to-wall",
  tags: Object.freeze(["hold", "control", "position"]),
  durationSeconds: 3,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 80,

  enumerateTargets(context, actorId) {
    return holdsControlledBy(context, actorId).map((hold) =>
      actionInstance(this.id, actorId, hold.targetId, { holdId: hold.id }));
  },

  isAvailable(context, instance) {
    const target = getParticipant(context, instance.targetId);
    return canBeginPhysicalAction(context, instance.actorId)
      && getEncounterRange(context.state) === ENCOUNTER_RANGE.clinch
      && isStanding(context, instance.actorId)
      && isStanding(context, instance.targetId)
      && target.support === ENCOUNTER_SUPPORT.free
      && holdsControlledBy(context, instance.actorId).some(
        (hold) => hold.id === instance.parameters.holdId
          && getEffectiveHoldLeverage(context, hold) >= 42,
      );
  },

  label() {
    return "Try to force them against the wall";
  },

  intentLabel() {
    return "shifts their weight to force you against the wall";
  },

  resolve(context, instance, runtime) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    addExertion(context, instance.actorId, 10);
    if (!hold) {
      failAction(runtime, instance, "hold-gone");
      return;
    }
    const modifier = getEffectiveHoldLeverage(context, hold) * 0.003;
    if (!contest(context, instance, runtime, { baseChance: 0.5, modifier })) {
      failAction(runtime, instance, "position-held");
      if (instance.actorId === "mugger") context.state.objective.failedControlAttempts += 1;
      return;
    }
    getParticipant(context, instance.targetId).support = ENCOUNTER_SUPPORT.wall;
    hold.leverage = clamp(hold.leverage + 8, 1, 100);
    runtime.events.push({
      type: "support.changed",
      actorId: instance.targetId,
      from: ENCOUNTER_SUPPORT.free,
      to: ENCOUNTER_SUPPORT.wall,
    });
  },
});

export const SEARCH_MONEY = Object.freeze({
  id: "search-money",
  tags: Object.freeze(["objective", "theft", "terminal"]),
  durationSeconds: 4,
  usableBy: Object.freeze(["mugger"]),
  playerOrder: 100,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, "player")];
  },

  isAvailable(context, instance) {
    return instance.actorId === "mugger"
      && canBeginPhysicalAction(context, instance.actorId)
      && getUsableHands(context, instance.actorId).length > 0
      && hasUsableControl(context, instance.actorId, instance.targetId);
  },

  label() {
    return "Take the money";
  },

  intentLabel() {
    return "keeps you controlled and reaches toward your money";
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 6);
    const objective = context.state.objective;
    const available = Math.max(0, Math.floor(context.game.player.money));
    const moneyLost = Math.min(objective.amount, available);
    if (moneyLost > 0) {
      context.game.player.adjustMoney(-moneyLost);
      objective.hasLoot = true;
      runtime.events.push({ type: "theft.completed", actorId: instance.actorId, amount: moneyLost });
      proposeOutcome(runtime, ENCOUNTER_OUTCOME.theftPlayerConscious, moneyLost);
      return;
    }
    runtime.events.push({ type: "theft.empty", actorId: instance.actorId });
    proposeOutcome(runtime, ENCOUNTER_OUTCOME.muggerFled);
  },
});
