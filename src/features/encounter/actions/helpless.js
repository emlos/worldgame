import {
  ENCOUNTER_HELPLESS_ACTION,
  getControlledHelplessReason,
} from "../combatants.js";
import { actionInstance } from "./helpers.js";
import { actionIntentProse } from "../proseData.js";

function helplessAction({ id, reason, label, playerOrder }) {
  return Object.freeze({
    id,
    tags: Object.freeze(["helpless"]),
    durationSeconds: 0,
    usableBy: "controlled",
    playerOrder,

    enumerateTargets(_context, actorId) {
      return [actionInstance(this.id, actorId, actorId)];
    },

    isAvailable(context, instance) {
      return getControlledHelplessReason(context, instance.actorId) === reason;
    },

    label() {
      return label;
    },

    intentLabel(context, intent) {
      return actionIntentProse(context, { ...intent, actionId: this.id });
    },

    resolve(_context, instance, runtime) {
      runtime.events.push({
        type: "participant.unable-to-act",
        actorId: instance.actorId,
        reason,
      });
    },
  });
}

export const TOO_TIRED_TO_MOVE = helplessAction({
  id: ENCOUNTER_HELPLESS_ACTION.energy,
  reason: "energy-exhausted",
  label: "You're too tired to move",
  playerOrder: -20,
});

export const WRITHE_IN_PAIN = helplessAction({
  id: ENCOUNTER_HELPLESS_ACTION.pain,
  reason: "pain-overwhelmed",
  label: "Writhe in pain",
  playerOrder: -19,
});
