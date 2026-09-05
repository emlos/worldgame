import { BUS_PLACE_DEFINITIONS } from "./bus/places.js";
import { SCHOOL_PLACE_DEFINITIONS } from "./school/places.js";

export const FEATURE_PLACE_DEFINITIONS = Object.freeze([
  ...BUS_PLACE_DEFINITIONS,
  ...SCHOOL_PLACE_DEFINITIONS,
]);
