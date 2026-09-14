import test from "node:test";
import assert from "node:assert/strict";

import { getAiCommitmentDiagnostics } from "../src/features/encounter/ai.js";
import { getDisengagementHoldState } from "../src/features/encounter/affordances.js";
import { getAvailableActionInstances } from "../src/features/encounter/availability.js";
import { getEncounterAction } from "../src/features/encounter/actions/index.js";
import { applyImpact, contest } from "../src/features/encounter/actions/helpers.js";
import {
  calculatePainTolerance,
  createCombatContext,
  getStat,
} from "../src/features/encounter/combatants.js";
import {
  calculateExertionCost,
  calculatePhysicalReadiness,
  getActionEffortStatus,
  recoverExertion,
} from "../src/features/encounter/effort.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

function balancedContext({ fitness = 5, playerStats = {}, muggerStats = {} } = {}) {
  const game = gameAtStart({ seed: 13 });
  const state = startEncounter(game);
  for (const [name, value] of Object.entries({
    strength: 5,
    endurance: 5,
    resolve: 5,
    fitness,
    ...playerStats,
  })) {
    game.player.setSkillValue(name, value);
  }
  Object.assign(game.currentStory.actors.mugger.stats, {
    strength: 5,
    endurance: 5,
    resolve: 5,
    fitness: 5,
    ...muggerStats,
  });
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  return { game, state, context };
}

function runtime() {
  return {
    events: [],
    guarded: new Set(),
    evading: new Set(),
    outcome: null,
  };
}

function playerActionChance(actionId, options = {}) {
  const setup = balancedContext(options);
  options.configure?.(setup);
  const instance = getAvailableActionInstances(setup.context, "player")
    .find((candidate) => candidate.actionId === actionId);
  assert.ok(instance, `expected player action '${actionId}'`);
  const result = runtime();
  getEncounterAction(actionId).resolve(setup.context, instance, result);
  const event = result.events.find(
    ({ type, actorId, actionId: rolledActionId }) =>
      type === "chance.rolled"
      && actorId === "player"
      && rolledActionId === actionId,
  );
  assert.ok(event, `expected '${actionId}' to roll a contest`);
  return event.chance;
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

test("strength affects force and damage but not ordinary strike accuracy", () => {
  const weakShove = playerActionChance("shove-away", { playerStats: { strength: 0 } });
  const strongShove = playerActionChance("shove-away", { playerStats: { strength: 10 } });
  assert.ok(strongShove > weakShove);

  const weakStrike = playerActionChance("strike-face", { playerStats: { strength: 0 } });
  const strongStrike = playerActionChance("strike-face", { playerStats: { strength: 10 } });
  assert.equal(strongStrike, weakStrike);

  const impactDamage = (strength) => {
    const { context } = balancedContext({ playerStats: { strength } });
    return applyImpact(context, {
      actionId: "strength-damage-test",
      actorId: "player",
      targetId: "mugger",
      parameters: { sourcePartId: "hand_l" },
    }, runtime(), {
      partId: "abdomen",
      baseDamage: 10,
      strengthScale: 0.7,
    });
  };
  assert.ok(impactDamage(10) > impactDamage(0));
});

test("fitness governs grabbing and slipping while enemy fitness remains independent", () => {
  const clumsyGrab = playerActionChance("grab-arm", { playerStats: { fitness: 0 } });
  const agileGrab = playerActionChance("grab-arm", { playerStats: { fitness: 10 } });
  assert.ok(agileGrab > clumsyGrab);

  const configureHeldPlayer = ({ state }) => {
    state.relationships.range[0].value = "clinch";
    state.relationships.holds = [{
      id: "fitness-slip-test",
      controllerId: "mugger",
      sourcePartId: "hand_l",
      targetId: "player",
      targetPartId: "lower_arm_l",
      kind: "wrist-grip",
      leverage: 24,
    }];
  };
  const clumsySlip = playerActionChance("wrench-free", {
    playerStats: { fitness: 0 },
    configure: configureHeldPlayer,
  });
  const agileSlip = playerActionChance("wrench-free", {
    playerStats: { fitness: 10 },
    configure: configureHeldPlayer,
  });
  assert.ok(agileSlip > clumsySlip);

  const { context } = balancedContext({
    muggerStats: { strength: 0, endurance: 10, fitness: 7 },
  });
  assert.equal(getStat(context, "mugger", "fitness"), 7);
});

test("endurance alone governs repeated effort and recovery", () => {
  const snapshot = (playerStats) => {
    const { state, context } = balancedContext({
      playerStats: { endurance: 0, fitness: 0, ...playerStats },
    });
    const cost = calculateExertionCost(context, "player", 10);
    const readiness = calculatePhysicalReadiness(context, "player");
    state.participants.player.exertion = 100;
    const recovered = recoverExertion(context, "player");
    return { cost, readiness, recovered };
  };
  const baseline = snapshot({});
  const fit = snapshot({ fitness: 10 });
  const enduring = snapshot({ endurance: 10 });

  assert.deepEqual(fit, baseline);
  assert.ok(enduring.cost < baseline.cost);
  assert.ok(enduring.readiness > baseline.readiness);
  assert.ok(enduring.recovered > baseline.recovered);
});

test("resolve alone governs pain tolerance and desperate effort", () => {
  const desperation = (resolve) => {
    const { state, context } = balancedContext({ playerStats: { resolve } });
    state.participants.player.exertion = 80;
    return getActionEffortStatus(context, {
      actionId: "headbutt",
      actorId: "player",
      targetId: "mugger",
      parameters: { sourcePartId: "head" },
    }).desperateChance;
  };

  assert.equal(calculatePainTolerance(0), 78);
  assert.equal(calculatePainTolerance(10), 95);
  assert.ok(desperation(10) > desperation(0));
});

test("perception remains outside physical combat calculations", () => {
  const unawareStrike = playerActionChance("strike-face", {
    playerStats: { perception: 0 },
  });
  const perceptiveStrike = playerActionChance("strike-face", {
    playerStats: { perception: 10 },
  });
  assert.equal(perceptiveStrike, unawareStrike);

  const conditioning = (perception) => {
    const { context } = balancedContext({ playerStats: { perception } });
    return calculateExertionCost(context, "player", 10);
  };
  assert.equal(conditioning(10), conditioning(0));
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
