import { COVER_AND_BRACE } from "./defense.js";
import {
  DRIVE_BODY,
  HEADBUTT,
  KNEE_STRIKE,
  STRIKE_FACE,
  STRIKE_HOLDING_ARM,
} from "./strikes.js";
import {
  CLOSE_DISTANCE,
  CREATE_DISTANCE,
  FLEE,
  ROLL_TOWARD,
  RUN,
  SHOVE_AWAY,
  STAND_UP,
} from "./movement.js";
import {
  FORCE_TO_GROUND,
  FORCE_TO_WALL,
  GRAB_ARM,
  PIN_LIMB,
  SEARCH_MONEY,
  TIGHTEN_HOLD,
  TURN_TARGET_AWAY,
  WRENCH_FREE,
} from "./holds.js";

export const ENCOUNTER_ACTIONS = Object.freeze([
  COVER_AND_BRACE,
  HEADBUTT,
  KNEE_STRIKE,
  STRIKE_FACE,
  DRIVE_BODY,
  SHOVE_AWAY,
  GRAB_ARM,
  STRIKE_HOLDING_ARM,
  WRENCH_FREE,
  STAND_UP,
  ROLL_TOWARD,
  CREATE_DISTANCE,
  RUN,
  TIGHTEN_HOLD,
  PIN_LIMB,
  FORCE_TO_GROUND,
  FORCE_TO_WALL,
  TURN_TARGET_AWAY,
  SEARCH_MONEY,
  FLEE,
  CLOSE_DISTANCE,
]);

const ACTION_BY_ID = new Map(ENCOUNTER_ACTIONS.map((action) => [action.id, action]));

export function getEncounterAction(actionId) {
  return ACTION_BY_ID.get(String(actionId)) || null;
}
