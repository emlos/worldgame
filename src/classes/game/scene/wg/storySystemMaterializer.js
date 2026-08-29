import { buildSceneStatus } from "../sceneContext.js";
import { createScene } from "../sceneContract.js";
import { renderWGSystem } from "./storySystemRegistry.js";

export function materializeWGSystem(game, definition) {
  const frame = game.currentStory;
  if (
    frame?.type !== "sequence" ||
    frame.id !== definition.id ||
    !frame.system ||
    frame.system.id !== definition.system?.id ||
    !Object.prototype.hasOwnProperty.call(frame.system, "state")
  ) {
    throw new Error(`WG system sequence '${definition.id}' is not resolved`);
  }

  const rendered = renderWGSystem(game, definition, frame);
  return createScene({
    id: [
      "wg",
      game.storyRevision,
      "system",
      definition.id,
      frame.system.revision,
      game.now.toISOString(),
    ].join(":"),
    kind: definition.kind,
    heading: rendered.heading ?? definition.heading,
    status: buildSceneStatus(game),
    map: rendered.map ?? null,
    content: rendered.content ?? [],
    sections: rendered.sections ?? [],
  });
}
