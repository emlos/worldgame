import { defineFeature } from "../catalog.js";
import { HOSPITAL_ACTION_HANDLERS } from "./actionHandlers.js";
import { hasUnrecoverableInjury, injuredTreatmentRegions, sashaIsOnDuty } from "./care.js";
import { HOSPITAL_SCENE_DECORATORS } from "./sceneDecorators.js";

export const HOSPITAL_FEATURE = defineFeature({
  id: "hospital",
  sceneDecorators: HOSPITAL_SCENE_DECORATORS,
  actionHandlers: HOSPITAL_ACTION_HANDLERS,
  wgContexts: {
    hospital: (game) => ({
      needsTreatment: injuredTreatmentRegions(game.player.body).length > 0,
      hasUnrecoverableInjury: hasUnrecoverableInjury(game.player.body),
      sashaOnDuty: sashaIsOnDuty(game),
    }),
  },
});
