import { createFeatureCatalog } from "./catalog.js";
import { BUS_FEATURE } from "./bus/index.js";
import { CINEMA_FEATURE } from "./cinema/index.js";
import { ENCOUNTER_FEATURE } from "./encounter/index.js";
import { JOURNAL_FEATURE } from "./journal/index.js";
import { SCHOOL_FEATURE } from "./school/index.js";
import { RENT_FEATURE } from "./rent/index.js";

export const DEFAULT_FEATURE_CATALOG = createFeatureCatalog([
  BUS_FEATURE,
  CINEMA_FEATURE,
  ENCOUNTER_FEATURE,
  JOURNAL_FEATURE,
  SCHOOL_FEATURE,
  RENT_FEATURE,
]);
