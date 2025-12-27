/**
 * Common scene utilities
 * ------------------------------------------------------------------
 * Keep small, reusable helpers/constants for scene authoring here.
 */

/**
 * Hour ranges (UTC) for common "time of day" buckets.
 *
 * Used with SceneManager's hour gating:
 *   { when: { hour: TIME_OF_DAY.morning } }
 */
export const TIME_OF_DAY = {
    morning: { gte: 5, lt: 11 },
    day: { gte: 11, lt: 18 },
    evening: { gte: 18, lt: 23 },
    night: { between: [23, 5] },
};

/**
 * Scene text token: explicit single line-break inside a `text: [...]` array.
 *
 * Example:
 *   import { BREAK } from "../util/common.js";
 *   text: ["scene.foo", BREAK, "scene.foo.afterBreak"]
 */
export const BREAK = Object.freeze({ __type: "SCENE_BREAK" });
