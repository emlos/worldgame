import { Gender, HUMAN_BODY_TEMPLATE, PronounSets } from "../../shared/modules.js";
import { DAY_KEYS, DayKind, TARGET_TYPE, PLACE_TAGS, SCHEDULE_RULES, Season } from "../data.js";

// Basic templates the game can turn into NPC instances
// Each NPC gets a scheduleTemplate that the ScheduleManager uses to generate daily schedules
//TODO: figure out a graceful way to handle same schedule_rules priorities. sth with probability should take priority over a rule without. if theres two rule random, the one without probability should act as fallbacl
//TODO: more granular bus use controls -> use during day/night, weather considerations, car vs bus use, etc
export const NPC_REGISTRY = [
    {
        example: true, // not a real NPC, just an example
        key: "taylor",
        name: "Taylor Morgan",
        shortName: "Taylor",
        nicknames: ["Tay"],

        description:
            "Taylor is a high school student who enjoys exploring the city after school hours.",

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
        tags: ["human", "romance"],

        bodyTemplate: HUMAN_BODY_TEMPLATE,

        scheduleTemplate: {
            useBus: true,
            rules: [
                // 1) Sleep: between 22:00 and 06:00 at home
                // ALWAYS
                {
                    id: "sleep_at_home",
                    type: SCHEDULE_RULES.home,
                    timeBlocks: [
                        { from: "00:00", to: "06:00" },
                        { from: "22:00", to: "24:00" },
                    ],
                },

                //1b) mornings before school
                // ALWAYS
                {
                    id: "before_school_morning",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY], // uses Calendar DayKind
                    daysOfWeek: [DAY_KEYS[1], DAY_KEYS[2], DAY_KEYS[3], DAY_KEYS[4], DAY_KEYS[5]],
                    window: { from: "06:00", to: "09:00" },
                    stayMinutes: { min: 20, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["library"],
                        },
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["high_school"],
                            nearest: true,
                            stay: true,
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.leisure, PLACE_TAGS.food, PLACE_TAGS.commerce],
                        },
                    ],
                    respectOpeningHours: true,
                },

                // 2) Weekday school: 09:00–15:00 on workdays
                // ALWAYS
                {
                    id: "attend_school",
                    type: SCHEDULE_RULES.fixed,
                    dayKinds: [DayKind.WORKDAY], // uses Calendar DayKind
                    daysOfWeek: [DAY_KEYS[1], DAY_KEYS[2], DAY_KEYS[3], DAY_KEYS[4], DAY_KEYS[5]],
                    window: { from: "09:00", to: "15:00" },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["high_school"],
                            nearest: true,
                        },
                    ],
                },

                // 3) Weekday after-school: from 15:00 to 22:00
                //    Randomly: library / mall / any leisure place
                //ALWAYS
                {
                    id: "weekday_after_school",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY], // only if it's a work day
                    window: { from: "15:00", to: "22:00" },
                    stayMinutes: { min: 20, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["library", "mall"],
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.leisure],
                        },
                        {
                            type: TARGET_TYPE.home, // can also choose to stay at home
                        },
                    ],
                    respectOpeningHours: true,
                },

                // 4b) days off: 06:00–22:00
                {
                    id: "days_off",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.DAY_OFF],
                    window: { from: "06:00", to: "22:00" },
                    stayMinutes: { min: 20, max: 160 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["library", "mall"],
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.leisure,
                                PLACE_TAGS.service,
                                PLACE_TAGS.civic,
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.culture,
                            ],
                        },
                        {
                            type: TARGET_TYPE.home, // can also choose to stay at home
                        },
                    ],
                    respectOpeningHours: true,
                },

                // 5) Weekly nightlife:
                //    Once per week, on Fri/Sat/Sun, go to nightlife place in evening.
                //ALWAYS
                {
                    id: "nightlife_weekly",
                    type: SCHEDULE_RULES.weekly,
                    daysOfWeek: [DAY_KEYS[5], DAY_KEYS[6], DAY_KEYS[0]],
                    window: { from: "20:00", to: "24:00" },
                    stayMinutes: { min: 70, max: 150 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.nightlife],
                        },
                    ],
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
        description:
            "Shade is a cunning thief who prowls the city at night, targeting unsuspecting victims for quick robberies.",
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
                // 1) Daytime hideout/sleep: 05:00–13:00 at home
                //ALWAYS
                {
                    id: "shade_daytime_hideout",
                    type: SCHEDULE_RULES.home,
                    timeBlocks: [{ from: "05:00", to: "12:00" }],
                },

                // 1b) Shade also is a citizen, and has chores to do and a life to live
                //ALWAYS
                {
                    id: "shade_errands",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "12:00", to: "16:00" },
                    stayMinutes: { min: 15, max: 60 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.housing,
                                PLACE_TAGS.food,
                                PLACE_TAGS.service,
                            ],
                        },
                        {
                            type: TARGET_TYPE.home,
                        },
                    ],
                    respectOpeningHours: true,
                },

                // [GAP FILLER] 16:00–18:00: Loitering before the evening scout
                // She hangs out in low-profile areas to eat or watch people.
                {
                    id: "shade_afternoon_loiter",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "16:00", to: "18:00" },
                    stayMinutes: { min: 30, max: 90 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.food,
                                PLACE_TAGS.parkland,
                                PLACE_TAGS.transport,
                            ],
                        },
                        { type: TARGET_TYPE.home },
                    ],
                    respectOpeningHours: true,
                    priority: 1,
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
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.housing,
                                PLACE_TAGS.nightlife,
                                PLACE_TAGS.culture,
                                PLACE_TAGS.industry,
                                PLACE_TAGS.safety,
                            ],
                        },
                    ],
                    respectOpeningHours: false,
                },

                // 3) Late-night robberies: 22:00–24:00
                {
                    id: "shade_night_robbery_late",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "22:00", to: "24:00" },
                    stayMinutes: { min: 5, max: 45 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.housing,
                                PLACE_TAGS.culture,
                            ],
                        },
                    ],
                    respectOpeningHours: false,
                    probability: 0.85,
                },

                // [FALLBACK] Night activity fallback (22:00–03:00)
                // If she fails the probability check for a robbery, she doesn't just freeze.
                // She lurks in industrial areas or dive bars, waiting for a chance that never comes.
                {
                    id: "shade_night_lurk_fallback",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "22:00", to: "03:00" },
                    stayMinutes: { min: 45, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.industry,
                                PLACE_TAGS.urban_edge,
                                PLACE_TAGS.nightlife,
                            ],
                        },
                        {
                            // If she really has nothing to do, she goes back to her hideout
                            type: TARGET_TYPE.home,
                        },
                    ],
                    respectOpeningHours: false,
                },

                // 4) Early-morning robberies: 00:00–03:00
                //    Separate rule so we don't rely on cross-midnight windows.
                {
                    id: "shade_night_robbery_early",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "00:00", to: "03:00" },
                    stayMinutes: { min: 10, max: 45 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.housing,
                                PLACE_TAGS.culture,
                            ],
                        },
                    ],
                    respectOpeningHours: false,
                    probability: 0.6,
                },

                // 5) Fence / crime den: once per week, visit at night to sell loot.
                {
                    id: "shade_weekly_crime_den",
                    type: SCHEDULE_RULES.weekly,
                    daysOfWeek: [DAY_KEYS[1], DAY_KEYS[3], DAY_KEYS[5]], // mon, wed, fri
                    window: { from: "23:00", to: "01:00" }, // might run slightly past midnight
                    stayMinutes: { min: 40, max: 90 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.crime],
                        },
                    ],
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
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.nightlife, PLACE_TAGS.crime],
                            alwaysMove: true, //TODO: always force a change of place
                        },
                    ],
                    respectOpeningHours: true,
                    probability: 0.4,
                },

                // 7) very rarely shade needs to dissappear for a few days, to hide from police
                {
                    id: "shade_lay_low",
                    type: SCHEDULE_RULES.fixed,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF], // uses Calendar DayKind
                    daysOfWeek: [...DAY_KEYS],
                    window: { from: "00:00", to: "24:00" },
                    stayMinutes: { min: 24 * 60, max: 7 * 24 * 60, round: 24 * 60 }, //TODO: round the duration of the slot to round value in minutes
                    target: {
                        type: TARGET_TYPE.unavailable, //TODO: new type, npc not in any location, they do not exist or move or plan anything until stayminutes are over
                    },
                    respectOpeningHours: false,
                    probability: 0.05,

                    priority: 9999, //TODO: if other rules of same type are in the same time slot, rule with highest priority is the one thta completely overrides the other rule
                },
            ],
        },
    },

    {
        key: "luce",
        name: "Luce",
        shortName: "Luce",
        nicknames: ["Luce", "Lulu"],

        description:
            "Luce is a friendly ghost who haunts the city, often trying to make contact with the living in subtle ways.",

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
             *    where they try to move in the player's/npc's direction
             */
            useBus: false, // ghosts don't use buses
            travelModifier: 1.5, //TODO: travel duration is multiplied by this globally, unless specified otherwise in a rule
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
                    stayMinutes: { min: 30, max: 60 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.history,
                                PLACE_TAGS.culture,
                                PLACE_TAGS.supernatural,
                            ],
                        },
                        { type: TARGET_TYPE.home },
                    ],
                    respectOpeningHours: false,
                    probability: 0.5, // some evenings they just don't show up
                },

                // 3) Main haunting: Luce follows the player. this activity ends once luce finds player
                //    They try to move roughly toward the player's current / last known position.
                {
                    id: "luce_follow_player",
                    type: SCHEDULE_RULES.follow, //TODO: for scheduling purposes works like daily but with no set location, indicated follow behavior for game engine
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "21:00", to: "06:00" }, //time window the rule can be applied at
                    variants: [
                        //TODO: pick one for every slot this rule generates
                        {
                            id: "luce_follow_light",
                            window: { from: "21:00", to: "00:00" }, //start and end times for this variants
                            updateIntervalMinutes: 15, // how often to re-evaluate where the player is
                            loseInterestDistance: 10, // if after updateIntervalMinutes they're this far away, stop following, scales with density
                            speedMult: 0.8, // movement speed multiplier while following
                            weight: 0.7, // chance this variant will be picked when rule is active
                        },
                        // 4) Occasional deep-night haunting
                        {
                            id: "luce_follow_medium",
                            window: { from: "00:00", to: "03:00" },
                            followTarget: "player",
                            updateIntervalMinutes: 10,
                            loseInterestDistance: 12,
                            speedMult: 1.1,
                            weight: 0.25,
                        },
                        {
                            id: "luce_follow_nightmare",
                            window: { from: "00:00", to: "06:00" },
                            followTarget: "player",
                            updateIntervalMinutes: 5,
                            loseInterestDistance: 15,
                            speedMult: 1.5,
                            weight: 0.05,
                        },
                    ],
                    probability: 0.3, // chance per valid day this rule is active
                },
            ],
        },
    },

    {
        key: "officer_vega",
        name: "Officer Leon Vega",
        shortName: "Vega",
        nicknames: ["Officer Vega", "Leo"],

        age: 32,
        gender: Gender.M,
        pronouns: PronounSets.HE_HIM,

        stats: {
            looks: 2,
            strength: 4,
            intelligence: 0,
            charisma: 3,
        },

        tags: ["human", "cop"],
        preferLocationsWith: [PLACE_TAGS.safety, PLACE_TAGS.transport, PLACE_TAGS.housing], //generate home at location with as many of those tagged places as possible
        bodyTemplate: HUMAN_BODY_TEMPLATE,

        scheduleTemplate: {
            /**
             * Night-shift patrol cop:
             *  - Sleeps late because of night work
             *  - Starts at station, then patrols city in the evening/night
             *  - Patrol windows overlap heavily with Shade's activity
             *  - Slight randomness so not every night looks identical
             */
            useBus: true,
            rules: [
                // 1) Daytime sleep at home: 06:00–14:00
                {
                    id: "vega_daytime_sleep",
                    type: SCHEDULE_RULES.home,
                    timeBlocks: [{ from: "06:00", to: "14:00" }],
                },

                // [GAP FILLER] Workday Pre-shift: 14:00–16:00
                // Coffee, gym, or commute before the briefing.
                {
                    id: "vega_preshift_routine",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY],
                    window: { from: "14:00", to: "16:00" },
                    stayMinutes: { min: 30, max: 60 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["gym", "cafe", "corner_store"],
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.food],
                        },
                        { type: TARGET_TYPE.home },
                    ],
                    respectOpeningHours: true,
                },

                // 2) Pre-shift at station on workdays: 16:00–18:00
                //    Briefing, paperwork, gear check.
                {
                    id: "vega_station_briefing",
                    type: SCHEDULE_RULES.fixed,
                    dayKinds: [DayKind.WORKDAY],
                    daysOfWeek: [
                        DAY_KEYS[1], // mon
                        DAY_KEYS[2], // tue
                        DAY_KEYS[3], // wed
                        DAY_KEYS[4], // thu
                        DAY_KEYS[5], // fri
                    ],
                    window: { from: "16:00", to: "18:00" },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["police_station"], // you define this place in your world
                            nearest: true,
                        },
                    ],
                },

                // 3) Evening patrol on workdays: 18:00–23:00
                //    Roams busy areas: commerce, nightlife, transport.
                {
                    id: "vega_evening_patrol_workdays",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY],
                    window: { from: "18:00", to: "23:00" },
                    stayMinutes: { min: 15, max: 45 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.nightlife,
                                PLACE_TAGS.transport,
                                PLACE_TAGS.safety,
                                PLACE_TAGS.crime,
                                PLACE_TAGS.housing,
                            ],
                        },
                    ],
                    respectOpeningHours: false,
                    probability: 0.9, // almost always patrols on shift nights
                },

                // [FALLBACK] Desk Duty: 18:00–02:00
                // If the random patrol rules (probability 0.9/0.8) don't fire, he is stuck at the station.
                {
                    id: "vega_desk_duty_fallback",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY],
                    window: { from: "18:00", to: "02:00" },
                    stayMinutes: { min: 4 * 60, max: 4 * 60 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["police_station"],
                            nearest: true,
                        },
                    ],
                },

                // 4) Late-night patrol on workdays: 23:00–02:00
                //    This window overlaps strongly with Shade's robberies.
                {
                    id: "vega_late_night_patrol_workdays",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY],
                    window: { from: "23:00", to: "02:00" },
                    stayMinutes: { min: 20, max: 50 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.industry,
                                PLACE_TAGS.nightlife,
                                PLACE_TAGS.transport,
                                PLACE_TAGS.crime,
                            ],
                        },
                    ],
                    respectOpeningHours: false,
                    probability: 0.8,
                },

                // 5) Weekend / day-off behaviour:
                //    Sometimes still patrols at night, but less consistently.
                {
                    id: "vega_weekend_night_patrol",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.DAY_OFF],
                    window: { from: "20:00", to: "01:00" },
                    stayMinutes: { min: 15, max: 40 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.nightlife,
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.transport,
                                PLACE_TAGS.safety,
                            ],
                        },
                    ],
                    respectOpeningHours: false,
                    probability: 0.5, // some nights he’s off duty, some nights he’s covering
                },

                // 6) Weekly admin day: once per week, longer stay at station.
                {
                    id: "vega_weekly_admin_day",
                    type: SCHEDULE_RULES.weekly,
                    daysOfWeek: [DAY_KEYS[1]], // monday
                    window: { from: "14:00", to: "18:00" },
                    stayMinutes: { min: 60, max: 150 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["police_station"],
                        },
                    ],
                    respectOpeningHours: true,
                },

                // [GAP FILLER] Day Off Daytime: 14:00–20:00
                // Normal human chores since he sleeps late.
                {
                    id: "vega_day_off_chores",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.DAY_OFF],
                    window: { from: "14:00", to: "20:00" },
                    stayMinutes: { min: 45, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.service,
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.leisure,
                            ],
                        },
                        { type: TARGET_TYPE.home },
                    ],
                    respectOpeningHours: true,
                },
            ],
        },
    },

    {
        key: "clara",
        name: "Clara Novak",
        shortName: "Clara",
        nicknames: ["Nurse Clara"],

        description:
            "Clara is the school nurse - but also your local cinema attendant. The economy is *rough* out there.",

        age: 34,
        gender: Gender.F,
        pronouns: PronounSets.SHE_HER,

        stats: {
            looks: 7,
            strength: 2,
            intelligence: 4,
            charisma: 4,
        },
        preferLocationsWith: [PLACE_TAGS.culture, PLACE_TAGS.safety, PLACE_TAGS.housing], //generate home at location with as many of those tagged places as possible
        tags: ["human", "staff"],

        bodyTemplate: HUMAN_BODY_TEMPLATE,

        scheduleTemplate: {
            /**
             * Clara is the school nurse where Taylor studies.
             *  - Standard workdays at the high school nurse's office
             *  - Overlaps Taylor's school hours (09:00–15:00)
             *  - Short lunch break wandering to cafeteria / staff areas
             *  - After-school errands in town, then home for the evening
             */
            useBus: true,
            rules: [
                // 1) Night sleep at home: 22:00–06:00
                {
                    id: "clara_sleep_at_home",
                    type: SCHEDULE_RULES.home,
                    timeBlocks: [
                        { from: "22:00", to: "24:00" },
                        { from: "00:00", to: "06:00" },
                    ],
                },

                // 2) Workdays: at high school nurse office 08:00–16:00
                //    This fully covers Taylor's 09:00–15:00 school time.
                {
                    id: "clara_nurse_hours",
                    type: SCHEDULE_RULES.fixed,
                    dayKinds: [DayKind.WORKDAY],
                    daysOfWeek: [
                        DAY_KEYS[1], // mon
                        DAY_KEYS[2], // tue
                        DAY_KEYS[3], // wed
                        DAY_KEYS[4], // thu
                        DAY_KEYS[5], // fri
                    ],
                    window: { from: "08:00", to: "16:00" },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["high_school"], // same place Taylor attends
                            nearest: true,
                        },
                    ],
                },

                // 3) After-school errands: 16:00–19:00 on workdays
                //    She might be encountered by Taylor after school in town.
                {
                    id: "clara_after_work_errands",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY],
                    window: { from: "16:00", to: "19:00" },
                    stayMinutes: { min: 20, max: 60 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.service, // post office, salon, etc.
                                PLACE_TAGS.food, // cafés, restaurants
                                PLACE_TAGS.commerce, // shops
                            ],
                        },
                        { type: TARGET_TYPE.home }, // sometimes goes straight home
                    ],
                    respectOpeningHours: true,
                    probability: 0.7,
                },

                // 4) Part-time job / side activities on days off:
                // works as cinema attendant fri–sun 17:30–22:00
                {
                    id: "clara_part_time_cinema",
                    type: SCHEDULE_RULES.fixed,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    daysOfWeek: [
                        DAY_KEYS[5], // fri
                        DAY_KEYS[6], // sat
                        DAY_KEYS[0], // sun
                    ],
                    window: { from: "17:30", to: "22:00" },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["cinema"],
                            nearest: true,
                        },
                    ],
                },

                // 5) Weekends / days off:
                //    Casual errands & leisure, mostly daytime/early evening.
                {
                    id: "clara_weekend_life",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.DAY_OFF],
                    window: { from: "09:00", to: "20:00" },
                    stayMinutes: { min: 30, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.food,
                                PLACE_TAGS.leisure,
                                PLACE_TAGS.culture,
                                PLACE_TAGS.commerce,
                                PLACE_TAGS.service,
                                PLACE_TAGS.history,
                            ],
                        },
                        { type: TARGET_TYPE.home },
                    ],
                    respectOpeningHours: true,
                },

                // 6) Nightlife
                {
                    id: "clara_weekend_nightlife",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.DAY_OFF],
                    window: { from: "20:00", to: "23:30" },
                    stayMinutes: { min: 30, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.food, PLACE_TAGS.leisure, PLACE_TAGS.nightlife],
                        },
                        {
                            type: TARGET_TYPE.home,
                            stay: true, //if she goes home, she stays there until window is over, the night ended early
                        },
                    ],
                    respectOpeningHours: true,
                    probability: 0.3,
                },
            ],
        },
    },

    {
        key: "mike",
        name: "Mike Thompson",
        shortName: "Mike",
        nicknames: ["Mike", "MT"],

        description: "Tourist Mike is here for the sights. And the people. Both count.",

        age: 27,
        gender: Gender.M,
        pronouns: PronounSets.HE_HIM,

        stats: {
            looks: 3,
            strength: 2,
            intelligence: 3,
            charisma: 4,
        },
        preferLocationsWith: [PLACE_TAGS.culture, PLACE_TAGS.history, PLACE_TAGS.leisure], //generate home at location with as many of those tagged places as possible
        //TODO: add way to force hotel/motel place as home loc. function?

        tags: ["human", "tourist"],

        bodyTemplate: HUMAN_BODY_TEMPLATE,

        scheduleTemplate: {
            /**
             * Mike is a city tourist staying at a hotel.
             *  - Sleeps at TARGET_TYPE.home (his hotel) at night
             *  - Spends the day visiting culture/history/leisure spots
             *  - Eats in food/commerce areas
             *  - Sometimes goes out in nightlife districts in the evening
             *
             * All rules use only:
             *  - SCHEDULE_RULES.home / fixed / random / weekly
             *  - Existing PLACE_TAGS (culture, history, leisure, commerce, food, service, nightlife)
             */
            useBus: true,
            rules: [
                // 1) Night sleep at hotel: 23:00–07:00 at TARGET_TYPE.home
                {
                    id: "mike_sleep_at_hotel",
                    type: SCHEDULE_RULES.home,
                    timeBlocks: [
                        { from: "23:00", to: "24:00" },
                        { from: "00:00", to: "07:00" },
                    ],
                },

                // 2) Slow morning at/near hotel: 07:00–09:00
                //    Breakfast, getting ready – mostly stays home or nearby café.
                {
                    id: "mike_morning_chill",
                    type: SCHEDULE_RULES.random,
                    window: { from: "07:00", to: "09:00" },
                    stayMinutes: { min: 20, max: 60 },
                    targets: [
                        { type: TARGET_TYPE.home }, // hotel room
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["hotel_cafe"],
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.food, PLACE_TAGS.leisure, PLACE_TAGS.commerce],
                        },
                    ],
                    respectOpeningHours: true,
                },

                // 3) Daytime sightseeing: 09:00–16:00
                //    Visits culture/history/leisure places.
                {
                    id: "mike_daytime_sightseeing",
                    type: SCHEDULE_RULES.random,
                    window: { from: "09:00", to: "16:00" },
                    stayMinutes: { min: 30, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.culture, // museums, galleries
                                PLACE_TAGS.history, // monuments, old town
                                PLACE_TAGS.leisure, // parks, attractions
                            ],
                        },
                    ],
                    respectOpeningHours: true,
                },

                // 4) Late afternoon shopping / cafés: 16:00–19:00
                //    Good window to bump into locals after work/school.
                {
                    id: "mike_afternoon_shopping",
                    type: SCHEDULE_RULES.random,
                    window: { from: "16:00", to: "19:00" },
                    stayMinutes: { min: 20, max: 90 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.commerce, // shops, mall
                                PLACE_TAGS.food, // cafés, restaurants
                                PLACE_TAGS.service, // tourist info, etc.
                            ],
                        },
                    ],
                    respectOpeningHours: true,
                },

                // 5) Evening food & possible nightlife: 19:00–23:00
                //    Alternates between dinner and going out.
                {
                    id: "mike_evening_out",
                    type: SCHEDULE_RULES.random,
                    window: { from: "19:00", to: "23:00" },
                    stayMinutes: { min: 30, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.food, PLACE_TAGS.nightlife, PLACE_TAGS.leisure],
                        },
                        { type: TARGET_TYPE.home }, // sometimes just goes back early
                    ],
                    respectOpeningHours: true,
                },

                // 6) One “big night out” per week in nightlife areas.
                {
                    id: "mike_big_night_out",
                    type: SCHEDULE_RULES.weekly,
                    daysOfWeek: [DAY_KEYS[4], DAY_KEYS[5], DAY_KEYS[6]], // thu, fri, sat
                    window: { from: "21:00", to: "24:00" },
                    stayMinutes: { min: 60, max: 150 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.nightlife],
                        },
                    ],
                    respectOpeningHours: true,
                },
            ],

            season: [Season.SUMMER, Season.WINTER], //TODO: mike only visits the city in summer and winter -> doesnt exist on map/doesnt have a schedule otherwise
        },
    },

    {
        key: "vincent",
        name: "Vincent Hale",
        shortName: "Vincent",
        nicknames: ["Vince", "Mr. Hale", "Vic"],

        description:
            "Vincent has a grip on the city's corporate world, and a taste for the finer things in life. He's often seen at exclusive clubs and high-end restaurants.",

        age: 54,
        gender: Gender.M,
        pronouns: PronounSets.HE_HIM,

        stats: {
            looks: 8,
            strength: 5,
            intelligence: 4,
            charisma: 2,
        },

        tags: ["human", "romance", "corporate"],
        preferLocationsWith: [
            PLACE_TAGS.commerce,
            PLACE_TAGS.leisure,
            PLACE_TAGS.food,
            PLACE_TAGS.culture,
        ],
        bodyTemplate: HUMAN_BODY_TEMPLATE,

        scheduleTemplate: {
            /**
             * Vincent is a high-income corporate guy with a hedonistic lifestyle.
             *
             *  - Sleeps late due to constant nightlife.
             *  - Works in a corporate tower on workdays, but not super early.
             *  - Long lunches at upscale restaurants.
             *  - Gym / self-care early evening.
             *  - Heavy nightlife most nights, with one especially wild weekly night.
             *
             */
            useBus: false,
            useCar: true, // he can afford it lol. travelTimeMult: 0.15, compared to bus' 0.3
            rules: [
                // 1) Late sleep at penthouse: 03:00–10:00
                {
                    id: "vincent_penthouse_sleep",
                    type: SCHEDULE_RULES.home,
                    timeBlocks: [{ from: "03:00", to: "10:00" }],
                },
                // 1b) morning routine
                {
                    id: "vincent_morning_routine_workday",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY],
                    window: { from: "09:00", to: "11:00" },
                    stayMinutes: { min: 30, max: 90 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["gym", "office_tower", "bank"],
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.civic, PLACE_TAGS.food],
                        },
                        { type: TARGET_TYPE.home },
                    ],
                    respectOpeningHours: true,
                },

                // 2) Workdays: office hours in corporate tower, 11:00–18:00
                {
                    id: "vincent_office_hours",
                    type: SCHEDULE_RULES.fixed,
                    dayKinds: [DayKind.WORKDAY],
                    daysOfWeek: [
                        DAY_KEYS[1], // mon
                        DAY_KEYS[2], // tue
                        DAY_KEYS[3], // wed
                        DAY_KEYS[4], // thu
                        DAY_KEYS[5], // fri
                    ],
                    window: { from: "11:00", to: "18:00" },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["office_block"],
                            nearest: true,
                        },
                    ],
                },

                {
                    id: "vincent_office_hours_weekend",
                    type: SCHEDULE_RULES.fixed,
                    daysOfWeek: [
                        DAY_KEYS[6], // sat
                    ],
                    window: { from: "11:00", to: "15:00" },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["office_block"],
                            nearest: true,
                        },
                    ],
                },

                // 2a) Investor / client meetings during workday, overlapping with office, once per day
                {
                    id: "vincent_investor_meetings",
                    type: SCHEDULE_RULES.daily,
                    dayKinds: [DayKind.WORKDAY],
                    window: { from: "11:00", to: "16:00" },
                    stayMinutes: { min: 60, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.commerce, PLACE_TAGS.service, PLACE_TAGS.crime],
                        },
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["art_gallery", "restaurant", "town_square", "bank"],
                        },
                    ],
                    respectOpeningHours: true,
                    probability: 0.5,
                },

                // 2b) Workday long lunch: 13:00–15:00
                //    Expensive restaurants / upscale cafés.
                {
                    id: "vincent_long_lunch",
                    type: SCHEDULE_RULES.daily,
                    dayKinds: [DayKind.WORKDAY],
                    window: { from: "13:00", to: "14:30" },
                    stayMinutes: { min: 30, max: 90 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.food, // fancy restaurants
                                PLACE_TAGS.commerce, // high-end mall food courts
                            ],
                        },
                    ],
                    respectOpeningHours: true,
                    probability: 0.3,
                    once: true, // TODO: ensure only one long lunch per workday, would random type be better?
                },

                // 3) Early evening gym / self-care: 18:00–20:00 (most days)
                {
                    id: "vincent_evening_gym",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "18:00", to: "20:00" },
                    stayMinutes: { min: 45, max: 90 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["gym"], // define as a place if you want
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.leisure, // spa, pool, etc.
                                PLACE_TAGS.service, // grooming salons
                                PLACE_TAGS.food,
                            ],
                        },
                    ],
                    respectOpeningHours: true,
                    probability: 0.7,
                },

                // 5) Regular nightlife: 20:00–02:00
                //    Bars, clubs, exclusive lounges.
                {
                    id: "vincent_nightlife_regular",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "20:00", to: "02:00" },
                    stayMinutes: { min: 40, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.nightlife,
                                PLACE_TAGS.food, // late dinners
                                PLACE_TAGS.leisure, // casino-like leisure, lounges
                            ],
                        },
                        { type: TARGET_TYPE.home, stay: true }, // sometimes retreats to penthouse
                    ],
                    respectOpeningHours: true,
                },

                // 6) Weekend / day-off daytime: brunch, shopping, culture.
                {
                    id: "vincent_weekend_day",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.DAY_OFF],
                    window: { from: "11:00", to: "18:00" },
                    stayMinutes: { min: 30, max: 120 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [
                                PLACE_TAGS.food, // brunch places
                                PLACE_TAGS.commerce, // luxury shopping
                                PLACE_TAGS.culture, // galleries, shows
                                PLACE_TAGS.leisure,
                            ],
                        },
                        { type: TARGET_TYPE.home },
                    ],
                    respectOpeningHours: true,
                },

                // 7) One truly wild “big night” each week: Thu / Fri / Sat.
                {
                    id: "vincent_big_night",
                    type: SCHEDULE_RULES.weekly,
                    daysOfWeek: [DAY_KEYS[4], DAY_KEYS[5], DAY_KEYS[6]], // thu, fri, sat
                    window: { from: "22:00", to: "03:00" },
                    stayMinutes: { min: 90, max: 210 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.nightlife],
                        },
                    ],
                    respectOpeningHours: true,
                    probability: 0.8, // most weeks he goes out big
                },

                // 8) Crime contacts – weekly chance to visit a crime establishment.
                {
                    id: "vincent_crime_associates_weekly",
                    type: SCHEDULE_RULES.weekly,
                    daysOfWeek: [DAY_KEYS[1], DAY_KEYS[3]], // mon or wed
                    window: { from: "01:00", to: "03:00" }, // after clubs, before sleep
                    stayMinutes: { min: 20, max: 60 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.crime],
                        },
                    ],
                    respectOpeningHours: false,
                    probability: 0.3,
                },

                // 9) Extra secret crime drop-ins: low-probability, high-noise.
                {
                    id: "vincent_secret_crime_dropins",
                    type: SCHEDULE_RULES.random,
                    dayKinds: [DayKind.WORKDAY, DayKind.DAY_OFF],
                    window: { from: "23:00", to: "03:00" },
                    stayMinutes: { min: 10, max: 30 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.crime, PLACE_TAGS.nightlife],
                        },
                        {
                            type: TARGET_TYPE.home,
                            stay: true,
                        },
                    ],
                    respectOpeningHours: false,
                    probability: 0.1, // occasional extra shady nights
                },

                // 10) Public-facing “good guy” charity / art events once in a while.
                {
                    id: "vincent_charity_events",
                    type: SCHEDULE_RULES.weekly,
                    daysOfWeek: [DAY_KEYS[2], DAY_KEYS[4]], // tue or thu
                    window: { from: "19:00", to: "22:00" },
                    stayMinutes: { min: 60, max: 150 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.culture, PLACE_TAGS.civic, PLACE_TAGS.industry],
                        },
                    ],
                    respectOpeningHours: true,
                    probability: 0.6, // only some weeks he bothers
                },
            ],
        },
    },

    //TODO: deliquent type with priority override for activities, like randomly sneaking out of school instead of going to a lesson...
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
        preferLocationsWith: def.preferLocationsWith || [],
        tags: def.tags,
        pronouns: def.pronouns,
        stats: def.stats,
        bodyTemplate: def.bodyTemplate,
        scheduleTemplate: def.scheduleTemplate,
        meta: {
            tags: def.tags || [],
            shortName: def.shortName || def.name,
            registryKey: def.key,
            description: def.description,
        },
    };
}
