import {
  getAcute,
  getBodyPain,
  getParticipant,
  getStat,
} from "./combatants.js";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const DEFAULT_PROFILE = Object.freeze({
  requiredReadiness: 12,
  maximumWinded: 2,
  maximumDazed: 2,
});

// Readiness is deliberately action-specific. Explosive whole-body actions need
// much more reserve than guarding, maintaining a grip, or searching a target.
export const ACTION_EFFORT_PROFILES = Object.freeze({
  "surrender-money": { requiredReadiness: 0, maximumWinded: 3, maximumDazed: 3 },
  "demand-money-back": { requiredReadiness: 0, maximumWinded: 3, maximumDazed: 3 },
  "controlled-disengage": { requiredReadiness: 20, maximumWinded: 2, maximumDazed: 2 },
  "catch-breath": { requiredReadiness: 0, maximumWinded: 3, maximumDazed: 2 },
  "cover-and-brace": { requiredReadiness: 14, maximumWinded: 3, maximumDazed: 2 },
  "strike-face": { requiredReadiness: 18, maximumWinded: 2, maximumDazed: 1 },
  "drive-body": { requiredReadiness: 22, maximumWinded: 2, maximumDazed: 1 },
  "strike-holding-arm": { requiredReadiness: 18, maximumWinded: 2, maximumDazed: 1 },
  headbutt: { requiredReadiness: 36, maximumWinded: 1, maximumDazed: 1 },
  "knee-strike": { requiredReadiness: 34, maximumWinded: 1, maximumDazed: 1 },
  "shove-away": { requiredReadiness: 28, maximumWinded: 1, maximumDazed: 2 },
  "grab-arm": { requiredReadiness: 22, maximumWinded: 2, maximumDazed: 2 },
  "wrench-free": { requiredReadiness: 36, maximumWinded: 1, maximumDazed: 2 },
  "tighten-hold": { requiredReadiness: 16, maximumWinded: 2, maximumDazed: 2 },
  "force-to-wall": { requiredReadiness: 38, maximumWinded: 1, maximumDazed: 1 },
  "force-to-ground": { requiredReadiness: 44, maximumWinded: 1, maximumDazed: 1 },
  "turn-target-away": { requiredReadiness: 28, maximumWinded: 2, maximumDazed: 1 },
  "pin-limb": { requiredReadiness: 34, maximumWinded: 1, maximumDazed: 1 },
  "stand-up": { requiredReadiness: 40, maximumWinded: 1, maximumDazed: 1 },
  "roll-toward": { requiredReadiness: 24, maximumWinded: 2, maximumDazed: 2 },
  "create-distance": { requiredReadiness: 30, maximumWinded: 1, maximumDazed: 2 },
  "close-distance": { requiredReadiness: 34, maximumWinded: 1, maximumDazed: 2 },
  run: { requiredReadiness: 42, maximumWinded: 1, maximumDazed: 1 },
  // At far range this includes limping or staggering out, not only sprinting.
  flee: { requiredReadiness: 8, maximumWinded: 2, maximumDazed: 2 },
  "search-money": { requiredReadiness: 18, maximumWinded: 2, maximumDazed: 2 },
});

export function calculatePhysicalReadiness(context, actorId) {
  const participant = getParticipant(context, actorId);
  const winded = getAcute(context, actorId, "winded")?.severity || 0;
  const dazed = getAcute(context, actorId, "dazed")?.severity || 0;
  const pain = getBodyPain(context, actorId);
  return clamp(
    Math.round(
      100
      - participant.exertion
      + getStat(context, actorId, "endurance") * 2
      + getStat(context, actorId, "fitness")
      - pain * 0.18
      - winded * 10
      - dazed * 8,
    ),
    0,
    120,
  );
}

export function getActionEffortStatus(context, instance) {
  const profile = ACTION_EFFORT_PROFILES[instance.actionId] || DEFAULT_PROFILE;
  const readiness = calculatePhysicalReadiness(context, instance.actorId);
  const winded = getAcute(context, instance.actorId, "winded")?.severity || 0;
  const dazed = getAcute(context, instance.actorId, "dazed")?.severity || 0;
  const blockers = [];
  if (winded > profile.maximumWinded) blockers.push("too-winded");
  if (dazed > profile.maximumDazed) blockers.push("too-dazed");
  if (readiness < profile.requiredReadiness) blockers.push("too-exhausted");

  const deficit = Math.max(0, profile.requiredReadiness - readiness);
  const acuteExcess = Math.max(0, winded - profile.maximumWinded)
    + Math.max(0, dazed - profile.maximumDazed);
  const desperateChance = clamp(0.18 - deficit * 0.008 - acuteExcess * 0.06, 0.02, 0.18);
  return {
    allowed: blockers.length === 0,
    blockers,
    primaryBlocker: blockers[0] || null,
    readiness,
    requiredReadiness: profile.requiredReadiness,
    desperateChance,
  };
}

export function calculateExertionCost(context, actorId, baseAmount) {
  const participant = getParticipant(context, actorId);
  const winded = getAcute(context, actorId, "winded")?.severity || 0;
  const dazed = getAcute(context, actorId, "dazed")?.severity || 0;
  const pain = getBodyPain(context, actorId);
  const strainMultiplier = 1
    + participant.exertion / 180
    + winded * 0.16
    + dazed * 0.1
    + pain / 250;
  const conditioning = getStat(context, actorId, "endurance") * 0.3
    + getStat(context, actorId, "fitness") * 0.15;
  return Math.max(1, Math.round(baseAmount * strainMultiplier - conditioning));
}

export function recoverExertion(context, actorId) {
  const participant = getParticipant(context, actorId);
  const amount = Math.max(
    6,
    Math.round(8 + getStat(context, actorId, "endurance") * 1.6
      + getStat(context, actorId, "fitness") * 0.8),
  );
  const recovered = Math.min(participant.exertion, amount);
  participant.exertion -= recovered;
  return recovered;
}

export function effortBlockerText(reason) {
  if (reason === "too-winded") return "Too winded for this explosive effort.";
  if (reason === "too-dazed") return "Too dazed to coordinate this action.";
  if (reason === "too-exhausted") return "Too exhausted to complete this demanding action.";
  return "Not physically ready for this action.";
}
