import { ENCOUNTER_PHYSICAL_SYSTEM_ID } from "./system.js";
import { Body } from "../../characters/core/body.js";

export const PLAYER_ACUTE_PAIN_HALF_LIFE_MINUTES = 90;

export function isPhysicalEncounterOpen(game) {
  return game.currentStory?.system?.id === ENCOUNTER_PHYSICAL_SYSTEM_ID;
}

function recoverBody(body, minutes) {
  body.decayAcutePain(minutes, {
    halfLifeMinutes: PLAYER_ACUTE_PAIN_HALF_LIFE_MINUTES,
  });
  body.recoverIntegrity(minutes);
}

// Sample the same recovery that the time-change handler will apply, without
// changing the real body before timers and other feature handlers run.
export function createPlayerPainCurve(game) {
  const body = game.player.body;
  const initialPain = body?.getTotalPain() ?? 0;
  if (!body || initialPain <= 0 || isPhysicalEncounterOpen(game)) {
    return () => initialPain;
  }
  const snapshot = body.toJSON();
  return (minutes) => {
    if (minutes <= 0) return initialPain;
    const sample = Body.fromJSON(snapshot);
    recoverBody(sample, minutes);
    return sample.getTotalPain();
  };
}

export function recoverPlayerBodyOutsideEncounter(game, change) {
  const minutes = Number(change?.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0 || isPhysicalEncounterOpen(game)) return;
  if (game.player.body) recoverBody(game.player.body, minutes);
}
