import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { SCREAM_FOR_HELP_REROLL_SECONDS } from "../src/features/encounter/actions/help.js";
import {
  chooseAction,
  chooseFirstAvailableAction,
  gameAtStart,
  startEncounter,
} from "./support/encounter.mjs";

function screamRollEvent(game) {
  return game.currentStory.system.state.lastEvents.find(({ type, actionId, purpose }) =>
    type === "chance.rolled"
      && actionId === "scream-for-help"
      && purpose === "heard-by-bystander");
}

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

test("screaming reuses its saved roll until 45 in-game seconds have elapsed", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);
  chooseAction(game, "scream-for-help");

  const firstRoll = screamRollEvent(game);
  assert.equal(firstRoll.success, false);
  assert.equal(firstRoll.reused, false);
  assert.equal(firstRoll.rolledAtSecond, 0);
  assert.equal(firstRoll.rerollAtSecond, SCREAM_FOR_HELP_REROLL_SECONDS);

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  chooseAction(restored, "scream-for-help");
  const reusedRoll = screamRollEvent(restored);
  assert.equal(reusedRoll.roll, firstRoll.roll);
  assert.equal(reusedRoll.reused, true);
  assert.deepEqual(restored.currentStory.system.state.screamForHelpRoll, {
    value: game.currentStory.system.state.screamForHelpRoll.value,
    rolledAtSecond: 0,
  });

  restored.currentStory.system.state.elapsedSeconds = SCREAM_FOR_HELP_REROLL_SECONDS;
  chooseAction(restored, "scream-for-help");
  const freshRoll = screamRollEvent(restored);
  assert.equal(freshRoll.reused, false);
  assert.equal(freshRoll.rolledAtSecond, SCREAM_FOR_HELP_REROLL_SECONDS);
  assert.equal(
    freshRoll.rerollAtSecond,
    SCREAM_FOR_HELP_REROLL_SECONDS * 2,
  );
  assert.notEqual(freshRoll.roll, firstRoll.roll);
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
