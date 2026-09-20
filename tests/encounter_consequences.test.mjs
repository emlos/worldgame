import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { ENCOUNTER_ACTIONS } from "../src/features/encounter/actions/index.js";
import { selectAiIntent } from "../src/features/encounter/ai.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  PLAYER_ACTION_HYGIENE_COST,
  applyEncounterHygiene,
  settleEncounterConsequences,
} from "../src/features/encounter/consequences.js";
import {
  applyCombatStressForExchange,
  createCombatStressState,
} from "../src/features/encounter/stress.js";
import {
  chooseAction,
  gameAtStart,
  startEncounter,
} from "./support/encounter.mjs";

test("every combat action has an explicit hygiene cost", () => {
  assert.deepEqual(
    Object.keys(PLAYER_ACTION_HYGIENE_COST).sort(),
    ENCOUNTER_ACTIONS.map(({ id }) => id).sort(),
  );
});

test("combat exchange time drains ordinary energy while screaming itself is clean", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);
  const scene = buildScene(game);
  const scream = scene.sections
    .flatMap(({ choices }) => choices)
    .find(({ action }) => action.command?.actionId === "scream-for-help");

  assert.equal(scream.energyFree, false);
  assert.equal(scream.showDuration, false);
  assert.equal(scream.label, "Scream for help");
  const beforeEnergy = game.player.getStatValue("energy");
  const beforeHygiene = game.player.getStatValue("hygiene");
  performChoice(game, { sceneId: scene.id, choiceId: scream.id });

  assert.equal(
    game.player.getStatValue("energy"),
    Math.round((beforeEnergy - scream.durationMinutes * 0.1) * 1_000_000) / 1_000_000,
  );
  assert.equal(game.player.getStatValue("hygiene"), beforeHygiene);
});

test("physical contact and being thrown down cost more hygiene than calling out", () => {
  const game = gameAtStart();
  const state = startEncounter(game);

  assert.equal(applyEncounterHygiene(game, state, "scream-for-help", []), 0);
  assert.equal(applyEncounterHygiene(game, state, "roll-toward", []), 0.25);
  assert.equal(applyEncounterHygiene(game, state, "scream-for-help", [{
    type: "pose.changed",
    actorId: "player",
    from: "standing",
    to: "prone",
  }]), 0.75);
  assert.equal(game.player.getStatValue("hygiene"), 99);
});

test("combat stress rises faster as pain accumulates and resolve softens every gain", () => {
  const game = gameAtStart();
  game.player.setSkillValue("resolve", 0);
  const state = startEncounter(game);
  assert.equal(game.player.getStatValue("stress"), 3.45);
  assert.equal(state.stress.maximumGain, 35);

  const chest = game.player.body.getPart("chest");
  chest.acutePain = 10;
  const beforeFirstHit = game.player.getStatValue("stress");
  applyCombatStressForExchange(game, state, []);
  const firstHitStress = game.player.getStatValue("stress") - beforeFirstHit;

  chest.acutePain = 20;
  const beforeSecondHit = game.player.getStatValue("stress");
  applyCombatStressForExchange(game, state, []);
  const secondHitStress = game.player.getStatValue("stress") - beforeSecondHit;
  assert.ok(secondHitStress > firstHitStress);

  const resolved = gameAtStart();
  resolved.player.setSkillValue("resolve", 10);
  const resolvedState = startEncounter(resolved);
  assert.equal(resolved.player.getStatValue("stress"), 1.95);
  assert.equal(resolvedState.stress.resolveMultiplier, 0.65);
});

test("combat control stress is charged only on the first matching loss of agency", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  const held = {
    type: "hold.created",
    controllerId: "mugger",
    targetId: "player",
  };

  const before = game.player.getStatValue("stress");
  applyCombatStressForExchange(game, state, [held]);
  const afterFirstHold = game.player.getStatValue("stress");
  applyCombatStressForExchange(game, state, [held]);
  assert.ok(Math.abs(afterFirstHold - before - 1.15) < 1e-9);
  assert.equal(game.player.getStatValue("stress"), afterFirstHold);

  applyCombatStressForExchange(game, state, [{
    type: "hold.pinned",
    controllerId: "mugger",
    targetId: "player",
  }]);
  assert.ok(Math.abs(game.player.getStatValue("stress") - afterFirstHold - 3.45) < 1e-9);
  assert.deepEqual(state.stress.markers, ["held", "pinned"]);
});

test("combat stress respects hostile and training encounter caps", () => {
  const hostileGame = gameAtStart();
  hostileGame.player.setSkillValue("resolve", 0);
  const hostileState = startEncounter(hostileGame);
  const hostileChest = hostileGame.player.body.getPart("chest");
  hostileChest.integrity = 0;
  hostileChest.acutePain = 100;
  applyCombatStressForExchange(hostileGame, hostileState, []);
  assert.equal(hostileState.stress.gained, 35);
  assert.equal(hostileGame.player.getStatValue("stress"), 35);

  const trainingGame = gameAtStart();
  trainingGame.player.setSkillValue("resolve", 0);
  const trainingState = startEncounter(trainingGame);
  trainingGame.player.setStatValue("stress", 0);
  trainingState.stress = createCombatStressState(trainingGame, 0.3);
  const trainingChest = trainingGame.player.body.getPart("chest");
  trainingChest.integrity = 0;
  trainingChest.acutePain = 100;
  applyCombatStressForExchange(trainingGame, trainingState, []);
  assert.equal(trainingState.stress.gained, 10.5);
  assert.equal(trainingGame.player.getStatValue("stress"), 10.5);
});

test("successful outcomes refund only stress added by their encounter", () => {
  const game = gameAtStart();
  game.player.setStatValue("stress", 40);
  const state = startEncounter(game);
  state.phase = "terminal";
  state.npcIntent = null;
  state.outcome = { id: "player-escaped", moneyLost: 0 };

  settleEncounterConsequences(game, state, game.currentStory.instanceKey);

  assert.equal(game.player.getStatValue("stress"), 41.035);
  assert.equal(state.stress.gained, 3.45);
  assert.equal(state.stress.refunded, 2.415);
  assert.equal(state.stress.settled, true);
  assert.ok(game.player.getStatValue("stress") >= state.stress.startingStress);
});

test("losing an objective adds consequence stress without an outcome refund", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  const state = startEncounter(game);
  const openingStress = game.player.getStatValue("stress");

  chooseAction(game, "surrender-money");

  const terminal = game.currentStory.system.state;
  assert.equal(terminal.phase, "terminal");
  assert.equal(terminal.stress.settled, true);
  assert.equal(terminal.stress.refunded, 0);
  assert.ok(game.player.getStatValue("stress") > openingStress);
});

test("terminal exertion creates one proportional fatigue multiplier that decays in 30 minutes", () => {
  const game = gameAtStart({ seed: 1 });
  const state = startEncounter(game);
  const sourceInstanceKey = game.currentStory.instanceKey;
  state.participants.player.exertion = 100;
  chooseAction(game, "surrender-money");

  const terminal = game.currentStory.system.state;
  assert.equal(terminal.terminalConsequencesSettled, true);
  assert.deepEqual(game.featureState.encounter.postCombatFatigue, {
    sourceInstanceKey,
    multiplier: 3,
    remainingMinutes: 30,
  });
  const before = structuredClone(game.featureState.encounter);
  assert.equal(settleEncounterConsequences(game, terminal, sourceInstanceKey), false);
  assert.deepEqual(game.featureState.encounter, before);

  const saved = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.deepEqual(saved.featureState.encounter, before);
  const finishScene = buildScene(saved);
  const finish = finishScene.sections.flatMap(({ choices }) => choices)
    .find(({ id }) => id === "encounter-action:finish");
  performChoice(saved, { sceneId: finishScene.id, choiceId: finish.id });

  const energyBeforeRecovery = saved.player.getStatValue("energy");
  saved.advanceMinutes(15);
  assert.equal(saved.player.getStatValue("energy"), energyBeforeRecovery - 3.75);
  assert.deepEqual(saved.featureState.encounter.postCombatFatigue, {
    sourceInstanceKey,
    multiplier: 2,
    remainingMinutes: 15,
  });
  saved.advanceMinutes(15);
  assert.equal(saved.player.getStatValue("energy"), energyBeforeRecovery - 6);
  assert.equal(saved.featureState.encounter.postCombatFatigue, null);
});

test("energy exhaustion offers one helpless response and preserves the telegraphed intent", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  game.player.setStatValue("energy", 0.5);
  const opening = startEncounter(game);
  const telegraphedActionId = opening.npcIntent.actionId;
  const hygieneBefore = game.player.getStatValue("hygiene");
  const exhaustedScene = buildScene(game);
  const exhaustedChoices = exhaustedScene.sections.flatMap(({ choices }) => choices);

  assert.deepEqual(exhaustedChoices.map(({ label }) => label), ["You're too tired to move"]);
  assert.equal(exhaustedChoices[0].action.command.actionId, "too-tired-to-move");
  chooseAction(game, "too-tired-to-move");

  let state = game.currentStory.system.state;
  assert.ok(game.player.getStatValue("energy") < 1);
  assert.equal(game.player.money, 50);
  assert.equal(state.phase, "active");
  assert.equal(game.player.getStatValue("hygiene"), hygieneBefore - 0.03);
  assert.ok(state.lastEvents.some(({ type, reason }) =>
    type === "participant.unable-to-act" && reason === "energy-exhausted"));
  assert.ok(state.lastEvents.some(({ type, actorId, actionId }) =>
    type === "action.attempted" && actorId === "player" && actionId === "too-tired-to-move"));
  assert.ok(state.lastEvents.some(({ type, actorId, actionId }) =>
    type === "action.attempted" && actorId === "mugger" && actionId === telegraphedActionId));
  assert.ok(state.lastEvents.some(({ type, unopposed, success, chance }) =>
    type === "chance.rolled" && unopposed === true && success === true && chance === 1));
  assert.equal(state.relationships.holds.length, 1);
  assert.equal(game.interruptState.pending?.sceneId, "interrupt.exhaustion.hospital");

  for (let exchange = 0; state.phase === "active" && exchange < 30; exchange += 1) {
    chooseAction(game, "too-tired-to-move");
    state = game.currentStory.system.state;
  }
  assert.equal(state.phase, "terminal");
  assert.equal(state.outcome.id, "theft-completed-player-conscious");
  assert.equal(game.player.money, 30);
  assert.equal(state.terminalConsequencesSettled, true);
  assert.equal(game.interruptState.pending?.sceneId, "interrupt.exhaustion.hospital");

  const terminalScene = buildScene(game);
  const finish = terminalScene.sections.flatMap(({ choices }) => choices)
    .find(({ id }) => id === "encounter-action:finish");
  performChoice(game, { sceneId: terminalScene.id, choiceId: finish.id });
  assert.equal(game.currentStory?.id, "interrupt.exhaustion.hospital");
  assert.equal(game.interruptState.pending, null);
  assert.equal(game.interruptState.active?.sceneId, "interrupt.exhaustion.hospital");
});

test("an action that spends the last energy resolves before helplessness begins", () => {
  const game = gameAtStart({ seed: 1 });
  const opening = startEncounter(game);
  const telegraphedActionId = opening.npcIntent.actionId;
  game.player.setStatValue("energy", 1.001);

  chooseAction(game, "scream-for-help");

  const state = game.currentStory.system.state;
  assert.equal(state.phase, "active");
  assert.ok(game.player.getStatValue("energy") < 1);
  assert.ok(state.lastEvents.some(({ type, actorId, actionId }) =>
    type === "action.attempted" && actorId === "player" && actionId === "scream-for-help"));
  assert.ok(state.lastEvents.some(({ type, actorId, actionId }) =>
    type === "action.attempted" && actorId === "mugger" && actionId === telegraphedActionId));
  assert.ok(!state.lastEvents.some(({ type, reason }) =>
    type === "participant.unable-to-act" && reason === "energy-exhausted"));
  assert.deepEqual(
    buildScene(game).sections.flatMap(({ choices }) => choices).map(({ label }) => label),
    ["You're too tired to move"],
  );
});

test("exhaustion narration does not invent a search when the mugger flees", () => {
  const game = gameAtStart({ seed: 117, money: 0 });
  game.player.setStatValue("energy", 0.5);
  const state = startEncounter(game);
  state.elapsedSeconds = 100;
  state.npcIntent = selectAiIntent(createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  }));
  assert.equal(state.npcIntent.actionId, "flee");

  chooseAction(game, "too-tired-to-move");

  const content = JSON.stringify(buildScene(game).content);
  assert.equal(game.currentStory.system.state.outcome.id, "mugger-fled");
  assert.match(content, /unable to respond/i);
  assert.doesNotMatch(content, /resist the search/i);
});
