import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  chooseAction,
  gameAtStart,
  startEncounter,
} from "./support/encounter.mjs";

test("save/load preserves state, intent, prose, choices, and body damage", () => {
  const game = gameAtStart({ seed: 1 });
  game.player.setSkillValue("strength", 10);
  startEncounter(game);
  chooseAction(game, "strike-face");

  const beforeState = structuredClone(game.currentStory.system.state);
  const beforeActorBody = structuredClone(game.currentStory.actors.mugger.body);
  const beforeScene = buildScene(game);
  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  const afterScene = buildScene(restored);

  assert.deepEqual(restored.currentStory.system.state, beforeState);
  assert.deepEqual(restored.currentStory.actors.mugger.body, beforeActorBody);
  assert.deepEqual(afterScene.content, beforeScene.content);
  assert.deepEqual(afterScene.sections, beforeScene.sections);
  assert.deepEqual(buildScene(restored), afterScene);
});

test("terminal theft consequences are not repeated by save/load or rendering", () => {
  const game = gameAtStart({ seed: 117, money: 50 });
  startEncounter(game);
  while (game.currentStory.system.state.phase === "active") {
    chooseAction(game, "cover-and-brace");
  }
  assert.equal(game.player.money, 30);

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  buildScene(restored);
  buildScene(restored);
  assert.equal(restored.player.money, 30);
  assert.equal(restored.currentStory.system.state.outcome.moneyLost, 20);
});

