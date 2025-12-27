/**
 * Sample scene pack
 * ------------------------------------------------------------------
 * Demonstrates:
 *  - a "home" place scene (placeKey: player_home)
 *  - a "street" virtual place scene (placeKey: street)
 *  - conditional text blocks inside a single scene
 *  - a random flavour text scene
 *  - a high-priority conditional scene (ambulance) that takes over when injured
 */

import { TIME_OF_DAY } from "../util/common.js";

//TODO: some sort of visual editor for scenes might be nice
export const SCENES = [
    {
        id: "home.default",
        priority: 10,
        conditions: {
            placeKey: "player_home",
            notPlayerFlags: ["injured"],
        },

        // One guaranteed text + optional conditional paragraphs.
        // This avoids having to create a separate scene for every variant.
        text: [
            "scene.home.default.text",
            { when: { hour: TIME_OF_DAY.morning }, key: "scene.home.default.morning" },
            { when: { hour: TIME_OF_DAY.evening }, key: "scene.home.default.evening" },
            { when: { npcsPresent: ["taylor"] }, key: "scene.home.default.taylorPresent" },
            {
                when: { playerFlags: ["waitingForPackage"] },
                key: "scene.home.default.waitingForPackage",
            },
            "\n", //TODO add newline handling
            "Ain't life nice?"
        ],

        choices: [
            {
                id: "home.tidyUp",
                textKey: "choice.home.tidyUp",
                minutes: 30,
                nextSceneId: "home.tidyUp",
            },
            {
                id: "home.waitForPackage",
                textKey: "choice.home.waitForPackage",
                minutes: 1,
                setFlag: "waitingForPackage", //TODO: group sets/clears/effects/etc in one object
                nextSceneId: "home.default",
            },
            {
                id: "home.stopWaitingForPackage",
                textKey: "choice.home.stopWaitingForPackage",
                minutes: 1,
                clearFlag: "waitingForPackage",
                nextSceneId: "home.default",
            },
            {
                // Demo of a flag-triggered, high-priority scene.
                id: "home.getInjured",
                textKey: "choice.home.getInjured",
                minutes: 0,
                setFlag: "injured",
                // You can omit nextSceneId here and rely on priority resolution.
            },
        ],
    },

    {
        id: "home.tidyUp",
        priority: 11,
        conditions: {
            placeKey: "player_home",
            notPlayerFlags: ["injured"],
        },
        // Pick 1 at random each time the scene is entered
        textKeys: [ //TODO: unify the text and denote when to pick random text. maybe {when ..., random: true, key: [scene.home.whatever1, scene.home.whatever2..]}
            "scene.home.tidyUp.flavortext.0",
            "scene.home.tidyUp.flavortext.1",
            "scene.home.tidyUp.flavortext.2",
            "scene.home.tidyUp.flavortext.3",
            "scene.home.tidyUp.flavortext.4",
        ],
        choices: [
            {
                id: "home.return",
                textKey: "choice.home.return",
                minutes: 0,
                nextSceneId: "home.default",
            },
        ],
    },

    // High-priority "interrupt" scene.
    // When injured becomes true, this scene will win the resolver.
    {
        id: "ambulance.arrives",
        priority: 100,
        conditions: {
            playerFlags: ["injured"],
        },
        textKey: "scene.ambulance.arrives.text",
        choices: [
            {
                id: "ambulance.help",
                textKey: "choice.ambulance.help",
                minutes: 30,
                hideMinutes:  true, 
                clearFlag: "injured",
                // Send the player home as a simple resolution.
                setPlaceKey: "player_home",
                nextSceneId: "home.default",
            },
        ],
    },

    // Last-resort scene.
    // Shown when a forced nextSceneId is invalid, or when no scene can be resolved.
    {
        id: "system.fallback",
        priority: -9999,
        // Intentionally no conditions.
        textKey: "scene.system.fallback.text",
        choices: [
            {
                id: "system.fallback.continue",
                textKey: "choice.system.fallback.continue",
                minutes: 0,
                // Try to put the player somewhere sane; resolver will pick the best match.
                setPlaceKey: "player_home",
            },
        ],
    },
];
