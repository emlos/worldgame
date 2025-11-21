// src/data/npc/npcs.js
import { Gender, HUMAN_BODY_TEMPLATE, PronounSets } from "../../shared/modules.js";
import { DAY_KEYS, DayKind, PLACE_TAGS, SCHEDULE_RULES } from "../data.js";

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

        tags: ["human", "befriendable"],

        bodyTemplate: null,

        scheduleTemplate: {
            /**
             * Rules are interpreted by ScheduleManager.
             *
             * Supported types in this pass:
             *  - "daily_home_block"  : fixed home-at-time blocks
             *  - "fixed_activity"    : fixed block on days matching filters
             *  - "random_visits"     : repeated random stays within a window
             *  - "weekly_once"       : pick one day in the week for a one-off event
             */
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
                    stayMinutes: { min: 30, max: 180 },
                    targets: [
                        { type: "placeKey", key: "library" },
                        { type: "placeKey", key: "mall" },
                        {
                            type: "placeCategory",
                            categories: [PLACE_TAGS.leisure],
                            nearest: true,
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
                        {
                            type: "placeCategory",
                            categories: [
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.leisure,
                                PLACE_TAGS.culture,
                                PLACE_TAGS.food,
                            ],
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
                    stayMinutes: { min: 30, max: 120 },
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
        //Luce the friendly ghost NPC
        key: "Luce",
        name: "Luce",
        shortName: "Luce",
        nicknames: ["Light", "Lu"],
        age: Infinity,
        gender: Gender.NB,
        pronouns: PronounSets.THEY_THEM,
        stats: {
            looks: 9,
            strength: 4,
            intelligence: 3,
            charisma: 5,
        },
        tags: ["ghost", "befriendable"],

        bodyTemplate: null, //GHOST_BODY_TEMPLATE,
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
