import { CATCH_BREATH, COVER_AND_BRACE } from "./defense.js";
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
  TIGHTEN_HOLD,
  TURN_TARGET_AWAY,
  WRENCH_FREE,
} from "./holds.js";
import {
  CONTROLLED_DISENGAGE,
  DEMAND_MONEY_BACK,
  SEARCH_MONEY,
  SURRENDER_MONEY,
} from "./objective.js";
import { ATTACK_LIMB } from "./beatDown.js";
import { SCREAM_FOR_HELP } from "./help.js";
import { TOO_TIRED_TO_MOVE, WRITHE_IN_PAIN } from "./helpless.js";
import { requireEncounterObjective } from "../objectives/index.js";

export const ENCOUNTER_ACTIONS = Object.freeze([
  TOO_TIRED_TO_MOVE,
  WRITHE_IN_PAIN,
  SURRENDER_MONEY,
  SCREAM_FOR_HELP,
  CONTROLLED_DISENGAGE,
  DEMAND_MONEY_BACK,
  COVER_AND_BRACE,
  CATCH_BREATH,
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
  ATTACK_LIMB,
  FLEE,
  CLOSE_DISTANCE,
]);

export const CORE_ENCOUNTER_ACTIONS = Object.freeze(ENCOUNTER_ACTIONS.filter(
  ({ tags }) => !tags.includes("objective") && !tags.includes("theft"),
));

const ACTION_BY_ID = new Map(ENCOUNTER_ACTIONS.map((action) => [action.id, action]));

export function getEncounterAction(actionId) {
  return ACTION_BY_ID.get(String(actionId)) || null;
}

export function getEncounterActions(context) {
  const objective = requireEncounterObjective(context.state);
  const objectiveActionIds = new Set(objective.actionIds);
  const excludedActionIds = new Set(objective.excludedActionIds || []);
  return ENCOUNTER_ACTIONS.filter(
    (action) => !excludedActionIds.has(action.id)
      && (CORE_ENCOUNTER_ACTIONS.includes(action) || objectiveActionIds.has(action.id)),
  );
}
