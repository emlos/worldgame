import { canBeginPhysicalAction } from "../affordances.js";
import { actionInstance, addExertion } from "./helpers.js";

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

  intentLabel() {
    return "covers up and braces for your response";
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 2);
    runtime.guarded.add(instance.actorId);
    runtime.events.push({ type: "defense.braced", actorId: instance.actorId });
  },
});

