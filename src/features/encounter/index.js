import { defineFeature } from "../catalog.js";
import {
  ENCOUNTER_PHYSICAL_SYSTEM_ID,
  PHYSICAL_ENCOUNTER_STORY_SYSTEM,
} from "./system.js";
import { recoverPlayerBodyOutsideEncounter } from "./pain.js";
import { teleportPlayerToAlley } from "./debug.js";
import {
  createEncounterFeatureState,
  updatePostCombatFatigue,
  validateEncounterFeatureStateSave,
} from "./consequences.js";

export const ENCOUNTER_FEATURE = defineFeature({
  id: "encounter",
  state: {
    create: createEncounterFeatureState,
    validateSave: validateEncounterFeatureStateSave,
  },
  wgSystems: {
    [ENCOUNTER_PHYSICAL_SYSTEM_ID]: PHYSICAL_ENCOUNTER_STORY_SYSTEM,
  },
  timeChangeHandlers: [recoverPlayerBodyOutsideEncounter, updatePostCombatFatigue],
  debugActions: {
    "encounter.teleport-player-to-alley": teleportPlayerToAlley,
  },
});
