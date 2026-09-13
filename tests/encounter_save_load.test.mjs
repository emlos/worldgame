import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  chooseAction,
  chooseFirstAvailableAction,
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
  const game = gameAtStart({ seed: 1, money: 50 });
  startEncounter(game);
  while (game.currentStory.system.state.phase === "active") {
    chooseFirstAvailableAction(game, [
      "cover-and-brace",
      "catch-breath",
      "wrench-free",
      "stand-up",
      "roll-toward",
      "shove-away",
      "create-distance",
      "run",
      "strike-holding-arm",
      "drive-body",
      "strike-face",
    ]);
  }
  assert.equal(game.player.money, 30);

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  buildScene(restored);
  buildScene(restored);
  assert.equal(restored.player.money, 30);
  assert.equal(restored.currentStory.system.state.outcome.moneyLost, 20);
});

test("save/load during the getaway preserves stolen money without applying theft twice", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  startEncounter(game);
  for (let index = 0; index < 60
    && game.currentStory.system.state.phase === "active"
    && game.currentStory.system.state.objective.stage !== "disengage";
    index += 1) {
    chooseFirstAvailableAction(game, [
      "cover-and-brace",
      "catch-breath",
      "wrench-free",
      "stand-up",
      "roll-toward",
      "shove-away",
      "create-distance",
      "strike-holding-arm",
      "drive-body",
      "strike-face",
    ]);
  }

  const beforeState = structuredClone(game.currentStory.system.state);
  assert.equal(beforeState.phase, "active");
  assert.equal(beforeState.objective.stage, "disengage");
  assert.equal(beforeState.objective.lootAmount, 20);
  assert.equal(game.player.money, 30);

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  const firstRender = buildScene(restored);
  const secondRender = buildScene(restored);

  assert.deepEqual(restored.currentStory.system.state, beforeState);
  assert.deepEqual(secondRender, firstRender);
  assert.equal(restored.player.money, 30);
});
