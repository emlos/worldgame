export const SCHEDULE_RULES = {
    home: "daily_home_block", //stay home
    fixed: "same_every_day", //be at target for whole window duration
    random: "multiple_per_day", //do as many as possible within the window timespan
    weekly: "once_per_week", //pick one day of available days per weekly schedule
    daily: "once_per_day", // pick one time to visit target on each of available days
    follow: "follow_target", //unused, for luce only
};

export const TARGET_TYPE = {
    placeKeys: "placeKeys",
    home: "home",
    placeCategory: "placeCategory",
    npc: "npc",
    player: "player",
    unavailable: "away",
};

export const RULE_PRIORITY = {
    [SCHEDULE_RULES.home]: 0,
    [SCHEDULE_RULES.random]: 1,
    [SCHEDULE_RULES.weekly]: 2,
    [SCHEDULE_RULES.daily]: 3,
    [SCHEDULE_RULES.fixed]: 4,
    [SCHEDULE_RULES.follow]: 5,
};
