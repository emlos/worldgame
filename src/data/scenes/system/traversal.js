/**
 * World traversal scenes
 * ------------------------------------------------------------------
 * Provides:
 *  - Default "outside" scene (when the player is not inside a place)
 *  - Default "place" scene (when inside a place with no bespoke content)
 *
 * Note: traversal *choices* are injected automatically by SceneManager.
 */

import { TIME_OF_DAY } from "../util/common.js";
import { WeatherType, LOCATION_TAGS } from "../../data.js";

export const SCENES = [
    {
        id: "world.outside.default",
        priority: 0,
        // "Menu" scene for being outside: allow auto-injected traversal.
        autoChoices: { traversal: true },
        conditions: {
            outside: true,
        },
        text: [
            "scene.world.outside.text",

            // Time-of-day flavour (optional)
            {
                when: { hour: TIME_OF_DAY.morning },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.time.morning.0",
                    "scene.world.outside.time.morning.1",
                ],
                pick: "random",
            },
            {
                when: { hour: TIME_OF_DAY.day },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.time.day.0",
                    "scene.world.outside.time.day.1",
                ],
                pick: "random",
            },
            {
                when: { hour: TIME_OF_DAY.evening },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.time.evening.0",
                    "scene.world.outside.time.evening.1",
                ],
                pick: "random",
            },
            {
                when: { hour: TIME_OF_DAY.night },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.time.night.0",
                    "scene.world.outside.time.night.1",
                ],
                pick: "random",
            },

            // Weather flavour (optional)
            {
                when: { weather: WeatherType.CLEAR },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.weather.clear.0",
                    "scene.world.outside.weather.clear.1",
                ],
                pick: "random",
            },
            {
                when: { weather: WeatherType.SUNNY },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.weather.sunny.0",
                    "scene.world.outside.weather.sunny.1",
                ],
                pick: "random",
            },
            {
                when: { weather: WeatherType.CLOUDY },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.weather.cloudy.0",
                    "scene.world.outside.weather.cloudy.1",
                ],
                pick: "random",
            },
            {
                when: { weather: WeatherType.RAIN },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.weather.rain.0",
                    "scene.world.outside.weather.rain.1",
                ],
                pick: "random",
            },
            {
                when: { weather: WeatherType.STORM },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.weather.storm.0",
                    "scene.world.outside.weather.storm.1",
                ],
                pick: "random",
            },
            {
                when: { weather: WeatherType.WINDY },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.weather.windy.0",
                    "scene.world.outside.weather.windy.1",
                ],
                pick: "random",
            },
            {
                when: { weather: WeatherType.SNOW },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.weather.snow.0",
                    "scene.world.outside.weather.snow.1",
                ],
                pick: "random",
            },

            // Location-tag flavour (optional; uses LOCATION_TAGS enum)
            {
                when: { locationTag: LOCATION_TAGS.urban_core },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.tag.urban_core.0",
                    "scene.world.outside.tag.urban_core.1",
                ],
                pick: "random",
            },
            {
                when: { locationTag: LOCATION_TAGS.coastal },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.tag.coastal.0",
                    "scene.world.outside.tag.coastal.1",
                ],
                pick: "random",
            },
            {
                when: { locationTag: LOCATION_TAGS.parkland },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.tag.parkland.0",
                    "scene.world.outside.tag.parkland.1",
                ],
                pick: "random",
            },
            {
                when: { locationTag: LOCATION_TAGS.wealthy },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.tag.wealthy.0",
                    "scene.world.outside.tag.wealthy.1",
                ],
                pick: "random",
            },
            {
                when: { locationTag: LOCATION_TAGS.poor },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.tag.poor.0",
                    "scene.world.outside.tag.poor.1",
                ],
                pick: "random",
            },

            // Player-flag flavour (optional)
            {
                when: { playerFlags: ["waitingForPackage"] },
                keys: [
                    "scene.world.flavor.none",
                    "scene.world.outside.player.waitingForPackage.0",
                    "scene.world.outside.player.waitingForPackage.1",
                ],
                pick: "random",
            },
        ],
        choices: [],
    },

    {
        id: "place.default",
        priority: 0,
        // Generic "lobby" for any place without bespoke scenes: allow auto Exit.
        autoChoices: { exit: true },
        conditions: {
            inPlace: true,
        },
        textKey: "scene.place.default.text",
        choices: [],
    },
];
