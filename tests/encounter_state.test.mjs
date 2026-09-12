import test from "node:test";
import assert from "node:assert/strict";

import { createCombatContext, validateCombatantInvariants } from "../src/features/encounter/combatants.js";
import {
  ENCOUNTER_PHASE,
  validateEncounterState,
} from "../src/features/encounter/state.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

test("alley mugging state stores canonical facts without duplicating bodies", () => {
  const game = gameAtStart({ money: 37 });
  const state = startEncounter(game);

  assert.doesNotThrow(() => validateEncounterState(state));
  assert.equal(state.phase, ENCOUNTER_PHASE.active);
  assert.equal(state.objective.amount, 20);
  assert.equal(state.relationships.range[0].value, "reach");
  assert.deepEqual(state.relationships.holds, []);
  assert.equal(state.npcIntent.actionId, "grab-arm");
  assert.equal(Object.hasOwn(state.participants.player, "body"), false);
  assert.equal(Object.hasOwn(state.participants.mugger, "body"), false);
});

test("state validation rejects contradictory position and terminal facts", () => {
  const game = gameAtStart();
  const original = startEncounter(game);

  const nonClinchHold = structuredClone(original);
  nonClinchHold.relationships.holds.push({
    id: "hold-test",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 50,
  });
  assert.throws(
    () => validateEncounterState(nonClinchHold),
    /active hold requires clinch range/,
  );

  const impossibleSupport = structuredClone(original);
  impossibleSupport.participants.player.pose = "supine";
  impossibleSupport.participants.player.support = "wall";
  assert.throws(() => validateEncounterState(impossibleSupport), /supine and wall-supported/);

  const terminalIntent = structuredClone(original);
  terminalIntent.phase = "terminal";
  terminalIntent.outcome = { id: "player-escaped", moneyLost: 0 };
  terminalIntent.objective.stage = "complete";
  assert.throws(() => validateEncounterState(terminalIntent), /cannot retain NPC intent/);
});

test("runtime invariants reject a hold maintained by a nonfunctional hand", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.relationships.holds.push({
    id: "hold-test",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 50,
  });
  game.currentStory.actors.mugger.body.parts.find(({ id }) => id === "hand_l").health = 0;

  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  assert.throws(() => validateCombatantInvariants(context), /nonfunctional source limb/);
});

