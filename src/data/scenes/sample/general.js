/**
 * Sample scene pack
 * ------------------------------------------------------------------
 * Demonstrates:
 *  - a "home" place scene (placeKey: player_home)
 *  - conditional text blocks inside a single scene
 *  - a random flavour text scene
 *  - a high-priority conditional scene (ambulance) that takes over when injured
 */

import { TIME_OF_DAY, BREAK } from "../util/common.js";

//TODO: some sort of visual editor for scenes might be nice
export const SCENES = [
    {
        id: "home.default",
        priority: 10,
        // "Menu" scene for the player's home: allow auto-injected Exit.
        autoChoices: { exit: true },
        conditions: {
            placeKeys: ["player_home"],
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
            BREAK,
            { raw: "Ain't life nice?" },
        ],

        choices: [
            {
                id: "home.tidyUp",
                text: "choice.home.tidyUp",
                minutes: 30,
                nextSceneId: "home.tidyUp",
            },
            {
                id: "home.waitForPackage",
                text: "choice.home.waitForPackage",
                minutes: 1,
                // Only show this option if the player isn't already waiting for a package.
                when: { notPlayerFlags: ["waitingForPackage"] },
                setFlag: "waitingForPackage", //TODO: group sets/clears/effects/etc in one object
                nextSceneId: "home.default",
            },
            {
                id: "home.stopWaitingForPackage",
                text: "choice.home.stopWaitingForPackage",
                minutes: 1,
                // Demo: show the button always, but disable it unless the player is actually waiting.
                when: { playerFlags: ["waitingForPackage"] },
                showAnyway: true,
                clearFlag: "waitingForPackage",
                nextSceneId: "home.default",
            },
            {
                // Demo of a flag-triggered, high-priority scene.
                id: "home.getInjured",
                text: "choice.home.getInjured",
                setFlag: "injured",
                // You can omit nextSceneId here and rely on priority resolution.
            },
        ],
    },

    {
        id: "home.tidyUp",
        priority: 11,
        conditions: {
            placeKeys: ["player_home"],
            notPlayerFlags: ["injured"],
        },
        // Pick 1 at random each time the scene is entered
        text: [
            {
                keys: [
                    "scene.home.tidyUp.flavortext.0",
                    "scene.home.tidyUp.flavortext.1",
                    "scene.home.tidyUp.flavortext.2",
                    "scene.home.tidyUp.flavortext.3",
                    "scene.home.tidyUp.flavortext.4",
                ],
                pick: "random",
            },
        ],
        choices: [
            {
                id: "home.return",
                text: "choice.home.return",
                nextSceneId: "home.default",
            },
        ],
    },

    //TODO: test interrupts when player stat falls below n, mybe with flag: interrupt?

    // High-priority "interrupt" scene.
    // When injured becomes true, this scene will win the resolver.
    {
        id: "ambulance.arrives",
        priority: 100,
        conditions: {
            playerFlags: ["injured"],
        },
        text: "scene.ambulance.arrives.text",
        choices: [
            {
                id: "ambulance.help",
                text: "choice.ambulance.help",
                minutes: 30,
                hideMinutes:  true, 
                clearFlag: "injured",
                // Send the player home as a simple resolution.
                moveToHome: true,
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
        text: "scene.system.fallback.text",
        choices: [
            {
                id: "system.fallback.continue",
                text: "choice.system.fallback.continue",
                // Try to put the player somewhere sane; resolver will pick the best match.
                moveToHome: true,
            },
        ],
    },
];
