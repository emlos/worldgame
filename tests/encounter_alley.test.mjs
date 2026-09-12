import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../src/story/wg/runtime/sceneExposure.js";
import { exitWGStory } from "../src/story/wg/runtime/storyRuntime.js";
import {
  chooseAction,
  findActionChoice,
  gameAtStart,
  placePlayerAtAlley,
  startEncounter,
} from "./support/encounter.mjs";

function playUntilTerminal(game, choose) {
  for (let index = 0; index < 20 && game.currentStory.system.state.phase === "active"; index += 1) {
    chooseAction(game, choose(game));
  }
  assert.equal(game.currentStory.system.state.phase, "terminal");
  return game.currentStory.system.state.outcome;
}

test("entering an alley triggers the mugging once", () => {
  const game = gameAtStart();
  placePlayerAtAlley(game);

  const entered = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
  assert.equal(entered?.id, "encounter.alley-mugging");
  assert.equal(game.currentStory.system.id, "encounter.physical");
  assert.ok(game.currentStory.actors.mugger);
  assert.equal(game.hasFlag("encounter.alley_mugging_seen"), true);

  exitWGStory(game);
  const repeated = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
  assert.notEqual(repeated?.id, "encounter.alley-mugging");
});

test("failure to disrupt control completes bounded theft exactly once", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  startEncounter(game);
  const outcome = playUntilTerminal(game, () => "cover-and-brace");

  assert.deepEqual(outcome, {
    id: "theft-completed-player-conscious",
    moneyLost: 20,
  });
  assert.equal(game.player.money, 30);
  assert.equal(game.currentStory.system.state.objective.amount, 20);
  assert.equal(game.currentStory.system.state.npcIntent, null);
  assert.deepEqual(buildScene(game).sections[0].choices.map(({ id }) => id), [
    "encounter-action:finish",
  ]);

  buildScene(game);
  buildScene(game);
  assert.equal(game.player.money, 30);
  chooseAction(game, "finish");
  assert.equal(game.currentStory, null);
});

test("theft is capped at available money and an empty target invents no new objective", () => {
  const lowMoney = gameAtStart({ seed: 1, money: 7 });
  startEncounter(lowMoney);
  const theft = playUntilTerminal(lowMoney, () => "cover-and-brace");
  assert.equal(theft.moneyLost, 7);
  assert.equal(lowMoney.player.money, 0);

  const empty = gameAtStart({ seed: 117, money: 0 });
  startEncounter(empty);
  const emptyOutcome = playUntilTerminal(empty, () => "cover-and-brace");
  assert.equal(emptyOutcome.id, "mugger-fled");
  assert.equal(empty.currentStory.system.state.objective.amount, 0);
  assert.equal(empty.player.money, 0);
});

test("escape, retreat, incapacitation, and incapacitated theft are reachable outcomes", () => {
  const escape = gameAtStart({ seed: 3 });
  startEncounter(escape);
  assert.equal(playUntilTerminal(escape, (game) =>
    findActionChoice(game, "run")
      ? "run"
      : findActionChoice(game, "create-distance")
        ? "create-distance"
        : "shove-away").id, "player-escaped");

  const cleanWin = gameAtStart({ seed: 1 });
  cleanWin.player.setSkillValue("strength", 10);
  startEncounter(cleanWin);
  assert.equal(playUntilTerminal(cleanWin, (game) =>
    findActionChoice(game, "strike-holding-arm") ? "strike-holding-arm" : "strike-face").id,
  "mugger-incapacitated");

  const injuredLoss = gameAtStart({ seed: 12 });
  startEncounter(injuredLoss);
  assert.equal(playUntilTerminal(injuredLoss, (game) =>
    findActionChoice(game, "shove-away")
      ? "shove-away"
      : findActionChoice(game, "create-distance")
        ? "create-distance"
        : findActionChoice(game, "run")
          ? "run"
          : "cover-and-brace").id,
  "theft-completed-player-incapacitated");
});
