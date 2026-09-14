import {
  getBalanceCapacity,
  getBodyPerformance,
  getEffectiveHoldLeverage,
  getPartCapacity,
  getParticipant,
  getStat,
  getUsableArmTargets,
  getUsableHands,
  getUsableKnees,
  holdsControlledBy,
  hostileHoldsOn,
  isDazed,
  isSameLimb,
  otherParticipantId,
} from "../combatants.js";
import {
  canBeginPhysicalAction,
  isGrounded,
  isStanding,
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
  removeHold,
  chanceRoll,
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

function sideName(partId) {
  return partId.endsWith("_l") ? "left" : "right";
}

function wrenchableHolds(context, actorId) {
  return hostileHoldsOn(context, actorId).filter(
    (hold) => getPartCapacity(context, actorId, hold.targetPartId) > 0.15,
  );
}

function strongestControlledHoldsByTarget(context, actorId) {
  const strongestByTarget = new Map();
  for (const hold of holdsControlledBy(context, actorId)) {
    const effective = getEffectiveHoldLeverage(context, hold);
    const current = strongestByTarget.get(hold.targetId);
    if (!current
      || effective > current.effective
      || (effective === current.effective && hold.id.localeCompare(current.hold.id) < 0)) {
      strongestByTarget.set(hold.targetId, { hold, effective });
    }
  }
  return [...strongestByTarget.values()]
    .sort((left, right) => left.hold.targetId.localeCompare(right.hold.targetId))
    .map(({ hold }) => hold);
}

export const GRAB_ARM = Object.freeze({
  id: "grab-arm",
  tags: Object.freeze(["hold", "control"]),
  durationSeconds: 2,
  usableBy: "any",
  playerOrder: 40,

  enumerateTargets(context, actorId) {
    const sourcePartId = getUsableHands(context, actorId)[0];
    const targetId = otherParticipantId(context, actorId);
    if (!sourcePartId) return [];
    return getUsableArmTargets(context, targetId).map((targetPartId) =>
      actionInstance(this.id, actorId, targetId, { sourcePartId, targetPartId }));
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && getEncounterRange(context.state) !== ENCOUNTER_RANGE.far
      && getUsableHands(context, instance.actorId).includes(instance.parameters.sourcePartId)
      && getUsableArmTargets(context, instance.targetId).includes(instance.parameters.targetPartId);
  },

  label(context, instance) {
    return `Grab ${encounterPronoun(context, instance.targetId, "dependent")} ${sideName(instance.parameters.targetPartId)} arm`;
  },

  intentLabel(context, instance) {
    return `${encounterVerb(context, instance.actorId, "reaches", "reach")} for your ${sideName(instance.parameters.targetPartId)} wrist`;
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 7);
    if (!contest(context, instance, runtime, { baseChance: 0.6 })) {
      failAction(runtime, instance, "grip-missed");
      requireEncounterObjective(context.state).recordControlFailure?.(context, instance.actorId);
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
      id: `hold-${context.state.exchange + 1}-${instance.actorId}-${sideName(instance.parameters.sourcePartId)}`,
      controllerId: instance.actorId,
      sourcePartId: instance.parameters.sourcePartId,
      targetId: instance.targetId,
      targetPartId: instance.parameters.targetPartId,
      kind: "wrist-grip",
      leverage,
    };
    // A successful counter-grab cannot coexist with the old grip when each
    // hold restrains the limb supplying the other. The new action has just won
    // its contest, so it displaces the incompatible established grip.
    for (const existing of [...context.state.relationships.holds]) {
      const mutuallyRestrained = existing.controllerId === hold.targetId
        && existing.targetId === hold.controllerId
        && isSameLimb(existing.sourcePartId, hold.targetPartId)
        && isSameLimb(hold.sourcePartId, existing.targetPartId);
      if (mutuallyRestrained) removeHold(context, existing, runtime, "source-restrained");
    }
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
  usableBy: "any",
  playerOrder: 4,

  enumerateTargets(context, actorId) {
    const holds = wrenchableHolds(context, actorId);
    if (!holds.length) return [];
    return [actionInstance(this.id, actorId, holds[0].controllerId, {
      holdIds: holds.map(({ id }) => id),
    })];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && Array.isArray(instance.parameters.holdIds)
      && instance.parameters.holdIds.length > 0
      && instance.parameters.holdIds.every((holdId) =>
        wrenchableHolds(context, instance.actorId).some(({ id }) => id === holdId));
  },

  label(_context, instance) {
    return instance.parameters.holdIds.length > 1
      ? "Try to wrestle both arms free"
      : "Try to wrench your wrist free";
  },

  intentLabel(context, instance) {
    return instance.parameters.holdIds.length > 1
      ? `${encounterVerb(context, instance.actorId, "wrenches", "wrench")} against both arm holds at once`
      : `${encounterVerb(context, instance.actorId, "twists", "twist")} hard against the wrist hold`;
  },

  resolve(context, instance, runtime) {
    const holds = instance.parameters.holdIds
      .map((holdId) => wrenchableHolds(context, instance.actorId).find(({ id }) => id === holdId))
      .filter(Boolean);
    addExertion(context, instance.actorId, 9 + holds.length * 3);
    if (!holds.length) {
      failAction(runtime, instance, "hold-gone");
      return;
    }
    let released = 0;
    for (const hold of holds) {
      const effective = getEffectiveHoldLeverage(context, hold);
      const restrainedLimbCapacity = getPartCapacity(
        context,
        instance.actorId,
        hold.targetPartId,
      );
      const pinPenalty = hold.kind === "limb-pin" ? 0.12 : 0;
      const multiplePenalty = Math.max(0, holds.length - 1) * 0.08;
      const chance = clamp(
        0.58
        + (getStat(context, instance.actorId, "strength")
          - getStat(context, hold.controllerId, "strength")) * 0.035
        + (getBodyPerformance(context, instance.actorId) - 1) * 0.4
        + (getBalanceCapacity(context, instance.actorId)
          - getBalanceCapacity(context, hold.controllerId)) * 0.18
        + (restrainedLimbCapacity - 1) * 0.28
        - getParticipant(context, instance.actorId).exertion * 0.0025
        + getParticipant(context, hold.controllerId).exertion * 0.0015
        - (isDazed(context, instance.actorId) ? 0.14 : 0)
        + (isDazed(context, hold.controllerId) ? 0.12 : 0)
        - effective * 0.004
        - pinPenalty
        - multiplePenalty,
        0.12,
        0.84,
      );
      const success = chanceRoll(
        context,
        instance,
        runtime,
        `wrench:${hold.id}`,
        chance,
        { holdId: hold.id },
      );
      if (success) {
        removeHold(context, hold, runtime, "wrenched-free");
        released += 1;
        continue;
      }
      const effortMultiplier = Math.max(
        0.35,
        1 - getParticipant(context, instance.actorId).exertion * 0.006,
      ) * restrainedLimbCapacity;
      const reduction = Math.max(
        3,
        Math.round((5 + getStat(context, instance.actorId, "strength") * 0.6) * effortMultiplier),
      );
      hold.leverage = Math.max(0, hold.leverage - reduction);
      runtime.events.push({ type: "hold.weakened", holdId: hold.id, amount: reduction });
      if (hold.leverage <= 0) {
        removeHold(context, hold, runtime, "worn-loose");
        released += 1;
      }
    }
    if (released < holds.length) failAction(runtime, instance, released ? "partly-freed" : "grip-held");
  },
});

export const TIGHTEN_HOLD = Object.freeze({
  id: "tighten-hold",
  tags: Object.freeze(["hold", "control"]),
  durationSeconds: 2,
  usableBy: "any",
  playerOrder: 70,

  enumerateTargets(context, actorId) {
    return holdsControlledBy(context, actorId).map((hold) =>
      actionInstance(this.id, actorId, hold.targetId, { holdId: hold.id }));
  },

  isAvailable(context, instance) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    return canBeginPhysicalAction(context, instance.actorId)
      && Boolean(hold)
      && hold.leverage < 100;
  },

  label(context, instance) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    return hold?.kind === "limb-pin" ? "Reinforce your pin" : "Reinforce your grip";
  },

  intentLabel(context, instance) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    return hold?.kind === "limb-pin"
      ? `${encounterVerb(context, instance.actorId, "settles", "settle")} more weight onto the arm pin`
      : `${encounterVerb(context, instance.actorId, "adjusts", "adjust")} ${encounterPronoun(context, instance.actorId, "dependent")} grip to tighten control of your wrist`;
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
    const requestedAmount = Math.max(
      8,
      Math.round(14 + getStat(context, instance.actorId, "strength") * 0.5),
    );
    const previousLeverage = hold.leverage;
    hold.leverage = clamp(hold.leverage + requestedAmount, 1, 100);
    runtime.events.push({
      type: "hold.strengthened",
      holdId: hold.id,
      amount: hold.leverage - previousLeverage,
    });
  },
});

export const FORCE_TO_WALL = Object.freeze({
  id: "force-to-wall",
  tags: Object.freeze(["hold", "control", "position"]),
  durationSeconds: 3,
  usableBy: "any",
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

  label(context, instance) {
    return `Try to force ${encounterPronoun(context, instance.targetId, "object")} against the wall`;
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "shifts", "shift")} ${encounterPronoun(context, intent.actorId, "dependent")} weight to force you against the wall`;
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
      requireEncounterObjective(context.state).recordControlFailure?.(context, instance.actorId);
      return;
    }
    changeSupport(context, instance.targetId, ENCOUNTER_SUPPORT.wall, runtime);
    hold.leverage = clamp(hold.leverage + 8, 1, 100);
  },
});

export const FORCE_TO_GROUND = Object.freeze({
  id: "force-to-ground",
  tags: Object.freeze(["hold", "control", "position", "takedown"]),
  durationSeconds: 3,
  usableBy: "any",
  playerOrder: 75,

  enumerateTargets(context, actorId) {
    return strongestControlledHoldsByTarget(context, actorId).map((hold) =>
      actionInstance(this.id, actorId, hold.targetId, { holdId: hold.id }));
  },

  isAvailable(context, instance) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    return canBeginPhysicalAction(context, instance.actorId)
      && Boolean(hold)
      && getEncounterRange(context.state) === ENCOUNTER_RANGE.clinch
      && isStanding(context, instance.actorId)
      && isStanding(context, instance.targetId)
      && getBalanceCapacity(context, instance.actorId) > 0.35
      && getEffectiveHoldLeverage(context, hold) >= 34;
  },

  label(context, instance) {
    return `Try to force ${encounterPronoun(context, instance.targetId, "object")} to the ground`;
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "drops", "drop")} ${encounterPronoun(context, intent.actorId, "dependent")} weight to force you to the ground`;
  },

  resolve(context, instance, runtime) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    addExertion(context, instance.actorId, 12);
    if (!hold || !contest(context, instance, runtime, {
      baseChance: 0.48,
      modifier: hold ? getEffectiveHoldLeverage(context, hold) * 0.003 : 0,
    })) {
      failAction(runtime, instance, hold ? "takedown-resisted" : "hold-gone");
      requireEncounterObjective(context.state).recordControlFailure?.(context, instance.actorId);
      return;
    }
    changePose(context, instance.targetId, ENCOUNTER_POSE.supine, runtime);
    changePose(context, instance.actorId, ENCOUNTER_POSE.kneeling, runtime);
    changeFacing(context, instance.targetId, ENCOUNTER_FACING.toward, runtime);
    changeFacing(context, instance.actorId, ENCOUNTER_FACING.toward, runtime);
    hold.leverage = clamp(hold.leverage + 6, 1, 100);
  },
});

export const TURN_TARGET_AWAY = Object.freeze({
  id: "turn-target-away",
  tags: Object.freeze(["hold", "control", "position", "facing"]),
  durationSeconds: 2,
  usableBy: "any",
  playerOrder: 78,

  enumerateTargets(context, actorId) {
    return strongestControlledHoldsByTarget(context, actorId).map((hold) =>
      actionInstance(this.id, actorId, hold.targetId, { holdId: hold.id }));
  },

  isAvailable(context, instance) {
    const target = getParticipant(context, instance.targetId);
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    return canBeginPhysicalAction(context, instance.actorId)
      && Boolean(hold)
      && (target.support === ENCOUNTER_SUPPORT.wall || isGrounded(context, instance.targetId))
      && getEncounterFacing(context.state, instance.targetId) !== ENCOUNTER_FACING.away
      && getEffectiveHoldLeverage(context, hold) >= 28;
  },

  label(context, instance) {
    return `Try to turn ${encounterPronoun(context, instance.targetId, "object")} away from you`;
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "tries", "try")} to turn you away and take your line of sight`;
  },

  resolve(context, instance, runtime) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    addExertion(context, instance.actorId, 7);
    if (!hold || !contest(context, instance, runtime, {
      baseChance: 0.56,
      modifier: hold ? getEffectiveHoldLeverage(context, hold) * 0.002 : 0,
    })) {
      failAction(runtime, instance, hold ? "turn-resisted" : "hold-gone");
      return;
    }
    changeFacing(context, instance.targetId, ENCOUNTER_FACING.away, runtime);
    if (isGrounded(context, instance.targetId)) {
      changePose(context, instance.targetId, ENCOUNTER_POSE.prone, runtime);
    }
    hold.leverage = clamp(hold.leverage + 5, 1, 100);
  },
});

export const PIN_LIMB = Object.freeze({
  id: "pin-limb",
  tags: Object.freeze(["hold", "control", "pin"]),
  durationSeconds: 2,
  usableBy: "any",
  playerOrder: 72,

  enumerateTargets(context, actorId) {
    const actor = getParticipant(context, actorId);
    return holdsControlledBy(context, actorId)
      .filter(({ kind }) => kind !== "limb-pin")
      .map((hold) => {
        const target = getParticipant(context, hold.targetId);
        const pinSourcePartId = target.pose === ENCOUNTER_POSE.standing
          ? hold.sourcePartId
          : getUsableKnees(context, actorId)[0];
        if (!pinSourcePartId || (target.pose !== ENCOUNTER_POSE.standing
          && actor.pose !== ENCOUNTER_POSE.kneeling)) return null;
        return actionInstance(this.id, actorId, hold.targetId, {
          holdId: hold.id,
          pinSourcePartId,
        });
      })
      .filter(Boolean);
  },

  isAvailable(context, instance) {
    const target = getParticipant(context, instance.targetId);
    const actor = getParticipant(context, instance.actorId);
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    const constrained = target.support === ENCOUNTER_SUPPORT.wall
      || target.pose !== ENCOUNTER_POSE.standing;
    const validSource = target.pose === ENCOUNTER_POSE.standing
      ? instance.parameters.pinSourcePartId === hold?.sourcePartId
      : actor.pose === ENCOUNTER_POSE.kneeling
        && getUsableKnees(context, instance.actorId).includes(instance.parameters.pinSourcePartId);
    return canBeginPhysicalAction(context, instance.actorId)
      && Boolean(hold)
      && hold.kind !== "limb-pin"
      && constrained
      && validSource;
  },

  label(context, instance) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    return `Try to pin ${encounterPronoun(context, instance.targetId, "dependent")} ${hold ? sideName(hold.targetPartId) : "restrained"} arm`;
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "shifts", "shift")} ${encounterPronoun(context, intent.actorId, "dependent")} weight to pin your restrained arm`;
  },

  resolve(context, instance, runtime) {
    const hold = holdsControlledBy(context, instance.actorId).find(
      ({ id }) => id === instance.parameters.holdId,
    );
    addExertion(context, instance.actorId, 8);
    if (!hold || !contest(context, instance, runtime, {
      baseChance: 0.62,
      modifier: hold ? getEffectiveHoldLeverage(context, hold) * 0.002 : 0,
    })) {
      failAction(runtime, instance, hold ? "pin-resisted" : "hold-gone");
      return;
    }
    const previousSourcePartId = hold.sourcePartId;
    hold.kind = "limb-pin";
    hold.sourcePartId = instance.parameters.pinSourcePartId;
    hold.leverage = clamp(hold.leverage + 15, 1, 100);
    runtime.events.push({
      type: "hold.pinned",
      holdId: hold.id,
      controllerId: hold.controllerId,
      targetId: hold.targetId,
      targetPartId: hold.targetPartId,
      previousSourcePartId,
      sourcePartId: hold.sourcePartId,
    });
  },
});
