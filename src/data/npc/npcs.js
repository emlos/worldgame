import { Gender, PronounSets } from "../../shared/classes/pronouns.js";
import { HUMAN_BODY_TEMPLATE } from "../../shared/classes/body.js";
import { SCHOOL_DAY_END, SCHOOL_DAY_START } from "../player/schedule.js";
import { DayKind } from "../world/calendar.js";
import { DAY_KEYS } from "../world/time.js";
import { PLACE_TAGS } from "../world/place.js";
import { LOCATION_TAGS } from "../world/location.js";
import { GOAL_TYPE, TARGET_TYPE } from "./behavior.js";

//TODO: bus/car/walk on foot preference
export const NPC_REGISTRY = [
    // student type
    {
        id: "taylor",
        name: "Taylor Morgan",
        meta: {
           // example: true, test flag, remove before release
            shortName: "Taylor",
            nicknames: ["Tay"],
            description:
                "Taylor is a high school student who enjoys exploring the city after school hours.",
            tags: ["human", "romance"],
        },

        age: 18,
        gender: Gender.F,
        pronouns: PronounSets.SHE_HER,

        stats: {
            looks: 3,
            strength: 1,
            intelligence: 4,
            charisma: 3,
        },
        homePreference: {
            nameFn: (chosenLocation) =>
                chosenLocation.places.find((p) => p.key === "dorm" || p.key === "apartment_complex")
                    ? "Taylor's flat"
                    : "Taylor's home",

            withKey: ["dorm", "apartment_complex"],
            withPlaceCategory: [PLACE_TAGS.housing],
            withLocationCategory: [LOCATION_TAGS.poor, LOCATION_TAGS.urban_center],
        },
        bodyTemplate: HUMAN_BODY_TEMPLATE,
        behavior: {
            goals: [
                {
                    id: "night_home",
                    type: GOAL_TYPE.home,
                    priority: 90,
                    when: { from: "22:00", to: "06:00" },
                },
                {
                    id: "school",
                    type: GOAL_TYPE.obligation,
                    priority: 100,
                    when: {
                        schoolDay: true,
                        from: SCHOOL_DAY_START,
                        to: SCHOOL_DAY_END,
                    },
                    target: {
                        type: TARGET_TYPE.placeKeys,
                        candidates: ["high_school"],
                        nearest: true,
                    },
                },
                {
                    id: "after_school_activity",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 70,
                    when: {
                        schoolDay: true,
                        from: SCHOOL_DAY_END,
                        to: "22:00",
                    },
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
                    ],
                    disallowedTargets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.nightlife, PLACE_TAGS.luxury],
                        },
                    ],
                    requireOpen: true,
                },
                {
                    id: "go_home_after_school",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 30,
                    when: {
                        schoolDay: true,
                        from: SCHOOL_DAY_END,
                        to: "22:00",
                    },
                },
                {
                    id: "no_school_activity",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 80,
                    when: {
                        schoolDay: false,
                        from: "06:00",
                        to: "22:00",
                    },
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
                    ],
                    disallowedTargets: [
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.nightlife, PLACE_TAGS.luxury],
                        },
                    ],
                    requireOpen: true,
                },
                {
                    id: "stay_home_no_school",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 20,
                    when: {
                        schoolDay: false,
                        from: "06:00",
                        to: "22:00",
                    },
                },
            ],
        },
    },

    //thief type
    {
        id: "shade",
        name: 'Mara "Shade" Kovač',
        meta: {
            shortName: "Shade",
            nicknames: ["Shade", "Hey You"],
            description:
                "Shade is a cunning thief who prowls the city at night, targeting unsuspecting victims for quick robberies.",
            tags: ["human", "criminal", "romance"],
        },
        age: 26,
        gender: Gender.F,
        pronouns: PronounSets.SHE_HER,
        stats: {
            looks: 2,
            strength: 3,
            intelligence: 3,
            charisma: 2,
        },
        bodyTemplate: HUMAN_BODY_TEMPLATE,

        homePreference: {
            nameFn: () => "Shade's hideout",
            withPlaceCategory: [PLACE_TAGS.crime, PLACE_TAGS.housing],
        },
        behavior: {
            goals: [
                {
                    id: "shade_daytime_hideout",
                    type: GOAL_TYPE.home,
                    priority: 90,
                    when: { from: "03:00", to: "12:00" },
                },
                {
                    id: "shade_errands",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 70,
                    when: { from: "12:00", to: "16:00" },
                    stayMinutes: { min: 15, max: 60 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [
                            PLACE_TAGS.commerce,
                            PLACE_TAGS.food,
                            PLACE_TAGS.service,
                            PLACE_TAGS.housing,
                        ],
                    },
                    requireOpen: true,
                },
                {
                    id: "shade_errands_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 30,
                    when: { from: "12:00", to: "16:00" },
                },
                {
                    id: "shade_afternoon_loiter",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 75,
                    when: { from: "16:00", to: "18:00" },
                    stayMinutes: { min: 30, max: 90 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.food, PLACE_TAGS.leisure, PLACE_TAGS.transport],
                    },
                    requireOpen: true,
                },
                {
                    id: "shade_afternoon_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 25,
                    when: { from: "16:00", to: "18:00" },
                },
                {
                    id: "shade_evening_scouting",
                    type: GOAL_TYPE.visit,
                    priority: 40,
                    when: { from: "18:00", to: "22:00" },
                    stayMinutes: { min: 15, max: 45 },
                    target: {
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
                    requireOpen: false,
                },
                {
                    id: "shade_night_robbery",
                    type: GOAL_TYPE.visit,
                    priority: 50,
                    weight: 65,
                    when: { from: "22:00", to: "03:00" },
                    stayMinutes: { min: 10, max: 45 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [
                            PLACE_TAGS.commerce,
                            PLACE_TAGS.housing,
                            PLACE_TAGS.culture,
                            PLACE_TAGS.crime,
                        ],
                    },
                    requireOpen: false,
                },
                {
                    id: "shade_night_lurk",
                    type: GOAL_TYPE.visit,
                    priority: 50,
                    weight: 35,
                    when: { from: "22:00", to: "03:00" },
                    stayMinutes: { min: 45, max: 120 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.industry, PLACE_TAGS.nightlife, PLACE_TAGS.crime],
                    },
                    requireOpen: false,
                },
            ],
        },
    },

    //ghost type
    // {
    //     key: "luce",
    //     name: "Luce",
    //     shortName: "Luce",
    //     nicknames: ["Luce", "Lulu"],

    //     description:
    //         "Luce is a friendly ghost who haunts the city, often trying to make contact with the living in subtle ways.",

    //     age: 178,
    //     gender: Gender.NB,
    //     pronouns: PronounSets.THEY_THEM,

    //     stats: {
    //         looks: 0, // ethereal
    //         strength: 0,
    //         intelligence: 3,
    //         charisma: 4,
    //     },
    //     homePreference: {
    //         nameFn: (chosenLocation) =>
    //             chosenLocation.places.find((p) => p.key == "cementery")
    //                 ? "Empty Crypt"
    //                 : "Roadside grave",

    //         withPlaceCategory: [PLACE_TAGS.history, PLACE_TAGS.supernatural],
    //     },
    //     tags: ["ghost", "supernatural", "romance"],

    //     // If you don't have a ghost body template, just reuse HUMAN_BODY_TEMPLATE for now.
    //     bodyTemplate: HUMAN_BODY_TEMPLATE, //GHOST_BODY_TEMPLATE,

    //     behavior: null, // TODO: chase behavior for luce: during certain hours of the night/special dates she actively follows the player?
    // },

    //cop type
    {
        id: "officer_vega",
        name: "Officer Leon Vega",
        meta: {
            shortName: "Vega",
            nicknames: ["Officer Vega", "Leo"],
            tags: ["human", "cop"],
        },

        age: 32,
        gender: Gender.M,
        pronouns: PronounSets.HE_HIM,

        stats: {
            looks: 2,
            strength: 4,
            intelligence: 0,
            charisma: 3,
        },

        homePreference: {
            nameFn: (chosenLocation) => "Officer Vega's Apartment",

            withLocationCategory: [
                LOCATION_TAGS.urban_edge,
                LOCATION_TAGS.suburban,
                LOCATION_TAGS.residential,
                LOCATION_TAGS.industrial,
            ],
        },
        bodyTemplate: HUMAN_BODY_TEMPLATE,
        behavior: {
            goals: [
                {
                    id: "vega_daytime_sleep",
                    type: GOAL_TYPE.home,
                    priority: 90,
                    when: { from: "03:00", to: "10:00" },
                },
                {
                    id: "vega_preshift_routine",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 70,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "10:00",
                        to: "16:00",
                    },
                    stayMinutes: { min: 30, max: 60 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["gym", "cafe", "corner_store"],
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.food, PLACE_TAGS.service, PLACE_TAGS.safety],
                        },
                    ],
                    requireOpen: true,
                },
                {
                    id: "vega_preshift_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 30,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "10:00",
                        to: "16:00",
                    },
                },
                {
                    id: "vega_station_briefing",
                    type: GOAL_TYPE.obligation,
                    priority: 100,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "16:00",
                        to: "18:00",
                    },
                    target: {
                        type: TARGET_TYPE.placeKeys,
                        candidates: ["police_station"],
                        nearest: true,
                    },
                },
                {
                    id: "vega_evening_patrol",
                    type: GOAL_TYPE.visit,
                    priority: 70,
                    weight: 90,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "18:00",
                        to: "23:00",
                    },
                    stayMinutes: { min: 15, max: 45 },
                    target: {
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
                    requireOpen: false,
                },
                {
                    id: "vega_evening_desk_duty",
                    type: GOAL_TYPE.visit,
                    priority: 70,
                    weight: 10,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "18:00",
                        to: "23:00",
                    },
                    stayMinutes: { min: 60, max: 180 },
                    target: {
                        type: TARGET_TYPE.placeKeys,
                        candidates: ["police_station"],
                        nearest: true,
                    },
                    requireOpen: true,
                },
                {
                    id: "vega_late_patrol",
                    type: GOAL_TYPE.visit,
                    priority: 70,
                    weight: 80,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "23:00",
                        to: "02:00",
                    },
                    stayMinutes: { min: 20, max: 50 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [
                            PLACE_TAGS.commerce,
                            PLACE_TAGS.industry,
                            PLACE_TAGS.nightlife,
                            PLACE_TAGS.transport,
                            PLACE_TAGS.crime,
                        ],
                    },
                    requireOpen: false,
                },
                {
                    id: "vega_late_desk_duty",
                    type: GOAL_TYPE.visit,
                    priority: 70,
                    weight: 20,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "23:00",
                        to: "02:00",
                    },
                    stayMinutes: { min: 30, max: 90 },
                    target: {
                        type: TARGET_TYPE.placeKeys,
                        candidates: ["police_station"],
                        nearest: true,
                    },
                    requireOpen: true,
                },
                {
                    id: "vega_day_off_chores",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 70,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "10:00",
                        to: "20:00",
                    },
                    stayMinutes: { min: 45, max: 120 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.service, PLACE_TAGS.commerce, PLACE_TAGS.leisure],
                    },
                    requireOpen: true,
                },
                {
                    id: "vega_day_off_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 30,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "10:00",
                        to: "20:00",
                    },
                },
                {
                    id: "vega_day_off_patrol",
                    type: GOAL_TYPE.visit,
                    priority: 40,
                    weight: 50,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "20:00",
                        to: "01:00",
                    },
                    stayMinutes: { min: 15, max: 40 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [
                            PLACE_TAGS.nightlife,
                            PLACE_TAGS.commerce,
                            PLACE_TAGS.transport,
                            PLACE_TAGS.safety,
                        ],
                    },
                    requireOpen: false,
                },
                {
                    id: "vega_day_off_evening_home",
                    type: GOAL_TYPE.home,
                    priority: 40,
                    weight: 50,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "20:00",
                        to: "01:00",
                    },
                },
                {
                    id: "vega_post_shift_home",
                    type: GOAL_TYPE.home,
                    priority: 80,
                    when: { from: "02:00", to: "03:00" },
                },
            ],
        },
    },

    //nurse type
    {
        id: "clara",
        name: "Clara Novak",
        meta: {
            shortName: "Clara",
            nicknames: ["Nurse Clara"],
            description:
                "Clara is the school nurse - but also your local cinema attendant. The economy is *rough* out there.",
            tags: ["human", "staff"],
        },

        age: 34,
        gender: Gender.F,
        pronouns: PronounSets.SHE_HER,

        stats: {
            looks: 7,
            strength: 2,
            intelligence: 4,
            charisma: 4,
        },
        homePreference: {
            nameFn: (chosenLocation) =>
                chosenLocation.places.find((p) => p.key === "apartment_complex")
                    ? "Clara's flat"
                    : "Clara's home",

            withKey: ["apartment_complex"],
            withPlaceCategory: [PLACE_TAGS.housing],
            withLocationCategory: [
                LOCATION_TAGS.poor,
                LOCATION_TAGS.commercial,
                LOCATION_TAGS.urban,
                LOCATION_TAGS.suburban,
                LOCATION_TAGS.residential,
                LOCATION_TAGS.dense,
                LOCATION_TAGS.urban_center,
            ],
        },
        bodyTemplate: HUMAN_BODY_TEMPLATE,
        behavior: {
            goals: [
                {
                    id: "clara_sleep_at_home",
                    type: GOAL_TYPE.home,
                    priority: 90,
                    when: { from: "22:00", to: "06:00" },
                },
                {
                    id: "clara_nurse_hours",
                    type: GOAL_TYPE.obligation,
                    priority: 100,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "08:00",
                        to: "16:00",
                    },
                    target: {
                        type: TARGET_TYPE.placeKeys,
                        candidates: ["high_school"],
                        nearest: true,
                    },
                },
                {
                    id: "clara_after_work_errands",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 70,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "16:00",
                        to: "20:00",
                    },
                    stayMinutes: { min: 20, max: 60 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.service, PLACE_TAGS.food, PLACE_TAGS.commerce],
                    },
                    requireOpen: true,
                },
                {
                    id: "clara_after_work_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 30,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "16:00",
                        to: "20:00",
                    },
                },
                {
                    id: "clara_part_time_cinema",
                    type: GOAL_TYPE.obligation,
                    priority: 110,
                    when: {
                        daysOfWeek: [DAY_KEYS[5], DAY_KEYS[6], DAY_KEYS[0]],
                        from: "17:30",
                        to: "22:00",
                    },
                    target: {
                        type: TARGET_TYPE.placeKeys,
                        candidates: ["cinema"],
                        nearest: true,
                    },
                },
                {
                    id: "clara_day_off_life",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 75,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "09:00",
                        to: "20:00",
                    },
                    stayMinutes: { min: 30, max: 120 },
                    target: {
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
                    requireOpen: true,
                },
                {
                    id: "clara_day_off_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 25,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "09:00",
                        to: "20:00",
                    },
                },
                {
                    id: "clara_day_off_evening",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 30,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "20:00",
                        to: "23:30",
                    },
                    stayMinutes: { min: 30, max: 120 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.food, PLACE_TAGS.leisure, PLACE_TAGS.nightlife],
                    },
                    requireOpen: true,
                },
                {
                    id: "clara_day_off_evening_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 70,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "20:00",
                        to: "23:30",
                    },
                },
            ],
        },
    },

    //tourist type
    {
        id: "mike",
        name: "Mike Thompson",
        meta: {
            shortName: "Mike",
            nicknames: ["Mike", "MT"],
            description: "Tourist Mike is here for the sights. And the people. Both count.",
            tags: ["human", "tourist"],
        },

        age: 27,
        gender: Gender.M,
        pronouns: PronounSets.HE_HIM,

        stats: {
            looks: 3,
            strength: 2,
            intelligence: 3,
            charisma: 4,
        },
        homePreference: {
            nameFn: (chosenLocation) => "Mike's Room",

            withKey: ["motel", "hotel"],
        },

        bodyTemplate: HUMAN_BODY_TEMPLATE,
        behavior: {
            goals: [
                {
                    id: "mike_sleep_at_hotel",
                    type: GOAL_TYPE.home,
                    priority: 90,
                    when: { from: "23:00", to: "07:00" },
                },
                {
                    id: "mike_morning_out",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 40,
                    when: { from: "07:00", to: "09:00" },
                    stayMinutes: { min: 20, max: 60 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.food, PLACE_TAGS.leisure, PLACE_TAGS.commerce],
                    },
                    requireOpen: true,
                },
                {
                    id: "mike_morning_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 60,
                    when: { from: "07:00", to: "09:00" },
                },
                {
                    id: "mike_daytime_sightseeing",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    when: { from: "09:00", to: "16:00" },
                    stayMinutes: { min: 30, max: 120 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.culture, PLACE_TAGS.history, PLACE_TAGS.leisure],
                    },
                    requireOpen: true,
                },
                {
                    id: "mike_afternoon_shopping",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    when: { from: "16:00", to: "19:00" },
                    stayMinutes: { min: 20, max: 90 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.commerce, PLACE_TAGS.food, PLACE_TAGS.service],
                    },
                    requireOpen: true,
                },
                {
                    id: "mike_evening_out",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 75,
                    when: { from: "19:00", to: "23:00" },
                    stayMinutes: { min: 30, max: 120 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.food, PLACE_TAGS.nightlife, PLACE_TAGS.leisure],
                    },
                    requireOpen: true,
                },
                {
                    id: "mike_evening_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 25,
                    when: { from: "19:00", to: "23:00" },
                },
            ],
        },
    },

    //businessman type
    {
        id: "vincent",
        name: "Vincent Hale",
        meta: {
            shortName: "Vincent",
            nicknames: ["Vince", "Mr. Hale", "Vic"],
            description:
                "Vincent has a grip on the city's corporate world, and a taste for the finer things in life. He's often seen at exclusive clubs and high-end restaurants.",
            tags: ["human", "romance", "corporate"],
        },

        age: 54,
        gender: Gender.M,
        pronouns: PronounSets.HE_HIM,

        stats: {
            looks: 8,
            strength: 5,
            intelligence: 4,
            charisma: 2,
        },

        homePreference: {
            nameFn: (chosenLocation) => "Vincent's Penthouse",

            withPlaceCategory: [PLACE_TAGS.housing, PLACE_TAGS.industry, PLACE_TAGS.culture],
            withLocationCategory: [
                LOCATION_TAGS.wealthy,
                LOCATION_TAGS.suburban_hub,
                LOCATION_TAGS.historic,
            ],
        },
        bodyTemplate: HUMAN_BODY_TEMPLATE,
        behavior: {
            goals: [
                {
                    id: "vincent_penthouse_sleep",
                    type: GOAL_TYPE.home,
                    priority: 90,
                    when: { from: "03:00", to: "10:00" },
                },
                {
                    id: "vincent_morning_routine",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 70,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "10:00",
                        to: "11:00",
                    },
                    stayMinutes: { min: 30, max: 60 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["gym", "bank"],
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.civic, PLACE_TAGS.food, PLACE_TAGS.service],
                        },
                    ],
                    requireOpen: true,
                },
                {
                    id: "vincent_morning_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 30,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "10:00",
                        to: "11:00",
                    },
                },
                {
                    id: "vincent_office_hours",
                    type: GOAL_TYPE.obligation,
                    priority: 80,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "11:00",
                        to: "18:00",
                    },
                    target: {
                        type: TARGET_TYPE.placeKeys,
                        candidates: ["office_block"],
                        nearest: true,
                    },
                },
                {
                    id: "vincent_midday_out",
                    type: GOAL_TYPE.visit,
                    priority: 90,
                    when: {
                        dayKinds: [DayKind.WORKDAY],
                        from: "13:00",
                        to: "14:30",
                    },
                    stayMinutes: { min: 90, max: 90 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["art_gallery", "restaurant", "town_square", "bank"],
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.food, PLACE_TAGS.commerce, PLACE_TAGS.service],
                        },
                    ],
                    requireOpen: true,
                },
                {
                    id: "vincent_saturday_office",
                    type: GOAL_TYPE.obligation,
                    priority: 70,
                    when: {
                        daysOfWeek: [DAY_KEYS[6]],
                        from: "11:00",
                        to: "15:00",
                    },
                    target: {
                        type: TARGET_TYPE.placeKeys,
                        candidates: ["office_block"],
                        nearest: true,
                    },
                },
                {
                    id: "vincent_day_off",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 80,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "10:00",
                        to: "18:00",
                    },
                    stayMinutes: { min: 30, max: 120 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [
                            PLACE_TAGS.food,
                            PLACE_TAGS.commerce,
                            PLACE_TAGS.culture,
                            PLACE_TAGS.leisure,
                        ],
                    },
                    requireOpen: true,
                },
                {
                    id: "vincent_day_off_home",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 20,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "10:00",
                        to: "18:00",
                    },
                },
                {
                    id: "vincent_evening_self_care",
                    type: GOAL_TYPE.visit,
                    priority: 40,
                    weight: 75,
                    when: { from: "18:00", to: "20:00" },
                    stayMinutes: { min: 45, max: 90 },
                    targets: [
                        {
                            type: TARGET_TYPE.placeKeys,
                            candidates: ["gym"],
                        },
                        {
                            type: TARGET_TYPE.placeCategory,
                            candidates: [PLACE_TAGS.leisure, PLACE_TAGS.service, PLACE_TAGS.food],
                        },
                    ],
                    requireOpen: true,
                },
                {
                    id: "vincent_evening_home",
                    type: GOAL_TYPE.home,
                    priority: 40,
                    weight: 25,
                    when: { from: "18:00", to: "20:00" },
                },
                {
                    id: "vincent_nightlife",
                    type: GOAL_TYPE.visit,
                    priority: 40,
                    weight: 80,
                    when: { from: "20:00", to: "03:00" },
                    stayMinutes: { min: 40, max: 120 },
                    target: {
                        type: TARGET_TYPE.placeCategory,
                        candidates: [PLACE_TAGS.nightlife, PLACE_TAGS.food, PLACE_TAGS.leisure],
                    },
                    requireOpen: true,
                },
                {
                    id: "vincent_night_home",
                    type: GOAL_TYPE.home,
                    priority: 40,
                    weight: 20,
                    when: { from: "20:00", to: "03:00" },
                },
            ],
        },
    },
    //TODO: gossip type, deliquent type, doctor type, homeless guy type, mayor type, teacher type, mafia type, urban explorer type, dicorced parent type, religious type, stoner type, jaded stripper type, band type
];
