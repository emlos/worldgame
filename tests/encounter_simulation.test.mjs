import test from "node:test";
import assert from "node:assert/strict";

import {
  ENCOUNTER_SIMULATION_SCENARIOS,
  PLAYER_POLICIES,
  runEncounterStateSpaceMatrix,
  runEncounterSimulation,
  runStatDifferenceMatrix,
} from "../tools/encounter/simulationHarness.mjs";
import { ENCOUNTER_ACTIONS } from "../src/features/encounter/actions/index.js";

test("simulation policies contain every current player action and no removed aliases", () => {
  const playerActionIds = ENCOUNTER_ACTIONS
    .filter(({ usableBy }) => usableBy === "any" || usableBy === "controlled")
    .map(({ id }) => id)
    .sort();
  const policyActionIds = [...new Set(Object.values(PLAYER_POLICIES).flat())].sort();

  assert.deepEqual(
    policyActionIds.filter((actionId) => !playerActionIds.includes(actionId)),
    [],
  );
  assert.deepEqual(
    playerActionIds.filter((actionId) => !policyActionIds.includes(actionId)),
    [],
  );
});

test("seeded encounter simulations reproduce actions, rolls, and outcomes", () => {
  const options = {
    seed: 431,
    policy: "escape",
    playerStats: { strength: 6, endurance: 6, resolve: 6, fitness: 6 },
    npcStats: { strength: 5, endurance: 5, resolve: 5, fitness: 5 },
  };
  const first = runEncounterSimulation(options);
  assert.deepEqual(first, runEncounterSimulation(options));
  assert.ok(first.rolls.length > 0);
  assert.ok(first.rolls.every(({ roll, chance }) => Number.isFinite(roll) && Number.isFinite(chance)));
});

test("stat-difference matrix records outcomes, pacing, repetition, and invariants", () => {
  const matrix = runStatDifferenceMatrix({ seedCount: 4, statDifferences: [-2, 0, 2] });
  assert.deepEqual(matrix.map(({ statDifference }) => statDifference), [-2, 0, 2]);
  for (const row of matrix) {
    assert.equal(row.runs, 4);
    assert.equal(row.invariantFailures, 0);
    assert.equal(row.timeouts, 0);
    assert.ok(row.meanExchanges > 0);
    assert.ok(row.meanNpcRepeatStreak >= 1);
    assert.equal(Object.values(row.outcomeCounts).reduce((sum, value) => sum + value, 0), 4);
    assert.ok(Object.keys(row.playerActionCounts).length > 0);
    assert.ok(Object.keys(row.npcActionCounts).length > 0);
    assert.ok(row.coverage.visitedStates > row.runs);
  }
});

test("state-space simulations exercise dangerous valid states and newest objectives", () => {
  const matrix = runEncounterStateSpaceMatrix({ seedCount: 2 });
  assert.deepEqual(
    matrix.map(({ scenario }) => scenario),
    ENCOUNTER_SIMULATION_SCENARIOS.map(({ id }) => id),
  );
  assert.ok(matrix.every(({ invariantFailures, timeouts }) =>
    invariantFailures === 0 && timeouts === 0));

  const grounded = matrix.find(({ scenario }) => scenario === "player-grounded-injured");
  assert.ok(grounded.coverage.playerPoses.includes("supine"));
  assert.ok(grounded.coverage.holdKinds.includes("limb-pin"));
  assert.deepEqual(grounded.coverage.acuteEffects, ["off-balance", "winded"]);
  assert.ok(grounded.coverage.maxPlayerExertion >= 78);
  assert.ok(grounded.coverage.minPlayerIntegrity < 1);
  assert.ok(Object.keys(grounded.coverage.playerUnavailableReasonCounts).length > 0);

  const controlled = runEncounterSimulation({
    seed: 431,
    scenario: "player-complete-control",
    policy: "control",
  });
  assert.equal(controlled.playerActions[0], "demand-money-back");
  const escaping = runEncounterSimulation({
    seed: 431,
    scenario: "player-complete-control",
    policy: "escape",
  });
  assert.equal(escaping.playerActions[0], "controlled-disengage");

  const beatDown = matrix.find(({ scenario }) => scenario === "beat-down-baseline");
  assert.ok(beatDown);
  assert.equal(beatDown.timeouts, 0);
  assert.equal(beatDown.invariantFailures, 0);
  assert.ok(Object.keys(beatDown.npcActionCounts).some((actionId) =>
    ["attack-limb", "strike-face", "drive-body", "headbutt", "knee-strike"]
      .includes(actionId)));
  assert.equal(beatDown.npcActionCounts.flee, undefined);
});

test("escape and passive-defense policies have bounded outcome distributions", () => {
  const escape = runStatDifferenceMatrix({
    seedCount: 30,
    statDifferences: [-4, 0, 4],
    policy: "escape",
  });
  const favorableRate = ({ outcomeCounts, runs }) => (
    (outcomeCounts["player-escaped"] || 0) + (outcomeCounts["mugger-fled"] || 0)
  ) / runs;

  assert.ok(favorableRate(escape[0]) < 0.55);
  assert.ok(favorableRate(escape[1]) >= 0.4 && favorableRate(escape[1]) <= 0.85);
  assert.ok(favorableRate(escape[2]) > 0.75);

  const [brace] = runStatDifferenceMatrix({
    seedCount: 30,
    statDifferences: [0],
    policy: "brace",
  });
  const retreats = brace.outcomeCounts["mugger-fled"] || 0;
  const thefts = (brace.outcomeCounts["theft-completed-player-conscious"] || 0)
    + (brace.outcomeCounts["theft-completed-player-incapacitated"] || 0);
  assert.ok(retreats / brace.runs < 0.4);
  assert.ok(thefts > retreats);
  assert.ok(brace.timeouts / brace.runs <= 0.2);
});
