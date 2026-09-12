import { BodyPartId } from "../../../characters/core/body.js";
import {
  getStat,
  getUsableHands,
  hostileHoldsOn,
} from "../combatants.js";
import { canBeginPhysicalAction, isAtStrikingRange } from "../affordances.js";
import {
  actionInstance,
  addDaze,
  addExertion,
  applyImpact,
  contest,
  failAction,
  removeHold,
  removeNonfunctionalHolds,
  roll,
} from "./helpers.js";

function ordinaryStrikeTargets(context, actorId, actionId) {
  const sourcePartId = getUsableHands(context, actorId)[0];
  if (!sourcePartId) return [];
  const targetId = actorId === "player" ? "mugger" : "player";
  return [actionInstance(actionId, actorId, targetId, { sourcePartId })];
}

function ordinaryStrikeAvailable(context, instance) {
  return canBeginPhysicalAction(context, instance.actorId)
    && isAtStrikingRange(context)
    && getUsableHands(context, instance.actorId).includes(instance.parameters.sourcePartId);
}

export const STRIKE_FACE = Object.freeze({
  id: "strike-face",
  tags: Object.freeze(["attack", "impact", "daze"]),
  durationSeconds: 2,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 10,

  enumerateTargets(context, actorId) {
    return ordinaryStrikeTargets(context, actorId, this.id);
  },

  isAvailable: ordinaryStrikeAvailable,

  label() {
    return "Strike at their face";
  },

  intentLabel() {
    return `draws back a hand to strike at your face`;
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 7);
    if (!contest(context, instance, runtime, { baseChance: 0.57 })) {
      failAction(runtime, instance, "missed");
      return;
    }
    const damage = applyImpact(context, instance, runtime, {
      partId: BodyPartId.FACE,
      baseDamage: 10,
      strengthScale: 0.7,
    });
    const dazeChance = Math.min(0.68, 0.24 + damage * 0.025);
    if (roll(context, instance, "daze") < dazeChance) {
      addDaze(context, instance.targetId, damage >= 16 ? 2 : 1, runtime);
    }
    removeNonfunctionalHolds(context, runtime);
  },
});

export const DRIVE_BODY = Object.freeze({
  id: "drive-body",
  tags: Object.freeze(["attack", "impact", "pressure"]),
  durationSeconds: 2,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 20,

  enumerateTargets(context, actorId) {
    return ordinaryStrikeTargets(context, actorId, this.id);
  },

  isAvailable: ordinaryStrikeAvailable,

  label() {
    return "Drive a strike into their body";
  },

  intentLabel() {
    return "sets their weight to drive a strike into your body";
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 7);
    if (!contest(context, instance, runtime, { baseChance: 0.64 })) {
      failAction(runtime, instance, "missed");
      return;
    }
    applyImpact(context, instance, runtime, {
      partId: BodyPartId.ABDOMEN,
      baseDamage: 12,
      strengthScale: 0.75,
    });
  },
});

export const STRIKE_HOLDING_ARM = Object.freeze({
  id: "strike-holding-arm",
  tags: Object.freeze(["attack", "impact", "disrupt-hold"]),
  durationSeconds: 2,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 5,

  enumerateTargets(context, actorId) {
    const sourcePartId = getUsableHands(context, actorId)[0];
    if (!sourcePartId) return [];
    return hostileHoldsOn(context, actorId).map((hold) =>
      actionInstance(this.id, actorId, hold.controllerId, {
        sourcePartId,
        holdId: hold.id,
      }));
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && getUsableHands(context, instance.actorId).includes(instance.parameters.sourcePartId)
      && hostileHoldsOn(context, instance.actorId).some(({ id }) => id === instance.parameters.holdId);
  },

  label() {
    return "Strike the arm gripping your wrist";
  },

  intentLabel() {
    return "tries to batter the arm controlling their wrist";
  },

  resolve(context, instance, runtime) {
    const hold = hostileHoldsOn(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    addExertion(context, instance.actorId, 6);
    if (!hold || !contest(context, instance, runtime, { baseChance: 0.67 })) {
      failAction(runtime, instance, hold ? "missed" : "hold-gone");
      return;
    }
    const damage = applyImpact(context, instance, runtime, {
      partId: hold.sourcePartId,
      baseDamage: 8,
      strengthScale: 0.65,
    });
    const reduction = Math.round(20 + getStat(context, instance.actorId, "strength") * 1.5);
    hold.leverage = Math.max(0, hold.leverage - reduction);
    runtime.events.push({ type: "hold.weakened", holdId: hold.id, amount: reduction });
    if (hold.leverage <= 0 || damage >= 14) removeHold(context, hold, runtime, "struck-loose");
    removeNonfunctionalHolds(context, runtime);
  },
});
