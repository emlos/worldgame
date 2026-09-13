import test from "node:test";
import assert from "node:assert/strict";

import {
  EXHAUSTED_RETREAT_SECONDS,
  PROLONGED_ENCOUNTER_RETREAT_SECONDS,
  RETREAT_COMMITMENT_THRESHOLD,
  getNpcDecisionDiagnostics,
  getMuggerCommitment,
  scoreNpcActions,
  selectNpcIntent,
} from "../src/features/encounter/ai.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

test("NPC intent is stored and pure re-selection is deterministic", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  assert.deepEqual(selectNpcIntent(context), selectNpcIntent(context));
  assert.deepEqual(state.npcIntent, selectNpcIntent(context));
});

test("low commitment gives retreat hard priority", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.elapsedSeconds = 100;
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  assert.ok(getMuggerCommitment(context) <= RETREAT_COMMITMENT_THRESHOLD);
  assert.equal(selectNpcIntent(context).actionId, "flee");
});

test("extreme exertion and hard encounter pacing force a legal disengagement path", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.participants.mugger.commitmentBase = 100;
  state.participants.mugger.exertion = 100;
  state.elapsedSeconds = EXHAUSTED_RETREAT_SECONDS;
  state.objective.lastProgressSecond = state.elapsedSeconds;
  let context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  assert.ok(getMuggerCommitment(context) <= RETREAT_COMMITMENT_THRESHOLD);
  assert.equal(selectNpcIntent(context).actionId, "flee");

  state.participants.mugger.exertion = 0;
  state.elapsedSeconds = PROLONGED_ENCOUNTER_RETREAT_SECONDS;
  state.objective.lastProgressSecond = state.elapsedSeconds;
  context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  assert.ok(getMuggerCommitment(context) <= RETREAT_COMMITMENT_THRESHOLD);
  assert.equal(selectNpcIntent(context).actionId, "flee");
});

test("utility diagnostics explain the stored decision and penalize repetition", () => {
  const game = gameAtStart({ seed: 1 });
  const state = startEncounter(game);
  const context = createCombatContext({ game, state, instanceKey: game.currentStory.instanceKey });
  const decision = getNpcDecisionDiagnostics(context);

  assert.equal(decision.selected.instance.actionId, state.npcIntent.actionId);
  assert.ok(decision.candidates.every(({ score, breakdown }) =>
    Number.isFinite(score) && Number.isFinite(breakdown.variation)));

  const repeatedState = structuredClone(state);
  repeatedState.participants.mugger.actionHistory.push("grab-arm");
  const repeatedContext = createCombatContext({
    game,
    state: repeatedState,
    instanceKey: game.currentStory.instanceKey,
  });
  const initialGrab = scoreNpcActions(context).find(({ instance }) => instance.actionId === "grab-arm");
  const repeatedGrab = scoreNpcActions(repeatedContext).find(({ instance }) => instance.actionId === "grab-arm");
  assert.ok(repeatedGrab.score < initialGrab.score);
  assert.ok(repeatedGrab.breakdown.repetition < initialGrab.breakdown.repetition);
});

test("personality weights produce distinct scores without changing seeded repeatability", () => {
  const game = gameAtStart({ seed: 8 });
  const state = startEncounter(game);
  const scoreFor = (personalityId) => {
    const candidateState = structuredClone(state);
    candidateState.participants.mugger.personalityId = personalityId;
    const context = createCombatContext({ game, state: candidateState, instanceKey: game.currentStory.instanceKey });
    return scoreNpcActions(context).map(({ instance, score }) => [instance.actionId, score]);
  };
  assert.deepEqual(scoreFor("forceful"), scoreFor("forceful"));
  assert.notDeepEqual(scoreFor("forceful"), scoreFor("skittish"));
});
