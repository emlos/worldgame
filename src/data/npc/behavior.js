export const GOAL_TYPE = {
    obligation: "obligation",
    visit: "visit",
    home: "home",
};

export const TARGET_TYPE = {
    placeKeys: "placeKeys",
    placeCategory: "placeCategory",
    home: "home",
};

export const NPC_ACTION_TYPE = {
    idle: "idle",
    travel: "travel",
    stay: "stay",
    temporaryStay: "temporary-stay",
};

export const OBLIGATION_EARLY_ARRIVAL_MINUTES = Object.freeze({
    min: 5,
    max: 30,
});

export const NPC_SCHEDULE_PHASE = Object.freeze({
    free: "free",
    departing: "departing",
    travelling: "travelling",
    early: "early",
    active: "active",
});

//TODO: behavior preferences:
// weather
// time
// day of week
// recent activities
// events
// distance/travel time
