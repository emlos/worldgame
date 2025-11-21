export const SCHEDULE_RULES = {
    home: "daily_home_block",
    fixed: "fixed_activity",
    random: "random_visits",
    weekly: "weekly_once",
};

export const RULE_PRIORITY = {
    [SCHEDULE_RULES.home]: 0,
    [SCHEDULE_RULES.random]: 1,
    [SCHEDULE_RULES.weekly]: 2,
    [SCHEDULE_RULES.fixed]: 3,
};
