import { defineFeature } from "../catalog.js";
import {
  ENCOUNTER_PHYSICAL_SYSTEM_ID,
  PHYSICAL_ENCOUNTER_STORY_SYSTEM,
} from "./system.js";
import { recoverPlayerPainOutsideEncounter } from "./pain.js";
import { teleportPlayerToAlley } from "./debug.js";

export const ENCOUNTER_FEATURE = defineFeature({
  id: "encounter",
  wgSystems: {
    [ENCOUNTER_PHYSICAL_SYSTEM_ID]: PHYSICAL_ENCOUNTER_STORY_SYSTEM,
  },
  timeChangeHandlers: [recoverPlayerPainOutsideEncounter],
  debugActions: {
    "encounter.teleport-player-to-alley": teleportPlayerToAlley,
  },
});
