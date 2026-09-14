import { ENCOUNTER_PHYSICAL_SYSTEM_ID } from "./system.js";

export const PLAYER_ACUTE_PAIN_HALF_LIFE_MINUTES = 90;

export function isPhysicalEncounterOpen(game) {
  return game.currentStory?.system?.id === ENCOUNTER_PHYSICAL_SYSTEM_ID;
}

export function recoverPlayerBodyOutsideEncounter(game, change) {
  const minutes = Number(change?.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0 || isPhysicalEncounterOpen(game)) return;
  game.player.body?.decayAcutePain(minutes, {
    halfLifeMinutes: PLAYER_ACUTE_PAIN_HALF_LIFE_MINUTES,
  });
  game.player.body?.recoverIntegrity(minutes);
}
