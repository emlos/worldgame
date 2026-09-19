import test from "node:test";
import assert from "node:assert/strict";

import { buildEncounterDebugSection, getEncounterDebugSnapshot } from "../src/features/encounter/debug.js";
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
  assert.deepEqual(Object.keys(snapshot.combatants), ["player", "mugger"]);
  assert.deepEqual(Object.keys(snapshot.combatants.player.stats), [
    "strength",
    "endurance",
    "resolve",
    "fitness",
  ]);
  assert.ok(Number.isFinite(snapshot.combatants.mugger.derived.physicalReadiness));
  assert.ok(Array.isArray(snapshot.combatants.player.body.parts));
  assert.equal(snapshot.situation.caption, "Current situation");
  assert.deepEqual(snapshot.situation.columns.slice(0, 2), ["State", "You"]);
  const section = buildEncounterDebugSection(game);
  assert.equal(section.title, "Physical encounter");
  assert.equal(section.fields.find(({ label }) => label === "Intent").value, snapshot.state.npcIntent.actionId);
  assert.ok(section.details.some(({ summary }) => summary === "State invariants"));
  assert.match(
    section.details.find(({ summary }) => summary === "Situation table").text,
    /Position.*Condition/s,
  );
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
