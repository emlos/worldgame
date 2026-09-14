import test from "node:test";
import assert from "node:assert/strict";

import { getAiCommitmentDiagnostics } from "../src/features/encounter/ai.js";
import { getDisengagementHoldState } from "../src/features/encounter/affordances.js";
import { contest } from "../src/features/encounter/actions/helpers.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

function balancedContext({ fitness = 5 } = {}) {
  const game = gameAtStart({ seed: 13 });
  const state = startEncounter(game);
  for (const [name, value] of Object.entries({
    strength: 5,
    endurance: 5,
    resolve: 5,
    fitness,
  })) {
    game.player.setSkillValue(name, value);
  }
  Object.assign(game.currentStory.actors.mugger.stats, {
    strength: 5,
    endurance: 5,
    resolve: 5,
  });
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  return { game, state, context };
}

function contestChance({ fitness = 5, guarded = false, evading = false, defense = "control" }) {
  const { context } = balancedContext({ fitness });
  const runtime = {
    events: [],
    guarded: new Set(guarded ? ["player"] : []),
    evading: new Set(evading ? ["player"] : []),
    outcome: null,
  };
  contest(context, {
    actionId: "balance-test",
    actorId: "mugger",
    targetId: "player",
    parameters: {},
  }, runtime, { baseChance: 0.5, defense });
  return runtime.events.at(-1).chance;
}

test("bracing protects against impacts but concedes control", () => {
  const baseline = contestChance({ defense: "neutral" });
  const guardedImpact = contestChance({ guarded: true, defense: "impact" });
  const guardedControl = contestChance({ guarded: true, defense: "control" });

  assert.ok(Math.abs(baseline - guardedImpact - 0.18) < 0.00001);
  assert.ok(Math.abs(guardedControl - baseline - 0.06) < 0.00001);
});

test("evasion scales with fitness instead of granting a flat large defense", () => {
  const untrained = contestChance({ fitness: 0, evading: true, defense: "control" });
  const trained = contestChance({ fitness: 10, evading: true, defense: "control" });

  assert.ok(Math.abs(contestChance({ fitness: 0, defense: "control" }) - untrained - 0.08)
    < 0.00001);
  assert.ok(Math.abs(untrained - trained - 0.14) < 0.00001);
});

test("ordinary holds block free disengagement while a slipping grip remains contestable", () => {
  const { state, context } = balancedContext();
  state.relationships.range[0].value = "clinch";
  state.relationships.holds.push({
    id: "hold-balance-test",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 50,
  });

  assert.equal(getDisengagementHoldState(context, "player"), "blocked");
  state.relationships.holds[0].leverage = 24;
  assert.equal(getDisengagementHoldState(context, "player"), "contested");
  state.relationships.holds[0].leverage = 15;
  assert.equal(getDisengagementHoldState(context, "player"), "free");
});

test("commitment time pressure measures stalled time since objective progress", () => {
  const { state, context } = balancedContext();
  state.elapsedSeconds = 40;
  const stalled = getAiCommitmentDiagnostics(context);
  state.objective.lastProgressSecond = 40;
  const justProgressed = getAiCommitmentDiagnostics(context);

  assert.ok(justProgressed.value > stalled.value);
  assert.ok(Math.abs(justProgressed.components.elapsed) === 0);
  assert.ok(stalled.components.elapsed < 0);
});
