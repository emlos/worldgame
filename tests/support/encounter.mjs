import assert from "node:assert/strict";

import { Game } from "../../src/game/game.js";
import { buildScene } from "../../src/game/scene/sceneEngine.js";
import { performChoice } from "../../src/game/scene/choiceEngine.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../../src/story/wg/runtime/storyRuntime.js";

export const ENCOUNTER_SCENE_ID = "encounter.alley-mugging";
export const FIXED_START = new Date("2026-09-11T20:00:00.000Z");

export function gameAtStart({ seed = 117, money = 50 } = {}) {
  return new Game({
    seed,
    startDate: FIXED_START,
    playerOptions: { startPlaceId: null, money },
  });
}

export function startEncounter(game) {
  enterWGScene(game, ENCOUNTER_SCENE_ID);
  resolveActiveWGStory(game);
  return game.currentStory.system.state;
}

export function sceneChoices(game) {
  return buildScene(game).sections.flatMap((section) => section.choices);
}

export function findActionChoice(game, actionId) {
  return sceneChoices(game).find(({ action }) => action.command?.actionId === actionId) || null;
}

export function chooseAction(game, actionId) {
  const scene = buildScene(game);
  const choice = scene.sections
    .flatMap((section) => section.choices)
    .find(({ id, action }) =>
      id === `encounter-action:${actionId}` || action.command?.actionId === actionId);
  assert.ok(choice, `expected encounter action '${actionId}'`);
  performChoice(game, { sceneId: scene.id, choiceId: choice.id });
  return choice;
}

export function placePlayerAtAlley(game) {
  for (const location of game.world.locations.values()) {
    const alley = location.places.find(({ key }) => key === "alleyway");
    if (!alley) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(alley.id) });
    return alley;
  }
  throw new Error("Test world has no alleyway");
}
