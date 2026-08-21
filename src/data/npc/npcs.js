import { Gender, HUMAN_BODY_TEMPLATE, PronounSets } from "../../shared/modules.js";
import { DayKind } from "../world/calendar.js";
import { PLACE_TAGS } from "../world/place.js";
import { LOCATION_TAGS } from "../world/location.js";
import { GOAL_TYPE, TARGET_TYPE } from "./behavior.js";

// Basic templates the game can turn into NPC instances
// NPC templates retain future-facing behavior and world-placement data.
export const NPC_REGISTRY = [
    // student type
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
        homePreference: {
            nameFn: (chosenLocation) =>
                chosenLocation.places.find((p) => p.key === "dorm" || p.key === "apartment_complex")
                    ? "Taylor's flat"
                    : "Taylor's home",

            withKey: ["dorm", "apartment_complex"],
            withPlaceCategory: [PLACE_TAGS.housing],
            withLocationCategory: [LOCATION_TAGS.poor, LOCATION_TAGS.urban_center],
        },
        tags: ["human", "romance"],

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
                        dayKinds: [DayKind.WORKDAY],
                        from: "09:00",
                        to: "15:00",
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
                        dayKinds: [DayKind.WORKDAY],
                        from: "15:00",
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
                        dayKinds: [DayKind.WORKDAY],
                        from: "15:00",
                        to: "22:00",
                    },
                },
                {
                    id: "day_off_activity",
                    type: GOAL_TYPE.visit,
                    priority: 30,
                    weight: 80,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
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
                    id: "stay_home_day_off",
                    type: GOAL_TYPE.home,
                    priority: 30,
                    weight: 20,
                    when: {
                        dayKinds: [DayKind.DAY_OFF],
                        from: "06:00",
                        to: "22:00",
                    },
                },
            ],
        },
    },

    //thief type
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
        tags: ["human", "criminal", "romance"],
        bodyTemplate: HUMAN_BODY_TEMPLATE,

        homePreference: {
            nameFn: () => "Shade's hideout",
            withPlaceCategory: [PLACE_TAGS.crime, PLACE_TAGS.housing],
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

    //     behavior: null, // TODO: add NPCBrain goals before re-enabling Luce.
    // },

    //cop type
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
    },

    //nurse type
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
        tags: ["human", "staff"],

        bodyTemplate: HUMAN_BODY_TEMPLATE,
    },

    //tourist type
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
        homePreference: {
            nameFn: (chosenLocation) => "Mike's Room",

            withKey: ["motel", "hotel"],
        },

        tags: ["human", "tourist"],

        bodyTemplate: HUMAN_BODY_TEMPLATE,
    },

    //businessman type
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
    },

    //TODO: deliquent type, doctor type, homeless guy type, mayor type, teacher type, mafia type, urban explorer type, dicorced parent type, religious type, stoner type
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
        behavior: def.behavior || null,
        homePreference: def.homePreference,
        meta: {
            tags: def.tags || [],
            shortName: def.shortName || def.name,
            registryKey: def.key,
            description: def.description,
        },
    };
}
