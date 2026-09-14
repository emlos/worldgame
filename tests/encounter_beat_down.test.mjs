import test from "node:test";
import assert from "node:assert/strict";

import { InjuryCondition } from "../src/characters/core/body.js";
import { getEncounterAction } from "../src/features/encounter/actions/index.js";
import { getAvailableActionInstances } from "../src/features/encounter/availability.js";
import {
  getAiCommitment,
  selectAiIntent,
} from "../src/features/encounter/ai.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  BEAT_DOWN_OBJECTIVE_ID,
  BEAT_DOWN_OUTCOME,
} from "../src/features/encounter/objectives/beatDown.js";
import { FIGHT_SCENARIO } from "../src/features/encounter/scenarios/fight.js";
import { validateEncounterState } from "../src/features/encounter/state.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

function preparedGame(options = {}) {
  const game = gameAtStart(options);
  startEncounter(game);
  return game;
}

function createBeatDown(game, opponentId = "attacker") {
  return FIGHT_SCENARIO.create({
    game,
    instanceKey: game.currentStory.instanceKey,
    config: {
      scenario: "fight",
      opponent: { id: opponentId, actor: "mugger" },
      goal: { id: BEAT_DOWN_OBJECTIVE_ID },
    },
  });
}

test("beat-down exposes deliberate limb attacks but no theft or attacker escape actions", () => {
  const game = preparedGame({ seed: 44 });
  const state = createBeatDown(game);
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const attackerActionIds = getAvailableActionInstances(context, "attacker")
    .map(({ actionId }) => actionId);
  const playerActionIds = getAvailableActionInstances(context, "player")
    .map(({ actionId }) => actionId);

  assert.doesNotThrow(() => validateEncounterState(state));
  assert.equal(state.objective.id, BEAT_DOWN_OBJECTIVE_ID);
  assert.ok(attackerActionIds.includes("attack-limb"));
  assert.equal(attackerActionIds.includes("flee"), false);
  assert.equal(playerActionIds.includes("surrender-money"), false);
  assert.equal(playerActionIds.includes("demand-money-back"), false);
  assert.equal(playerActionIds.includes("search-money"), false);
  assert.ok(getEncounterAction(state.npcIntent.actionId).tags.includes("attack"));
});

test("beat-down attacker remains fully committed despite injury and hard pacing limits", () => {
  const game = preparedGame({ seed: 45 });
  const state = createBeatDown(game);
  game.currentStory.actors.mugger.body.parts
    .find(({ id }) => id === "abdomen").pain = 50;
  state.elapsedSeconds = 100;
  state.objective.lastProgressSecond = 0;
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  assert.equal(getAiCommitment(context), 100);
  const intent = selectAiIntent(context);
  assert.notEqual(intent.actionId, "flee");
  assert.ok(getEncounterAction(intent.actionId).tags.includes("attack"));
});

test("reaching the target's maximum pain tolerance completes the beat-down", () => {
  const game = preparedGame();
  game.player.body.getPart("abdomen").pain = 100;
  const state = createBeatDown(game);

  assert.equal(state.phase, "terminal");
  assert.equal(state.objective.stage, "complete");
  assert.equal(state.outcome.id, BEAT_DOWN_OUTCOME.targetBeatenDown);
  assert.equal(state.outcome.cause, "pain-threshold");
  assert.ok(state.outcome.pain >= state.outcome.painThreshold);
  assert.doesNotThrow(() => validateEncounterState(state));
});

test("breaking every gross limb chain records the limb-incapacitation victory", () => {
  const game = preparedGame();
  for (const partId of ["lower_arm_l", "lower_arm_r", "knee_l", "knee_r"]) {
    const part = game.player.body.getPart(partId);
    part.health = 0;
    part.pain = 0;
    part.conditions.add(InjuryCondition.BROKEN);
  }
  const state = createBeatDown(game);

  assert.equal(state.phase, "terminal");
  assert.equal(state.outcome.id, BEAT_DOWN_OUTCOME.targetBeatenDown);
  assert.equal(state.outcome.cause, "broken-limbs");
  assert.equal(state.outcome.pain, 0);
  assert.doesNotThrow(() => validateEncounterState(state));
});
