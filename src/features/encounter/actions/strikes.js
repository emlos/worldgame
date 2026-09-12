import { BodyPartId } from "../../../characters/core/body.js";
import {
  getBalanceCapacity,
  getLimbCapacity,
  getPartCapacity,
  getStat,
  getUsableHands,
  getUsableKnees,
  hostileHoldsOn,
} from "../combatants.js";
import {
  canBeginPhysicalAction,
  isAtStrikingRange,
  isFacingOpponent,
} from "../affordances.js";
import {
  addAcute,
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
import { ENCOUNTER_POSE, ENCOUNTER_RANGE, getEncounterRange } from "../state.js";

function ordinaryStrikeTargets(context, actorId, actionId) {
  const sourcePartId = getUsableHands(context, actorId)[0];
  if (!sourcePartId) return [];
  const targetId = actorId === "player" ? "mugger" : "player";
  return [actionInstance(actionId, actorId, targetId, { sourcePartId })];
}

function ordinaryStrikeAvailable(context, instance) {
  return canBeginPhysicalAction(context, instance.actorId)
    && isAtStrikingRange(context, instance.actorId)
    && getUsableHands(context, instance.actorId).includes(instance.parameters.sourcePartId);
}

function sideName(partId) {
  return partId.endsWith("_l") ? "left" : "right";
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

  isAvailable(context, instance) {
    return ordinaryStrikeAvailable(context, instance)
      && isFacingOpponent(context, instance.targetId, { allowSide: true });
  },

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
    const sourcePartId = getUsableHands(context, actorId)[0]
      || (context.state.participants[actorId].pose === ENCOUNTER_POSE.standing
        ? getUsableKnees(context, actorId)[0]
        : null);
    if (!sourcePartId) return [];
    return hostileHoldsOn(context, actorId).map((hold) =>
      actionInstance(this.id, actorId, hold.controllerId, {
        sourcePartId,
        holdId: hold.id,
      }));
  },

  isAvailable(context, instance) {
    const usableSource = getUsableHands(context, instance.actorId)
      .includes(instance.parameters.sourcePartId)
      || (context.state.participants[instance.actorId].pose === ENCOUNTER_POSE.standing
        && getUsableKnees(context, instance.actorId).includes(instance.parameters.sourcePartId)
        && getBalanceCapacity(context, instance.actorId) > 0.4);
    return canBeginPhysicalAction(context, instance.actorId)
      && isAtStrikingRange(context, instance.actorId)
      && usableSource
      && hostileHoldsOn(context, instance.actorId).some(({ id }) => id === instance.parameters.holdId);
  },

  label(context, instance) {
    const hold = hostileHoldsOn(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    if (!hold) return "Strike the limb controlling you";
    return `Strike the ${sideName(hold.sourcePartId)} limb ${hold.kind === "limb-pin" ? "pinning" : "gripping"} your ${sideName(hold.targetPartId)} arm`;
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

export const HEADBUTT = Object.freeze({
  id: "headbutt",
  tags: Object.freeze(["attack", "impact", "daze", "self-risk"]),
  durationSeconds: 1,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 8,

  enumerateTargets(_context, actorId) {
    const targetId = actorId === "player" ? "mugger" : "player";
    return [actionInstance(this.id, actorId, targetId, { sourcePartId: BodyPartId.HEAD })];
  },

  isAvailable(context, instance) {
    const pose = context.state.participants[instance.actorId].pose;
    return canBeginPhysicalAction(context, instance.actorId)
      && getEncounterRange(context.state) === ENCOUNTER_RANGE.clinch
      && ![ENCOUNTER_POSE.supine, ENCOUNTER_POSE.prone].includes(pose)
      && getPartCapacity(context, instance.actorId, BodyPartId.HEAD) > 0.3
      && isFacingOpponent(context, instance.actorId)
      && isFacingOpponent(context, instance.targetId, { allowSide: true });
  },

  label() {
    return "Try to headbutt them";
  },

  intentLabel() {
    return "draws their head back for a close strike";
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 7);
    if (!contest(context, instance, runtime, { baseChance: 0.58 })) {
      failAction(runtime, instance, "missed");
      if (roll(context, instance, "self-daze-miss") < 0.18) {
        addDaze(context, instance.actorId, 1, runtime);
      }
      return;
    }
    const damage = applyImpact(context, instance, runtime, {
      partId: BodyPartId.FACE,
      baseDamage: 8,
      strengthScale: 0.45,
    });
    applyImpact(context, { ...instance, targetId: instance.actorId }, runtime, {
      partId: BodyPartId.HEAD,
      baseDamage: 4,
      strengthScale: 0.1,
    });
    if (roll(context, instance, "target-daze") < Math.min(0.62, 0.28 + damage * 0.02)) {
      addDaze(context, instance.targetId, damage >= 13 ? 2 : 1, runtime);
    }
    if (roll(context, instance, "self-daze") < 0.12) addDaze(context, instance.actorId, 1, runtime);
    removeNonfunctionalHolds(context, runtime);
  },
});

export const KNEE_STRIKE = Object.freeze({
  id: "knee-strike",
  tags: Object.freeze(["attack", "impact", "pressure", "balance-risk"]),
  durationSeconds: 2,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 18,

  enumerateTargets(context, actorId) {
    const sourcePartId = getUsableKnees(context, actorId)[0];
    if (!sourcePartId) return [];
    return [actionInstance(this.id, actorId, actorId === "player" ? "mugger" : "player", {
      sourcePartId,
    })];
  },

  isAvailable(context, instance) {
    const plantedFoot = instance.parameters.sourcePartId === BodyPartId.KNEE_L
      ? BodyPartId.FOOT_R
      : BodyPartId.FOOT_L;
    return canBeginPhysicalAction(context, instance.actorId)
      && getEncounterRange(context.state) === ENCOUNTER_RANGE.clinch
      && context.state.participants[instance.actorId].pose === ENCOUNTER_POSE.standing
      && context.state.participants[instance.targetId].pose !== ENCOUNTER_POSE.prone
      && isFacingOpponent(context, instance.actorId, { allowSide: true })
      && getUsableKnees(context, instance.actorId).includes(instance.parameters.sourcePartId)
      && getLimbCapacity(context, instance.actorId, plantedFoot) > 0.32
      && getBalanceCapacity(context, instance.actorId) > 0.4;
  },

  label() {
    return "Drive a knee into their body";
  },

  intentLabel() {
    return "shifts onto one leg to drive a knee into you";
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 9);
    if (!contest(context, instance, runtime, { baseChance: 0.61 })) {
      failAction(runtime, instance, "lost-balance");
      if (roll(context, instance, "balance-risk") < 0.38) {
        addAcute(context, instance.actorId, "off-balance", 1, 2, runtime);
      }
      return;
    }
    const damage = applyImpact(context, instance, runtime, {
      partId: BodyPartId.ABDOMEN,
      baseDamage: 10,
      strengthScale: 0.6,
    });
    addAcute(context, instance.targetId, "winded", damage >= 15 ? 2 : 1, 2, runtime);
    if (roll(context, instance, "balance-risk") < 0.16) {
      addAcute(context, instance.actorId, "off-balance", 1, 1, runtime);
    }
  },
});
