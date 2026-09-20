// Dynamic stats for the player, changed by time and choices.
export const STATS = {
  stress: {
    label: "Stress",
    max: 100,
    min: 0,
    initial: 0,
    higherIsBetter: false,
  },
  energy: {
    label: "Energy",
    max: 100,
    min: 0,
    initial: 100,
    higherIsBetter: true,
  },
  hygiene: {
    label: "Hygiene",
    max: 100,
    min: 0,
    initial: 100,
    higherIsBetter: true,
  },
};

export const MUTABLE_STATS = Object.freeze(
  Object.fromEntries(
    Object.entries(STATS).filter(([, definition]) => !definition.derived),
  ),
);

// Passive energy lost for each elapsed in-game minute.
export const PLAYER_ENERGY_DRAIN_PER_MINUTE = 0.1;
// Energy restored for each minute spent in an authored resting action.
export const PLAYER_ENERGY_RECOVERY_PER_MINUTE = 1 / 6;

export const PlayerTemperature = Object.freeze({
  OVERHEATING: "overheating",
  HOT: "hot",
  WARM: "warm",
  COMFORTABLE: "comfortable",
  COOL: "cool",
  COLD: "cold",
  FREEZING: "freezing",
});

export const PLAYER_TEMPERATURE_VALUES = Object.freeze(Object.values(PlayerTemperature));
export const INITIAL_PLAYER_TEMPERATURE = PlayerTemperature.COMFORTABLE;
export const INITIAL_PLAYER_MONEY = 0;
export const INITIAL_PLAYER_AGE = 18;

export function initialPlayerStats() {
  return Object.fromEntries(
    Object.entries(STATS)
      .filter(([, definition]) => !definition.derived)
      .map(([name, definition]) => [name, definition.initial]),
  );
}

export const COMBAT_SKILL_RANK_COUNT = 5;
export const COMBAT_SKILL_RANK_THRESHOLDS = Object.freeze([0, 50, 100, 200, 350]);
export const COMBAT_SKILL_MAX_POINTS = 700;

// Abilities used by authored skill checks and progression systems.
export const SKILLS = Object.freeze({
  strength: Object.freeze({ label: "Strength", min: 0, max: 10, initial: 0 }),
  perception: Object.freeze({ label: "Perception", min: 0, max: 10, initial: 0 }),
  endurance: Object.freeze({ label: "Endurance", min: 0, max: 10, initial: 0 }),
  speech: Object.freeze({ label: "Speech", min: 0, max: 10, initial: 0 }),
  resolve: Object.freeze({ label: "Resolve", min: 0, max: 10, initial: 0 }),
  fitness: Object.freeze({ label: "Fitness", min: 0, max: 10, initial: 0 }),
  combat: Object.freeze({
    label: "Combat",
    min: 0,
    max: COMBAT_SKILL_MAX_POINTS,
    initial: 0,
    rankCount: COMBAT_SKILL_RANK_COUNT,
    rankThresholds: COMBAT_SKILL_RANK_THRESHOLDS,
  }),
});

export function initialPlayerSkills() {
  return Object.fromEntries(
    Object.entries(SKILLS).map(([name, definition]) => [name, definition.initial]),
  );
}
