import test from "node:test";
import assert from "node:assert/strict";

import { getEncounterDebugSnapshot } from "../src/features/encounter/debug.js";
import { chooseAction, gameAtStart, startEncounter } from "./support/encounter.mjs";

test("encounter debug snapshot exposes state, reasons, scores, and invariants without mutation", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);
  const before = structuredClone(game.currentStory.system.state);
  const snapshot = getEncounterDebugSnapshot(game);

  assert.equal(snapshot.invariants.valid, true);
  assert.ok(snapshot.decision.candidates.length > 0);
  assert.ok(snapshot.availability.player.some(({ available }) => available));
  assert.ok(snapshot.availability.player.some(({ available, reasons }) => !available && reasons.length));
  assert.deepEqual(game.currentStory.system.state, before);
});

test("latest exchange debug data includes deterministic roll and chance values", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);
  chooseAction(game, "strike-face");
  const snapshot = getEncounterDebugSnapshot(game);

  assert.ok(snapshot.rolls.length > 0);
  assert.ok(snapshot.rolls.every(({ roll, chance, success }) =>
    Number.isFinite(roll) && Number.isFinite(chance) && success === (roll < chance)));
});
