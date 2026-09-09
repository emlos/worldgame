import { defineFeature } from "../catalog.js";
import { CINEMA_ACTION_HANDLERS } from "./actionHandlers.js";
import { CINEMA_SCENE_DECORATORS } from "./sceneDecorators.js";

export const CINEMA_FEATURE = defineFeature({
  id: "cinema",
  sceneDecorators: CINEMA_SCENE_DECORATORS,
  actionHandlers: CINEMA_ACTION_HANDLERS,
});

