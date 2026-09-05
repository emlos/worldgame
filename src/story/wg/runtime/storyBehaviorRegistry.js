import { cloneWGSystemJSON } from "./storySystemRegistry.js";

function behaviorFor(features, behaviorId) {
  const id = String(behaviorId);
  const behavior = features.getStoryBehavior(id);
  if (!behavior) throw new Error(`Unknown WG story behavior '${id}'`);
  return { id, behavior };
}

export function enterWGStoryBehavior(game, definition) {
  const { id, behavior } = behaviorFor(game.features, definition.behavior?.id);
  if (typeof behavior.enter !== "function") {
    throw new Error(`WG story behavior '${id}' has no enter callback`);
  }
  const result = behavior.enter({
    game,
    definition,
    config: cloneWGSystemJSON(definition.behavior.config || {}, "WG behavior config"),
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`WG story behavior '${id}' must return an object`);
  }
  if (typeof result.passageId !== "string" || !result.passageId) {
    throw new Error(`WG story behavior '${id}' must choose a passageId`);
  }
  validateWGBehaviorState(game.features, id, result.state, { gameTime: game.now.getTime() });
  return {
    passageId: result.passageId,
    behavior: {
      id,
      state: cloneWGSystemJSON(result.state, `WG story behavior '${id}' state`),
    },
  };
}

export function validateWGBehaviorState(features, behaviorId, state, options = {}) {
  const { behavior } = behaviorFor(features, behaviorId);
  cloneWGSystemJSON(state, `WG story behavior '${behaviorId}' state`);
  behavior.validateState?.(state, options);
  return state;
}
