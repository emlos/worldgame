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
  chooseFirstAvailableAction,
  findActionChoice,
  gameAtStart,
  placePlayerAtAlley,
  startEncounter,
} from "./support/encounter.mjs";

const PASSIVE_RESPONSES = Object.freeze([
  "cover-and-brace",
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

function playUntilTerminal(game, choose) {
  for (let index = 0; index < 60 && game.currentStory.system.state.phase === "active"; index += 1) {
    const requested = choose(game);
    if (findActionChoice(game, requested)) chooseAction(game, requested);
    else chooseFirstAvailableAction(game, PASSIVE_RESPONSES);
  }
  assert.equal(game.currentStory.system.state.phase, "terminal");
  return game.currentStory.system.state.outcome;
}

function prepareControlledSearch(game) {
  const state = game.currentStory.system.state;
  state.relationships.range[0].value = "clinch";
  state.participants.player.support = "wall";
  state.relationships.holds.push({
    id: "test-search-pin",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "limb-pin",
    leverage: 80,
  });
  state.npcIntent = {
    actorId: "mugger",
    actionId: "search-money",
    parameters: { targetId: "player" },
  };
  return state;
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

test("taking money begins an interruptible getaway before theft completes", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  startEncounter(game);
  prepareControlledSearch(game);

  chooseAction(game, "cover-and-brace");

  let state = game.currentStory.system.state;
  assert.equal(game.player.money, 30);
  assert.equal(state.phase, "active");
  assert.equal(state.outcome, null);
  assert.equal(state.objective.stage, "disengage");
  assert.equal(state.objective.searched, true);
  assert.equal(state.objective.lootAmount, 20);
  assert.equal(state.npcIntent.actionId, "create-distance");
  assert.ok(state.relationships.holds.length > 0);
  assert.ok(state.lastEvents.some(({ type }) => type === "theft.taken"));
  assert.match(JSON.stringify(buildScene(game).content), /trying to escape/i);

  chooseAction(game, "cover-and-brace");
  state = game.currentStory.system.state;
  assert.equal(state.phase, "active");
  assert.equal(state.relationships.range[0].value, "reach");
  assert.deepEqual(state.relationships.holds, []);
  assert.equal(state.npcIntent.actionId, "flee");

  chooseAction(game, "cover-and-brace");
  state = game.currentStory.system.state;
  assert.deepEqual(state.outcome, {
    id: "theft-completed-player-conscious",
    moneyLost: 20,
  });
  assert.equal(game.player.money, 30);
  assert.notEqual(state.relationships.range[0].value, "clinch");
  assert.deepEqual(state.relationships.holds, []);
  assert.ok(state.lastEvents.some(({ type }) => type === "theft.completed"));
});

test("incapacitating the mugger during the getaway recovers the stolen money", () => {
  const game = gameAtStart({ seed: 2, money: 50 });
  game.player.setSkillValue("strength", 10);
  startEncounter(game);
  prepareControlledSearch(game);
  chooseAction(game, "cover-and-brace");

  const actor = game.currentStory.actors.mugger;
  const painThreshold = Math.min(
    95,
    78 + actor.stats.resolve * 1.2 + actor.stats.endurance * 0.7,
  );
  actor.body.parts.find(({ id }) => id === "face").pain = painThreshold - 1;

  chooseAction(game, "strike-face");

  const state = game.currentStory.system.state;
  assert.deepEqual(state.outcome, {
    id: "mugger-incapacitated",
    moneyLost: 0,
  });
  assert.equal(game.player.money, 50);
  assert.equal(state.objective.lootAmount, 0);
  assert.ok(state.lastEvents.some(
    ({ type, amount }) => type === "theft.recovered" && amount === 20,
  ));
});

test("an already-incapacitated player receives the mugging consequence on entry", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  game.player.body.getPart("abdomen").pain = 90;

  const state = startEncounter(game);

  assert.deepEqual(state.outcome, {
    id: "theft-completed-player-incapacitated",
    moneyLost: 20,
  });
  assert.equal(state.phase, "terminal");
  assert.equal(state.npcIntent, null);
  assert.equal(state.objective.stage, "complete");
  assert.equal(game.player.money, 30);
  assert.ok(state.lastEvents.some(
    ({ type, reason }) => type === "participant.unable-to-act"
      && reason === "already-incapacitated",
  ));
  assert.ok(state.lastEvents.some(({ type }) => type === "theft.completed"));
  assert.ok(state.lastEvents.some(
    ({ type, actorId }) => type === "escape.completed" && actorId === "mugger",
  ));
  assert.deepEqual(buildScene(game).sections[0].choices.map(({ id }) => id), [
    "encounter-action:finish",
  ]);
  assert.match(JSON.stringify(buildScene(game).content), /unable to resist/i);
});

test("a physically helpless but conscious player cannot create an actionless encounter", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  for (const partId of ["hand_l", "hand_r", "foot_l", "foot_r"]) {
    const part = game.player.body.getPart(partId);
    part.health = 0;
    part.pain = 0;
  }
  assert.equal(game.player.isIncapacitated(), false);

  const state = startEncounter(game);

  assert.deepEqual(state.outcome, {
    id: "theft-completed-player-incapacitated",
    moneyLost: 20,
  });
  assert.equal(game.player.money, 30);
  assert.ok(state.lastEvents.some(
    ({ type, reason }) => type === "participant.unable-to-act"
      && reason === "no-legal-response",
  ));
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
  const escape = gameAtStart({ seed: 10 });
  startEncounter(escape);
  assert.equal(playUntilTerminal(escape, (game) =>
    findActionChoice(game, "run")
      ? "run"
      : findActionChoice(game, "create-distance")
        ? "create-distance"
        : findActionChoice(game, "wrench-free")
          ? "wrench-free"
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
          : findActionChoice(game, "wrench-free")
            ? "wrench-free"
            : "cover-and-brace").id,
  "theft-completed-player-incapacitated");
});
