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
  BEAT_DOWN_OBJECTIVE,
  BEAT_DOWN_OBJECTIVE_ID,
  BEAT_DOWN_OUTCOME,
} from "../src/features/encounter/objectives/beatDown.js";
import { FIGHT_SCENARIO } from "../src/features/encounter/scenarios/fight.js";
import { resolveEncounterExchange } from "../src/features/encounter/resolution.js";
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
    .find(({ id }) => id === "abdomen").acutePain = 50;
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

test("reaching maximum pain forces one helpless exchange before the beat-down completes", () => {
  const game = preparedGame();
  game.player.body.getPart("abdomen").acutePain = 100;
  const state = createBeatDown(game);
  const telegraphedActionId = state.npcIntent.actionId;
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const playerActions = getAvailableActionInstances(context, "player");

  assert.equal(state.phase, "active");
  assert.deepEqual(playerActions.map(({ actionId }) => actionId), ["writhe-in-pain"]);

  const next = resolveEncounterExchange({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
    playerAction: playerActions[0],
  });

  assert.equal(next.phase, "terminal");
  assert.equal(next.objective.stage, "complete");
  assert.equal(next.outcome.id, BEAT_DOWN_OUTCOME.targetBeatenDown);
  assert.equal(next.outcome.cause, "pain-threshold");
  assert.ok(next.outcome.pain >= next.outcome.painThreshold);
  assert.ok(next.lastEvents.some(({ type, actorId, actionId }) =>
    type === "action.attempted" && actorId === "attacker" && actionId === telegraphedActionId));
  assert.ok(next.lastEvents.some(({ type, reason }) =>
    type === "participant.unable-to-act" && reason === "pain-overwhelmed"));
  assert.doesNotThrow(() => validateEncounterState(next));
});

test("zero-integrity bruised limbs use generic incapacitation without a break state", () => {
  const game = preparedGame();
  for (const partId of ["lower_arm_l", "lower_arm_r", "knee_l", "knee_r"]) {
    const part = game.player.body.getPart(partId);
    part.integrity = 0;
    part.acutePain = 0;
    part.conditions.add(InjuryCondition.BRUISED);
  }
  const state = createBeatDown(game);

  assert.equal(state.phase, "terminal");
  assert.equal(state.outcome.id, BEAT_DOWN_OUTCOME.targetBeatenDown);
  assert.equal(state.outcome.cause, "already-incapacitated");
  assert.ok(state.outcome.pain > 0, "destroyed limbs retain an injury pain floor");
  assert.ok(game.player.body.allParts().every((part) =>
    [...part.conditions].every((condition) => condition === InjuryCondition.BRUISED)));
  assert.doesNotThrow(() => validateEncounterState(state));
});

test("every beat-down outcome supplies dedicated terminal content", () => {
  const game = preparedGame({ seed: 46 });
  const state = createBeatDown(game);
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  for (const id of Object.values(BEAT_DOWN_OUTCOME)) {
    state.outcome = id === BEAT_DOWN_OUTCOME.targetBeatenDown
      ? { id, cause: "pain-threshold", pain: 80, painThreshold: 78 }
      : { id };
    const content = BEAT_DOWN_OBJECTIVE.renderTerminal(context);
    assert.equal(content.length, 1, id);
    assert.equal(content[0].type, "paragraph", id);
    assert.ok(content[0].text.length > 0, id);
    assert.doesNotMatch(content[0].text, /^The fight is over\.$/, id);
  }
});
