import { keyedRandom01 } from "../../shared/util/random.js";

export const MUGGER_PERSONALITIES = Object.freeze({
  opportunist: Object.freeze({
    id: "opportunist",
    label: "Opportunist",
    commitmentBias: 0,
    commitmentTimeSensitivity: 0.85,
    commitmentPainSensitivity: 0.8,
    commitmentExertionSensitivity: 0.35,
    weights: Object.freeze({ objective: 1.25, control: 1, pressure: 0.65, safety: 1, escape: 1, speed: 0.9, novelty: 1 }),
  }),
  forceful: Object.freeze({
    id: "forceful",
    label: "Forceful",
    commitmentBias: 8,
    commitmentTimeSensitivity: 0.85,
    commitmentPainSensitivity: 0.7,
    commitmentExertionSensitivity: 0.3,
    weights: Object.freeze({ objective: 1, control: 1.25, pressure: 1.2, safety: 0.65, escape: 0.65, speed: 0.8, novelty: 0.7 }),
  }),
  skittish: Object.freeze({
    id: "skittish",
    label: "Skittish",
    commitmentBias: -10,
    commitmentTimeSensitivity: 1.1,
    commitmentPainSensitivity: 1.05,
    commitmentExertionSensitivity: 0.45,
    weights: Object.freeze({ objective: 0.9, control: 0.8, pressure: 0.55, safety: 1.35, escape: 1.4, speed: 1.1, novelty: 1.15 }),
  }),
  desperate: Object.freeze({
    id: "desperate",
    label: "Desperate",
    commitmentBias: 14,
    commitmentTimeSensitivity: 0.45,
    commitmentPainSensitivity: 0.25,
    commitmentExertionSensitivity: 0.15,
    weights: Object.freeze({ objective: 0.8, control: 0.8, pressure: 1.7, safety: 0.45, escape: 0.45, speed: 1, novelty: 0.55 }),
  }),
});

export const MUGGER_PERSONALITY_IDS = Object.freeze(Object.keys(MUGGER_PERSONALITIES));

export function getMuggerPersonality(id) {
  const personality = MUGGER_PERSONALITIES[id];
  if (!personality) throw new Error(`Physical encounter: unknown mugger personality '${String(id)}'`);
  return personality;
}

export function selectMuggerPersonality(seed, instanceKey) {
  const roll = keyedRandom01(seed, `encounter-personality-v1:${instanceKey}`);
  if (roll < 0.2) return MUGGER_PERSONALITIES.opportunist;
  if (roll < 0.4) return MUGGER_PERSONALITIES.desperate;
  if (roll < 0.65) return MUGGER_PERSONALITIES.forceful;
  if (roll < 0.85) return MUGGER_PERSONALITIES.skittish;
  return MUGGER_PERSONALITIES.opportunist;
}
