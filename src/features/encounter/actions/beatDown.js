import { BodyPartId } from "../../../characters/core/body.js";
import {
  getBodyPart,
  getPartCapacity,
  getUsableHands,
} from "../combatants.js";
import {
  canBeginPhysicalAction,
  hasActionGeometry,
} from "../affordances.js";
import { goalOwnerId, goalTargetId } from "../roles.js";
import {
  actionInstance,
  addExertion,
  applyImpact,
  contest,
  failAction,
  removeNonfunctionalHolds,
} from "./helpers.js";
import { actionIntentProse } from "../proseData.js";

const LIMB_TARGETS = Object.freeze([
  BodyPartId.LOWER_ARM_L,
  BodyPartId.LOWER_ARM_R,
  BodyPartId.KNEE_L,
  BodyPartId.KNEE_R,
]);

function limbName(context, actorId, partId) {
  return getBodyPart(context, actorId, partId)?.displayName?.toLowerCase() || "limb";
}

export const ROUGH_UP = Object.freeze({
  id: "rough-up",
  severity: "light",
  tags: Object.freeze(["attack", "impact", "objective"]),
  durationSeconds: 3,
  usableBy: "goal-owner",
  playerOrder: 100,
  availabilityHint: "Requires a usable free hand and striking range.",

  enumerateTargets(context, actorId) {
    const sourcePartId = getUsableHands(context, actorId)[0];
    if (!sourcePartId || actorId !== goalOwnerId(context.state)) return [];
    return [actionInstance(this.id, actorId, goalTargetId(context.state), { sourcePartId })];
  },

  isAvailable(context, instance) {
    return instance.actorId === goalOwnerId(context.state)
      && instance.targetId === goalTargetId(context.state)
      && canBeginPhysicalAction(context, instance.actorId)
      && hasActionGeometry(context, instance)
      && getUsableHands(context, instance.actorId).includes(instance.parameters.sourcePartId);
  },

  label() {
    return "Rough them up";
  },

  intentLabel(context, intent) {
    return actionIntentProse(context, { ...intent, actionId: this.id });
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 5);
    if (!contest(context, instance, runtime, { baseChance: 0.62, defense: "impact" })) {
      failAction(runtime, instance, "missed");
      return;
    }
    applyImpact(context, instance, runtime, {
      partId: BodyPartId.ABDOMEN,
      baseDamage: 6,
      strengthScale: 0.35,
    });
    removeNonfunctionalHolds(context, runtime);
  },
});

export const ATTACK_LIMB = Object.freeze({
  id: "attack-limb",
  severity: "severe",
  tags: Object.freeze(["attack", "impact", "objective", "limb-damage"]),
  durationSeconds: 3,
  usableBy: "goal-owner",
  playerOrder: 100,
  availabilityHint: "Requires a usable free hand, striking range, and a usable target limb.",

  enumerateTargets(context, actorId) {
    const sourcePartId = getUsableHands(context, actorId)[0];
    if (!sourcePartId || actorId !== goalOwnerId(context.state)) return [];
    const targetId = goalTargetId(context.state);
    return LIMB_TARGETS
      .filter((partId) => getPartCapacity(context, targetId, partId) > 0)
      .map((partId) => actionInstance(this.id, actorId, targetId, {
        sourcePartId,
        targetPartId: partId,
      }));
  },

  isAvailable(context, instance) {
    return instance.actorId === goalOwnerId(context.state)
      && instance.targetId === goalTargetId(context.state)
      && LIMB_TARGETS.includes(instance.parameters.targetPartId)
      && canBeginPhysicalAction(context, instance.actorId)
      && hasActionGeometry(context, instance)
      && getUsableHands(context, instance.actorId).includes(instance.parameters.sourcePartId)
      && getPartCapacity(context, instance.targetId, instance.parameters.targetPartId) > 0;
  },

  label(context, instance) {
    return `Attack their ${limbName(context, instance.targetId, instance.parameters.targetPartId)}`;
  },

  intentLabel(context, intent) {
    return actionIntentProse(context, { ...intent, actionId: this.id });
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 9);
    if (!contest(context, instance, runtime, { baseChance: 0.52, defense: "impact" })) {
      failAction(runtime, instance, "missed");
      return;
    }
    applyImpact(context, instance, runtime, {
      partId: instance.parameters.targetPartId,
      baseDamage: 14,
      strengthScale: 0.8,
    });
    removeNonfunctionalHolds(context, runtime);
  },
});
