import { defineFeature } from "../catalog.js";
import { TIMER_DEFINITIONS } from "./timerDefinitions.js";

export const RENT_FEATURE = defineFeature({
  id: "rent",
  timerDefinitions: TIMER_DEFINITIONS,
});
