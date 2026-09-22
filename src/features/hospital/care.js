import { BodyPartId } from "../../characters/core/body.js";

export const HOSPITAL_PLACE_KEY = "hospital";
export const SASHA_SHIFT_ID = "sasha_hospital_shift";
export const SASHA_PENDING_INTRODUCTION_FLAG = "hospital.awaiting_sasha_introduction";

// One appointment per injured region, not per granular hit location.
export const TREATMENT_REGIONS = Object.freeze([
  Object.freeze({
    id: "head",
    label: "head and neck",
    parts: [BodyPartId.HEAD, BodyPartId.FACE, BodyPartId.NECK],
  }),
  Object.freeze({
    id: "torso",
    label: "torso",
    parts: [BodyPartId.CHEST, BodyPartId.BACK, BodyPartId.ABDOMEN, BodyPartId.GROIN],
  }),
  Object.freeze({
    id: "left-arm",
    label: "left arm",
    parts: [
      BodyPartId.SHOULDER_L, BodyPartId.UPPER_ARM_L,
      BodyPartId.LOWER_ARM_L, BodyPartId.HAND_L,
    ],
  }),
  Object.freeze({
    id: "right-arm",
    label: "right arm",
    parts: [
      BodyPartId.SHOULDER_R, BodyPartId.UPPER_ARM_R,
      BodyPartId.LOWER_ARM_R, BodyPartId.HAND_R,
    ],
  }),
  Object.freeze({
    id: "left-leg",
    label: "left leg",
    parts: [
      BodyPartId.THIGH_L, BodyPartId.KNEE_L, BodyPartId.CALF_L,
      BodyPartId.ANKLE_L, BodyPartId.FOOT_L,
    ],
  }),
  Object.freeze({
    id: "right-leg",
    label: "right leg",
    parts: [
      BodyPartId.THIGH_R, BodyPartId.KNEE_R, BodyPartId.CALF_R,
      BodyPartId.ANKLE_R, BodyPartId.FOOT_R,
    ],
  }),
]);

function needsCare(part) {
  return part && (
    part.integrity < part.maxIntegrity ||
    part.acutePain >= 1 ||
    part.conditions.size > 0
  );
}

export function injuredTreatmentRegions(body) {
  if (!body) return [];
  return TREATMENT_REGIONS.filter((region) =>
    region.parts.some((partId) => needsCare(body.getPart(partId))));
}

export function hasUnrecoverableInjury(body) {
  return Boolean(body && [...body.allParts()].some((part) => part.integrityRatio < 0.2));
}

export function healTreatmentRegions(body, regions) {
  for (const region of regions) {
    for (const partId of region.parts) {
      const part = body.getPart(partId);
      if (!part) continue;
      part.integrity = part.maxIntegrity;
      part.acutePain = 0;
      part.healingDelayMinutes = 0;
      part.conditions.clear();
    }
  }
}

export function sashaIsOnDuty(game) {
  if (game.currentPlace?.key !== HOSPITAL_PLACE_KEY) return false;
  const sasha = game.npcs.get("sasha");
  return Boolean(sasha &&
    game.getNPCsAtCurrentPosition().includes(sasha) &&
    sasha.brain?.getScheduleStatus?.(game.now).obligationId === SASHA_SHIFT_ID);
}

export function playerHasMetSasha(game) {
  const sasha = game.npcs.get("sasha");
  return Boolean(sasha && game.player.getRelationshipProfile(
    sasha.id, sasha.relationshipProfile,
  ).met);
}

export function introduceSasha(game) {
  if (!sashaIsOnDuty(game) || playerHasMetSasha(game)) return false;
  const sasha = game.npcs.get("sasha");
  game.player.adjustRelationshipMeter(sasha.id, "interest", 1, sasha.relationshipProfile);
  game.clearFlag(SASHA_PENDING_INTRODUCTION_FLAG);
  return true;
}
