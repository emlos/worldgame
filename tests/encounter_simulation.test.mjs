import test from "node:test";
import assert from "node:assert/strict";

import {
  runEncounterSimulation,
  runStatDifferenceMatrix,
} from "../tools/encounter/simulationHarness.mjs";

test("seeded encounter simulations reproduce actions, rolls, and outcomes", () => {
  const options = {
    seed: 431,
    policy: "escape",
    playerStats: { strength: 6, endurance: 6, resolve: 6, fitness: 6 },
    npcStats: { strength: 5, endurance: 5, resolve: 5 },
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
  }
});
