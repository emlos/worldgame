import { canBeginPhysicalAction } from "../affordances.js";
import { actionInstance, addExertion } from "./helpers.js";
import { encounterVerb } from "../language.js";

export const COVER_AND_BRACE = Object.freeze({
  id: "cover-and-brace",
  tags: Object.freeze(["defense", "guard"]),
  durationSeconds: 1,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 60,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, actorId)];
  },

  isAvailable(context, instance) {
    return canBeginPhysicalAction(context, instance.actorId);
  },

  label() {
    return "Cover and brace";
  },

  intentLabel(context, intent) {
    return `${encounterVerb(context, intent.actorId, "covers", "cover")} up and ${encounterVerb(context, intent.actorId, "braces", "brace")} for your response`;
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 2);
    runtime.guarded.add(instance.actorId);
    runtime.events.push({ type: "defense.braced", actorId: instance.actorId });
  },
});
