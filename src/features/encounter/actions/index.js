import { COVER_AND_BRACE } from "./defense.js";
import { DRIVE_BODY, STRIKE_FACE, STRIKE_HOLDING_ARM } from "./strikes.js";
import {
  CLOSE_DISTANCE,
  CREATE_DISTANCE,
  FLEE,
  RUN,
  SHOVE_AWAY,
} from "./movement.js";
import {
  FORCE_TO_WALL,
  GRAB_ARM,
  SEARCH_MONEY,
  TIGHTEN_HOLD,
  WRENCH_FREE,
} from "./holds.js";

export const ENCOUNTER_ACTIONS = Object.freeze([
  COVER_AND_BRACE,
  STRIKE_FACE,
  DRIVE_BODY,
  SHOVE_AWAY,
  GRAB_ARM,
  STRIKE_HOLDING_ARM,
  WRENCH_FREE,
  CREATE_DISTANCE,
  RUN,
  TIGHTEN_HOLD,
  FORCE_TO_WALL,
  SEARCH_MONEY,
  FLEE,
  CLOSE_DISTANCE,
]);

const ACTION_BY_ID = new Map(ENCOUNTER_ACTIONS.map((action) => [action.id, action]));

export function getEncounterAction(actionId) {
  return ACTION_BY_ID.get(String(actionId)) || null;
}

