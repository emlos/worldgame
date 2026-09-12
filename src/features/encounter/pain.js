import { ENCOUNTER_PHYSICAL_SYSTEM_ID } from "./system.js";

export const PLAYER_PAIN_RECOVERY_PER_MINUTE = 1.5;

export function isPhysicalEncounterOpen(game) {
  return game.currentStory?.system?.id === ENCOUNTER_PHYSICAL_SYSTEM_ID;
}

export function recoverPlayerPainOutsideEncounter(game, change) {
  const minutes = Number(change?.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0 || isPhysicalEncounterOpen(game)) return;
  game.player.body?.relievePain(minutes * PLAYER_PAIN_RECOVERY_PER_MINUTE);
}
