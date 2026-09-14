import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { ENCOUNTER_ACTIONS } from "../src/features/encounter/actions/index.js";
import {
  PLAYER_ACTION_HYGIENE_COST,
  applyEncounterHygiene,
  settleEncounterConsequences,
} from "../src/features/encounter/consequences.js";
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

test("running out of displayed energy lets the attacker complete the goal unopposed", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  startEncounter(game);
  game.player.setStatValue("energy", 0.001);
  const hygieneBefore = game.player.getStatValue("hygiene");

  chooseAction(game, "scream-for-help");

  const state = game.currentStory.system.state;
  assert.equal(game.player.getStatValue("energy"), 0);
  assert.equal(game.player.money, 30);
  assert.equal(state.phase, "terminal");
  assert.equal(state.outcome.id, "theft-completed-player-incapacitated");
  assert.equal(state.terminalConsequencesSettled, true);
  assert.equal(game.player.getStatValue("hygiene"), hygieneBefore);
  assert.ok(state.lastEvents.some(({ type, reason }) =>
    type === "participant.unable-to-act" && reason === "energy-exhausted"));
  assert.ok(!state.lastEvents.some(({ type, actorId }) =>
    type === "action.attempted" && actorId === "player"));
  assert.match(JSON.stringify(buildScene(game).content), /energy gives out/i);
});
