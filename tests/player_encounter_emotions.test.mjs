import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { calculateContestChance } from "../src/features/encounter/actions/helpers.js";
import { getEncounterAction } from "../src/features/encounter/actions/index.js";
import { getAvailableActionInstances } from "../src/features/encounter/availability.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  applyCombatEmotionsForExchange,
  settleCombatEmotions,
} from "../src/features/encounter/emotions.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../src/story/wg/runtime/storyRuntime.js";
import {
  chooseAction,
  gameAtStart,
  placePlayerAtAlley,
  startEncounter,
} from "./support/encounter.mjs";

function practiceEncounter() {
  const game = gameAtStart();
  placePlayerAtAlley(game);
  game.teleportNPC("jackie", "player");
  enterWGScene(game, "encounter.alley-jackie-theft-practice");
  resolveActiveWGStory(game);
  return game;
}

function contextFor(game) {
  return createCombatContext({
    game,
    state: game.currentStory.system.state,
    instanceKey: game.currentStory.instanceKey,
  });
}

function actionChance(context, actionId, actorId = "player", targetId = "mugger") {
  return calculateContestChance(
    context,
    { actionId, actorId, targetId, parameters: {} },
    { guarded: new Set(), evading: new Set() },
    { baseChance: 0.58 },
  );
}

function helpRoll(game) {
  return game.currentStory.system.state.lastEvents.find(({ type, purpose }) =>
    type === "chance.rolled" && purpose === "heard-by-bystander");
}

test("a real mugging raises fear and anger more than Jackie's practice", () => {
  const hostile = gameAtStart();
  const practice = practiceEncounter();
  const hostileState = startEncounter(hostile);
  const practiceState = practice.currentStory.system.state;

  assert.equal(hostileState.phase, "active");
  assert.equal(practiceState.phase, "active");
  assert.ok(hostile.player.getStatValue("fear") > practice.player.getStatValue("fear"));
  assert.ok(hostile.player.getStatValue("anger") > practice.player.getStatValue("anger"));
  assert.ok(practice.player.getStatValue("fear") > 0);
  assert.ok(practice.player.getStatValue("anger") > 0);
});

test("being hit builds fear and anger, while a repeated hold does not farm fear", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  const startingFear = game.player.getStatValue("fear");
  const startingAnger = game.player.getStatValue("anger");

  applyCombatEmotionsForExchange(game, state, [{
    type: "impact.landed",
    actorId: "mugger",
    targetId: "player",
    partId: "chest",
    damage: 5,
  }]);
  assert.ok(game.player.getStatValue("fear") > startingFear);
  assert.ok(game.player.getStatValue("anger") > startingAnger);

  const hold = { type: "hold.created", controllerId: "mugger", targetId: "player" };
  const beforeHold = game.player.getStatValue("fear");
  applyCombatEmotionsForExchange(game, state, [hold]);
  const afterFirstHold = game.player.getStatValue("fear");
  applyCombatEmotionsForExchange(game, state, [hold]);
  assert.ok(afterFirstHold > beforeHold);
  assert.equal(game.player.getStatValue("fear"), afterFirstHold);
});

test("getting to safety relieves encounter fear without erasing earlier fear", () => {
  const game = gameAtStart();
  game.player.setStatValue("fear", 25);
  game.player.setStatValue("anger", 15);
  const state = startEncounter(game);
  applyCombatEmotionsForExchange(game, state, [{
    type: "impact.landed",
    actorId: "mugger",
    targetId: "player",
    partId: "chest",
    damage: 5,
  }]);
  const peakFear = game.player.getStatValue("fear");
  const peakAnger = game.player.getStatValue("anger");
  state.phase = "terminal";
  state.npcIntent = null;
  state.outcome = { id: "player-escaped", moneyLost: 0 };

  assert.equal(settleCombatEmotions(game, state), true);
  assert.ok(game.player.getStatValue("fear") < peakFear);
  assert.ok(game.player.getStatValue("fear") >= 25);
  assert.equal(game.player.getStatValue("anger"), peakAnger);
  const settledFear = game.player.getStatValue("fear");
  assert.equal(settleCombatEmotions(game, state), false);
  assert.equal(game.player.getStatValue("fear"), settledFear);
});

test("fear favors escape timing, anger favors force, and both impair precision", () => {
  const game = gameAtStart();
  startEncounter(game);
  const context = contextFor(game);
  game.player.setStatValue("fear", 0);
  game.player.setStatValue("anger", 0);
  const baseEscape = actionChance(context, "create-distance");
  const baseForce = actionChance(context, "drive-body");
  const basePrecision = actionChance(context, "strike-face");

  game.player.setStatValue("fear", 80);
  assert.ok(actionChance(context, "create-distance") > baseEscape);
  assert.ok(actionChance(context, "strike-face") < basePrecision);

  game.player.setStatValue("fear", 0);
  game.player.setStatValue("anger", 80);
  assert.ok(actionChance(context, "drive-body") > baseForce);
  assert.ok(actionChance(context, "create-distance") < baseEscape);
  assert.ok(actionChance(context, "strike-face") < basePrecision);

  game.player.setStatValue("fear", 80);
  const combinedPenalty = basePrecision - actionChance(context, "strike-face");
  assert.ok(combinedPenalty > 0);
  assert.ok(combinedPenalty <= 0.100001);
  game.player.setStatValue("fear", 100);
  game.player.setStatValue("anger", 100);
  assert.equal(basePrecision - actionChance(context, "strike-face"), combinedPenalty);

  const npcChance = actionChance(context, "strike-face", "mugger", "player");
  game.player.setStatValue("fear", 0);
  game.player.setStatValue("anger", 0);
  assert.equal(actionChance(context, "strike-face", "mugger", "player"), npcChance);
});

test("the displayed expert odds respond to anger in the same direction as the roll", () => {
  const game = gameAtStart({ combatSkill: 700 });
  startEncounter(game);
  game.player.setStatValue("fear", 0);
  game.player.setStatValue("anger", 0);
  const baseline = buildScene(game).sections.flatMap(({ choices }) => choices)
    .find(({ action }) => action.command?.actionId === "strike-face")?.label;
  assert.match(baseline, /\d+% estimated chance/);

  game.player.setStatValue("anger", 80);
  const angry = buildScene(game).sections.flatMap(({ choices }) => choices)
    .find(({ action }) => action.command?.actionId === "strike-face")?.label;
  assert.match(angry, /\d+% estimated chance/);
  const percentage = (label) => Number(label.match(/(\d+)% estimated chance/)[1]);
  assert.ok(percentage(angry) < percentage(baseline));
});

test("fear helps a contested breakaway and anger makes it less reliable", () => {
  const wrenchChance = ({ fear = 0, anger = 0 } = {}) => {
    const game = gameAtStart({ seed: 13 });
    const state = startEncounter(game);
    game.player.setStatValue("fear", fear);
    game.player.setStatValue("anger", anger);
    state.relationships.range[0].value = "clinch";
    state.relationships.holds = [{
      id: "emotion-wrist-grip",
      controllerId: "mugger",
      sourcePartId: "hand_l",
      targetId: "player",
      targetPartId: "lower_arm_l",
      kind: "wrist-grip",
      leverage: 24,
    }];
    const context = contextFor(game);
    const instance = getAvailableActionInstances(context, "player")
      .find(({ actionId }) => actionId === "wrench-free");
    assert.ok(instance);
    const runtime = { events: [], guarded: new Set(), evading: new Set(), outcome: null };
    getEncounterAction("wrench-free").resolve(context, instance, runtime);
    const roll = runtime.events.find(({ type, purpose }) =>
      type === "chance.rolled" && purpose.startsWith("wrench:"));
    assert.ok(roll);
    return roll.chance;
  };

  const calm = wrenchChance();
  assert.ok(wrenchChance({ fear: 80 }) > calm);
  assert.ok(wrenchChance({ anger: 80 }) < calm);
});

test("fear and anger do not change whether a scream is heard or make running a roll", () => {
  const calm = gameAtStart({ seed: 1 });
  const emotional = gameAtStart({ seed: 1 });
  startEncounter(calm);
  startEncounter(emotional);
  calm.player.setStatValue("fear", 0);
  calm.player.setStatValue("anger", 0);
  emotional.player.setStatValue("fear", 100);
  emotional.player.setStatValue("anger", 100);
  chooseAction(calm, "scream-for-help");
  chooseAction(emotional, "scream-for-help");
  assert.equal(helpRoll(emotional).chance, helpRoll(calm).chance);
  assert.equal(helpRoll(emotional).roll, helpRoll(calm).roll);

  const runGame = gameAtStart();
  const state = startEncounter(runGame);
  state.relationships.range[0].value = "far";
  runGame.player.setStatValue("fear", 100);
  runGame.player.setStatValue("anger", 100);
  const context = contextFor(runGame);
  const run = getAvailableActionInstances(context, "player")
    .find(({ actionId }) => actionId === "run");
  assert.ok(run);
  const runtime = { events: [], terminalFacts: [] };
  getEncounterAction("run").resolve(context, run, runtime);
  assert.ok(runtime.events.some(({ type }) => type === "escape.completed"));
  assert.ok(!runtime.events.some(({ type }) => type === "chance.rolled"));
});

test("high emotion cannot bypass the exhausted player's helpless response", () => {
  const game = gameAtStart({ seed: 1 });
  game.player.setStatValue("energy", 0.5);
  startEncounter(game);
  game.player.setStatValue("fear", 100);
  game.player.setStatValue("anger", 100);
  const actions = buildScene(game).sections.flatMap(({ choices }) => choices)
    .map(({ action }) => action.command?.actionId);
  assert.deepEqual(actions, ["too-tired-to-move"]);
});

test("active encounter emotion and its projected choices survive save and load", () => {
  const game = gameAtStart({ seed: 1, combatSkill: 700 });
  startEncounter(game);
  chooseAction(game, "scream-for-help");
  assert.equal(game.currentStory.system.state.phase, "active");
  const beforeState = structuredClone(game.currentStory.system.state);
  const beforeScene = buildScene(game);
  const beforeStats = ["fear", "anger"].map((id) => game.player.getStatValue(id));

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.deepEqual(restored.currentStory.system.state, beforeState);
  assert.deepEqual(["fear", "anger"].map((id) => restored.player.getStatValue(id)), beforeStats);
  assert.deepEqual(buildScene(restored), beforeScene);

  chooseAction(game, "scream-for-help");
  chooseAction(restored, "scream-for-help");
  assert.deepEqual(restored.currentStory.system.state, game.currentStory.system.state);
  assert.deepEqual(["fear", "anger"].map((id) => restored.player.getStatValue(id)),
    ["fear", "anger"].map((id) => game.player.getStatValue(id)));
});
