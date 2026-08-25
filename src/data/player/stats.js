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

//skills gained or lost that affect outcomes, and can be raised or lowered
export const SKILLS = {
    strength: {
        max:10,
        min:0,
    },
    perception: {
        max:10,
        min:0,
    },
    endurance: {
        max:10,
        min:0,
    },
    speech: {
        max:10,
        min:0,
    },
    resolve: {
        max:10,
        min:0,
    },
    fitness: {
        max:10,
        min:0,
    }

};
