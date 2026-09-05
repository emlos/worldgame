import { createFeatureCatalog } from "./catalog.js";
import { BUS_FEATURE } from "./bus/index.js";
import { SCHOOL_FEATURE } from "./school/index.js";
import { RENT_FEATURE } from "./rent/index.js";

export const DEFAULT_FEATURE_CATALOG = createFeatureCatalog([
  BUS_FEATURE,
  SCHOOL_FEATURE,
  RENT_FEATURE,
]);
