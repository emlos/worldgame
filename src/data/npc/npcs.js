// src/data/npc/npcs.js
import { Gender, HUMAN_BODY_TEMPLATE, PronounSets } from "../../shared/modules.js";
import { DAY_KEYS, DayKind, LOCATION_TAGS, PLACE_TAGS, SCHEDULE_RULES } from "../data.js";

// Basic templates the game can turn into NPC instances
export const NPC_REGISTRY = [
    {
        example: true, // not a real NPC, just an example
        key: "taylor",
        name: "Taylor Morgan",
        shortName: "Taylor",
        nicknames: ["Tay"],

        age: 18,
        gender: Gender.F,
        pronouns: PronounSets.SHE_HER,

        stats: {
            looks: 3,
            strength: 1,
            intelligence: 4,
            charisma: 3,
        },
        preferLocationsWith: [PLACE_TAGS.housing], //generate home at location with as many of those tagged places as possible
        tags: ["human", "befriendable", "romance"],

        bodyTemplate: HUMAN_BODY_TEMPLATE,

        scheduleTemplate: {
            /**
             * Rules are interpreted by ScheduleManager.
             *
             * Supported types:
             *  - "daily_home_block"  : fixed home-at-time blocks
             *  - "fixed_activity"    : fixed block on days matching filters
             *  - "random_visits"     : repeated random stays within a window
             *  - "weekly_once"       : pick one day in the week for a one-off event
             */
            useBus: true,
            rules: [
                // 1) Sleep: between 22:00 and 06:00 at home
                {
                    id: "sleep_at_home",
                    type: SCHEDULE_RULES.home,
                    timeBlocks: [
                        { from: "00:00", to: "06:00" },
                        { from: "22:00", to: "24:00" },
                    ],
                },

                // 2) Weekday school: 09:00–15:00 on workdays
                {
                    id: "attend_school",
                    type: SCHEDULE_RULES.fixed,
                    dayKinds: [DayKind.WORKDAY], // uses Calendar DayKind
                    daysOfWeek: [DAY_KEYS[1], DAY_KEYS[2], DAY_KEYS[3], DAY_KEYS[4], DAY_KEYS[5]],
                    time: { from: "09:00", to: "15:00" },
                    target: {
                        type: "placeKey",
                        key: "high_school",
                        nearest: true,
                    },
                },

                // 3) Weekday after-school: from 15:00 to 22:00
                //    Randomly: library / mall / any leisure place
                {
                    id: "weekday_after_school",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY], // only if it's a work day
                    window: { from: "15:00", to: "22:00" },
                    stayMinutes: { min: 20, max: 120 },
                    targets: [
                        { type: "placeKey", key: "library" },
                        { type: "placeKey", key: "mall" },
                        {
                            type: "placeCategory",
                            categories: [PLACE_TAGS.leisure],
                        },
                        {
                            type: "home", // can also choose to stay at home
                        },
                    ],
                    respectOpeningHours: true,
                },

                // 4) Weekend / day-off behaviour:
                //    Wander places with COMMERCE or LEISURE, 30–120 minutes each.
                //    Applies on weekends AND calendar "day off" days.
                {
                    id: "weekend_and_days_off",
                    type: SCHEDULE_RULES.random,
                    // we treat explicit day_off from Calendar as "weekend behaviour"
                    dayKinds: [DayKind.DAY_OFF],
                    window: { from: "9:00", to: "22:00" },
                    stayMinutes: { min: 30, max: 120 },
                    targets: [
                        { type: "placeKey", key: "library" },
                        { type: "placeKey", key: "mall" },
                        {
                            type: "placeCategory",
                            categories: [
                                PLACE_TAGS.leisure,
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.culture,
                                PLACE_TAGS.service,
                                PLACE_TAGS.food,
                                PLACE_TAGS.history,
                            ],
                        },
                        {
                            type: "home",
                        },
                    ],
                    respectOpeningHours: true,
                },

                // 5) Weekly nightlife:
                //    Once per week, on Fri/Sat/Sun, go to nightlife place in evening.
                {
                    id: "nightlife_weekly",
                    type: SCHEDULE_RULES.weekly,
                    candidateDays: [DAY_KEYS[5], DAY_KEYS[6], DAY_KEYS[0]],
                    time: { from: "20:00", to: "24:00" },
                    stayMinutes: { min: 70, max: 150 },
                    target: {
                        type: "placeCategory",
                        categories: [PLACE_TAGS.nightlife], // define in PLACE_TAGS if you like
                    },
                    respectOpeningHours: true,
                },
            ],
        },
    },

    {
        key: "shade",
        name: 'Mara "Shade" Kovač',
        shortName: "Shade",
        nicknames: ["Shade", "Hey You"],

        age: 26,
        gender: Gender.F,
        pronouns: PronounSets.SHE_HER,

        stats: {
            looks: 2,
            strength: 3,
            intelligence: 3,
            charisma: 2,
        },

        preferLocationsWith: [PLACE_TAGS.crime, PLACE_TAGS.housing], //generate home at location with as many of those tagged places as possible
        tags: ["human", "criminal", "romance"],

        bodyTemplate: HUMAN_BODY_TEMPLATE,

        scheduleTemplate: {
            /**
             * Shade is mostly active at night:
             *  - Sleeps/hides at home during the day
             *  - Scouts targets in the evening
             *  - Commits robberies late at night / very early morning
             *  - Occasionally visits a crime den to sell goods
             */
            useBus: true,
            rules: [
                // 1) Daytime hideout/sleep: 05:00–17:00 at home
                {
                    id: "shade_daytime_hideout",
                    type: SCHEDULE_RULES.home,
                    timeBlocks: [{ from: "05:00", to: "17:00" }],
                },

                // 2) Evening scouting: 18:00–22:00 (not guaranteed every day)
                //    Walks around commerce / housing / nightlife areas, “casing” them.
                {
                    id: "shade_evening_scouting",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "18:00", to: "22:00" },
                    stayMinutes: { min: 15, max: 45 },
                    targets: [
                        {
                            type: "placeCategory",
                            categories: [
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.housing,
                                PLACE_TAGS.nightlife,
                            ],
                        },
                    ],
                    respectOpeningHours: false,
                    // NEW FIELD: per-day chance for this rule to be active at all
                    probability: 0.7,
                },

                // 3) Late-night robberies: 22:00–24:00
                //    Hits shops/homes quickly, more likely than scouting.
                {
                    id: "shade_night_robbery_late",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "22:00", to: "24:00" },
                    stayMinutes: { min: 5, max: 25 },
                    targets: [
                        {
                            type: "placeCategory",
                            categories: [PLACE_TAGS.commerce, PLACE_TAGS.housing],
                        },
                    ],
                    respectOpeningHours: false,
                    probability: 0.85,
                },

                // 4) Early-morning robberies: 00:00–03:00
                //    Separate rule so we don't rely on cross-midnight windows.
                {
                    id: "shade_night_robbery_early",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "00:00", to: "03:00" },
                    stayMinutes: { min: 10, max: 35 },
                    targets: [
                        {
                            type: "placeCategory",
                            categories: [PLACE_TAGS.commerce, PLACE_TAGS.housing],
                        },
                    ],
                    respectOpeningHours: false,
                    probability: 0.6,
                },

                // 5) Fence / crime den: once per week, visit at night to sell loot.
                {
                    id: "shade_weekly_crime_den",
                    type: SCHEDULE_RULES.weekly,
                    candidateDays: [DAY_KEYS[1], DAY_KEYS[3], DAY_KEYS[5]], // mon, wed, fri
                    time: { from: "23:00", to: "01:00" }, // might run slightly past midnight
                    stayMinutes: { min: 40, max: 90 },
                    target: {
                        type: "placeCategory",
                        categories: [PLACE_TAGS.crime],
                    },
                    respectOpeningHours: false,
                },

                // 6) Shade might go out for a bar crawl on days off too
                {
                    id: "shade_weekend_drinks",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.DAY_OFF],
                    window: { from: "20:00", to: "24:00" },
                    stayMinutes: { min: 20, max: 60 },
                    targets: [
                        {
                            type: "placeCategory",
                            categories: [PLACE_TAGS.nightlife, PLACE_TAGS.crime],
                        },
                    ],
                    respectOpeningHours: true,
                    probability: 0.4,
                },
            ],
        },
    },

    {
        key: "luce",
        name: "Luce",
        shortName: "Luce",
        nicknames: ["Luce", "Lulu"],

        age: 178,
        gender: Gender.NB,
        pronouns: PronounSets.THEY_THEM,

        stats: {
            looks: 0, // ethereal
            strength: 0,
            intelligence: 3,
            charisma: 4,
        },
        preferLocationsWith: [PLACE_TAGS.supernatural, PLACE_TAGS.history], //generate home at location with as many of those tagged places as possible
        tags: ["ghost", "supernatural", "romance"],

        // If you don't have a ghost body template, just reuse HUMAN_BODY_TEMPLATE for now.
        bodyTemplate: HUMAN_BODY_TEMPLATE, //GHOST_BODY_TEMPLATE,

        scheduleTemplate: {
            /**
             * Luce is a friendly ghost that:
             *  - "anchors" around their old resting place during the day
             *  - in the evening and night, occasionally enters a FOLLOW mode
             *    where they try to move in the player's direction
             *  - FOLLOW uses a new rule type: SCHEDULE_RULES.follow ("follow_entity")
             */
            useBus: false, // ghosts don't use buses
            rules: [
                // 1) Daytime anchor: 06:00–18:00 at home/resting place
                {
                    id: "luce_daytime_anchor",
                    type: SCHEDULE_RULES.home,
                    timeBlocks: [{ from: "06:00", to: "18:00" }],
                },

                // 2) Early evening ambient wandering near historical / spiritual places.
                //    This is mostly flavour, gives Luce somewhere to be when not following.
                {
                    id: "luce_evening_wander",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "18:00", to: "21:00" },
                    stayMinutes: { min: 10, max: 30 },
                    targets: [
                        {
                            type: "placeCategory",
                            categories: [
                                PLACE_TAGS.history,
                                PLACE_TAGS.culture,
                                PLACE_TAGS.supernatural,
                            ],
                        },
                        { type: "home" },
                    ],
                    respectOpeningHours: false,
                    probability: 0.5, // some evenings they just don't show up
                },

                // 3) Main haunting: Luce follows the player. this activity ends once luce finds player
                //    They try to move roughly toward the player's current / last known position.
                {
                    id: "luce_follow",
                    type: SCHEDULE_RULES.follow, // NEW RULE TYPE
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    followTarget: "player", // "player" or npc key
                    variants: [
                        //probabilites add up to 1
                        {
                            id: "luce_follow_light",
                            window: { from: "21:00", to: "00:00" },
                            updateIntervalMinutes: 15, // how often to re-evaluate where the player is
                            loseInterestDistance: 10, // if after updateIntervalMinutes they're this far away, stop following, scales with density
                            speedMult: 0.8, // movement speed multiplier while following
                            probability: 0.7, // chance this variant will be picked when rule is active
                        },
                        // 4) Occasional deep-night haunting
                        {
                            id: "luce_follow_medium",
                            window: { from: "00:00", to: "03:00" },
                            followTarget: "player",
                            updateIntervalMinutes: 10,
                            loseInterestDistance: 12,
                            speedMult: 1.1,
                            probability: 0.25,
                        },
                        {
                            id: "luce_follow_nightmare",
                            window: { from: "00:00", to: "06:00" },
                            followTarget: "player",
                            updateIntervalMinutes: 5,
                            loseInterestDistance: 15,
                            speedMult: 1.5,
                            probability: 0.05,
                        },
                    ],
                    probability: 0.3, // chance per valid day this rule is active
                },
            ],
        },
    },

    // Add more templates here later
    // { key: "alien_bartender", ... }
];

/**
 * Helper that converts a registry entry into NPC constructor options.
 * (Not strictly required, but keeps the shape explicit.)
 */
export function npcFromRegistryKey(key) {
    const def = NPC_REGISTRY.find((d) => d.key === key);
    if (!def) return null;

    return {
        id: def.key,
        name: def.name,
        age: def.age,
        gender: def.gender,
        pronouns: def.pronouns,
        stats: def.stats,
        bodyTemplate: def.bodyTemplate,
        meta: {
            tags: def.tags || [],
            shortName: def.shortName || def.name,
            registryKey: def.key,

            //keep a copy of the schedule template in meta
            scheduleTemplate: def.scheduleTemplate || null,
        },
    };
}
