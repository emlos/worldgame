/**
 * Sample scene pack
 * ------------------------------------------------------------------
 * Demonstrates:
 *  - a "home" place scene (placeKey: player_home)
 *  - a "street" virtual place scene (placeKey: street)
 *  - a random flavour text scene
 *  - a high-priority conditional scene (ambulance) that takes over when injured
 */

export const SCENES = [
    {
        id: "home.default",
        priority: 10,
        conditions: {
            placeKey: "player_home",
            notPlayerFlags: ["injured"],
        },
        textKey: "scene.home.default.text",
        choices: [
            {
                id: "home.goOutside",
                textKey: "choice.home.goOutside",
                minutes: 2,
                setPlaceKey: "street",
                nextSceneId: "street.default",
            },
            {
                id: "home.tidyUp",
                textKey: "choice.home.tidyUp",
                minutes: 30,
                nextSceneId: "home.tidyUp",
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
        textKeys: [
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

    {
        id: "street.default",
        priority: 10,
        conditions: {
            placeKey: "street",
            notPlayerFlags: ["injured"],
        },
        textKey: "scene.street.default.text",
        choices: [
            {
                id: "street.goInside",
                textKey: "choice.home.goInside",
                minutes: 2,
                setPlaceKey: "player_home",
                nextSceneId: "home.default",
            },
            {
                id: "street.getInjured",
                textKey: "choice.street.getInjured",
                minutes: 0,
                setFlag: "injured",
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
                minutes: 15,
                clearFlag: "injured",
                // Send the player home as a simple resolution.
                setPlaceKey: "player_home",
                nextSceneId: "home.default",
            },
        ],
    },
];
