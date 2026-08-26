// Dynamic stats for the player, changed by time and choices.
export const STATS = {
  health: {
    label: "Health",
    max: 100,
    min: 0,
    initial: 100,
  },
  mind: {
    label: "Mind",
    max: 100,
    min: -100,
    initial: 0,
  },
  stress: {
    label: "Stress",
    max: 100,
    min: 0,
    initial: 0,
  },
  energy: {
    label: "Energy",
    max: 100,
    min: 0,
    initial: 100,
  },
  trauma: {
    label: "Trauma",
    max: 100,
    min: 0,
    initial: 0,
  },
  hygiene: {
    label: "Hygiene",
    max: 100,
    min: 0,
    initial: 100,
  },
  fear: {
    label: "Fear",
    max: 100,
    min: 0,
    initial: 0,
  },
};

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

export function initialPlayerStats() {
  return Object.fromEntries(
    Object.entries(STATS).map(([name, definition]) => [name, definition.initial]),
  );
}

// Fractional 0..10 abilities used by authored skill checks.
export const SKILLS = Object.freeze({
  strength: Object.freeze({ label: "Strength", min: 0, max: 10, initial: 0 }),
  perception: Object.freeze({ label: "Perception", min: 0, max: 10, initial: 0 }),
  endurance: Object.freeze({ label: "Endurance", min: 0, max: 10, initial: 0 }),
  speech: Object.freeze({ label: "Speech", min: 0, max: 10, initial: 0 }),
  resolve: Object.freeze({ label: "Resolve", min: 0, max: 10, initial: 0 }),
  fitness: Object.freeze({ label: "Fitness", min: 0, max: 10, initial: 0 }),
});

export function initialPlayerSkills() {
  return Object.fromEntries(
    Object.entries(SKILLS).map(([name, definition]) => [name, definition.initial]),
  );
}
