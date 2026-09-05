import { defineFeature } from "../catalog.js";
import { BUS_ACTION_HANDLERS } from "./actionHandlers.js";
import { BUS_SCENE_DECORATORS } from "./sceneDecorators.js";
import { BUS_PLACE_DEFINITIONS } from "./places.js";

export const BUS_FEATURE = defineFeature({
  id: "bus",
  sceneDecorators: BUS_SCENE_DECORATORS,
  actionHandlers: BUS_ACTION_HANDLERS,
  placeDefinitions: BUS_PLACE_DEFINITIONS,
});
