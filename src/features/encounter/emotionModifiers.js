// Emotions influence the execution of a chosen response, not which responses
// the player is allowed to choose. Values are absolute changes to success odds.
const ACTION_EFFECTS = Object.freeze({
  "create-distance": { fear: 0.08, anger: -0.05 },
  "wrench-free": { fear: 0.08, anger: -0.03 },
  "controlled-disengage": { fear: 0.05, anger: -0.07 },
  "shove-away": { fear: 0.02, anger: 0.07 },
  "drive-body": { anger: 0.08 },
  headbutt: { anger: 0.08 },
  "knee-strike": { fear: -0.02, anger: 0.07 },
  "strike-face": { fear: -0.04, anger: -0.07 },
  "strike-holding-arm": { fear: -0.03, anger: -0.07 },
  "grab-arm": { fear: -0.04, anger: -0.06 },
  "turn-target-away": { fear: -0.04, anger: -0.06 },
  "pin-limb": { fear: -0.04, anger: -0.06 },
  "demand-money-back": { fear: -0.06, anger: -0.06 },
});

function intensity(value) {
  return Math.min(1, Math.max(0, value) / 80);
}

export function playerEncounterEmotionModifier(context, instance) {
  const effect = ACTION_EFFECTS[instance.actionId];
  if (!effect || context.state.participants[instance.actorId]?.ref?.type !== "player") {
    return 0;
  }
  const player = context.game.player;
  const adjustment =
    (effect.fear || 0) * intensity(player.getStatValue("fear"))
    + (effect.anger || 0) * intensity(player.getStatValue("anger"));
  return Math.max(-0.1, Math.min(0.1, adjustment));
}

export function emotionAdjustedChance(context, instance, chance, min = 0, max = 1) {
  return Math.max(min, Math.min(max,
    chance + playerEncounterEmotionModifier(context, instance)));
}
