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
  assert.ok(favorableRate(escape[1]) >= 0.4 && favorableRate(escape[1]) <= 0.8);
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
