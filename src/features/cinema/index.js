import { defineFeature } from "../catalog.js";
import { CINEMA_ACTION_HANDLERS } from "./actionHandlers.js";
import { teleportPlayerToCinema } from "./debug.js";
import { CINEMA_SCENE_DECORATORS } from "./sceneDecorators.js";
import {
  CINEMA_AUTOMATIC_REMINDERS,
  createCinemaState,
  updateCinemaScreeningReminders,
  validateCinemaStateSave,
} from "./reminders.js";

export const CINEMA_FEATURE = defineFeature({
  id: "cinema",
  state: {
    create: createCinemaState,
    validateSave: validateCinemaStateSave,
  },
  sceneDecorators: CINEMA_SCENE_DECORATORS,
  actionHandlers: CINEMA_ACTION_HANDLERS,
  automaticReminders: CINEMA_AUTOMATIC_REMINDERS,
  timeChangeHandlers: [updateCinemaScreeningReminders],
  debugActions: {
    "cinema.teleport-player": teleportPlayerToCinema,
  },
});
