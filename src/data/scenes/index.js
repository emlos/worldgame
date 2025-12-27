import { SCENES as SAMPLE_SCENES } from "./sample/general.js";
import { SCENES as TRAVERSAL_SCENES } from "./system/traversal.js";

/**
 * Flat list of all known scene definitions.
 *
 * You can later split this up by feature/region and import the pieces here.
 */
export const SCENE_DEFS = [...TRAVERSAL_SCENES, ...SAMPLE_SCENES];
