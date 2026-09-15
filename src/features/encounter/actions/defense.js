import { canBeginPhysicalAction } from "../affordances.js";
import { getAcute, getBodyPain, getParticipant, getUsableHands } from "../combatants.js";
import { actionInstance, addExertion } from "./helpers.js";
import { recoverExertion } from "../effort.js";
import { actionIntentProse } from "../proseData.js";

export const CATCH_BREATH = Object.freeze({
  id: "catch-breath",
  tags: Object.freeze(["defense", "recovery"]),
  durationSeconds: 3,
  usableBy: "any",
  playerOrder: 58,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, actorId)];
  },

  isAvailable(context, instance) {
    const participant = getParticipant(context, instance.actorId);
    return canBeginPhysicalAction(context, instance.actorId)
      && (participant.exertion >= 12
        || participant.acute.some(({ id }) => id === "winded" || id === "dazed")
        || getBodyPain(context, instance.actorId) >= 20);
  },

  label() {
    return "Catch your breath";
  },

  intentLabel(context, intent) {
    return actionIntentProse(context, { ...intent, actionId: this.id });
  },

  resolve(context, instance, runtime) {
    const amount = recoverExertion(context, instance.actorId);
    runtime.events.push({ type: "exertion.recovered", actorId: instance.actorId, amount });
    const winded = getAcute(context, instance.actorId, "winded");
    if (winded) {
      winded.severity -= 1;
      if (winded.severity <= 0) {
        getParticipant(context, instance.actorId).acute = getParticipant(context, instance.actorId)
          .acute.filter(({ id }) => id !== "winded");
      }
      runtime.events.push({ type: "acute.eased", actorId: instance.actorId, id: "winded" });
    }
  },
});

export const COVER_AND_BRACE = Object.freeze({
  id: "cover-and-brace",
  tags: Object.freeze(["defense", "guard"]),
  durationSeconds: 1,
  usableBy: "any",
  playerOrder: 60,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, actorId)];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId)
      && getUsableHands(context, instance.actorId).length > 0;
  },

  label() {
    return "Cover and brace";
  },

  intentLabel(context, intent) {
    return actionIntentProse(context, { ...intent, actionId: this.id });
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 2);
    runtime.guarded.add(instance.actorId);
    runtime.events.push({ type: "defense.braced", actorId: instance.actorId });
  },
});
