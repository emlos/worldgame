import { BodyPartId } from "../../../characters/core/body.js";
import {
  getBodyPart,
  getPartCapacity,
  getUsableHands,
} from "../combatants.js";
import {
  canBeginPhysicalAction,
  isAtStrikingRange,
  isFacingOpponent,
} from "../affordances.js";
import { goalOwnerId, goalTargetId } from "../roles.js";
import { encounterVerb } from "../language.js";
import {
  actionInstance,
  addExertion,
  applyImpact,
  contest,
  failAction,
  removeNonfunctionalHolds,
} from "./helpers.js";

const LIMB_TARGETS = Object.freeze([
  BodyPartId.LOWER_ARM_L,
  BodyPartId.LOWER_ARM_R,
  BodyPartId.KNEE_L,
  BodyPartId.KNEE_R,
]);

function limbName(context, actorId, partId) {
  return getBodyPart(context, actorId, partId)?.displayName?.toLowerCase() || "limb";
}

export const ATTACK_LIMB = Object.freeze({
  id: "attack-limb",
  tags: Object.freeze(["attack", "impact", "objective", "limb-damage"]),
  durationSeconds: 3,
  usableBy: "goal-owner",
  playerOrder: 100,
  availabilityHint: "Requires a usable free hand, striking range, and an unbroken target limb.",

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
      && isAtStrikingRange(context, instance.actorId)
      && isFacingOpponent(context, instance.targetId, { allowSide: true })
      && getUsableHands(context, instance.actorId).includes(instance.parameters.sourcePartId)
      && getPartCapacity(context, instance.targetId, instance.parameters.targetPartId) > 0;
  },

  label(context, instance) {
    return `Attack their ${limbName(context, instance.targetId, instance.parameters.targetPartId)}`;
  },

  intentLabel(context, intent) {
    const targetPartId = intent.parameters.targetPartId;
    return `${encounterVerb(context, intent.actorId, "lines", "line")} up a heavy blow at your ${limbName(context, goalTargetId(context.state), targetPartId)}`;
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
