import test from "node:test";
import assert from "node:assert/strict";

import {
  createCombatContext,
  getLimbCapacity,
  getPartCapacity,
  validateCombatantInvariants,
} from "../src/features/encounter/combatants.js";
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
  assert.throws(() => validateEncounterState(impossibleSupport), /grounded and wall-supported/);

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

test("multiple holds use distinct source and target limb chains", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.relationships.holds.push(
    {
      id: "hold-left",
      controllerId: "mugger",
      sourcePartId: "hand_l",
      targetId: "player",
      targetPartId: "lower_arm_l",
      kind: "wrist-grip",
      leverage: 48,
    },
    {
      id: "hold-right",
      controllerId: "mugger",
      sourcePartId: "hand_r",
      targetId: "player",
      targetPartId: "lower_arm_r",
      kind: "wrist-grip",
      leverage: 46,
    },
  );

  assert.doesNotThrow(() => validateEncounterState(state));

  const repeatedSource = structuredClone(state);
  repeatedSource.relationships.holds[1].sourcePartId = "hand_l";
  assert.throws(() => validateEncounterState(repeatedSource), /reuses source limb/);

  const repeatedTarget = structuredClone(state);
  repeatedTarget.relationships.holds[1].targetPartId = "lower_arm_l";
  assert.throws(() => validateEncounterState(repeatedTarget), /controls target limb/);
});

test("ground pins remain relational and reduce derived limb capacity", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.player.pose = "supine";
  state.participants.mugger.pose = "kneeling";
  state.relationships.holds.push({
    id: "pin-left",
    controllerId: "mugger",
    sourcePartId: "knee_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "limb-pin",
    leverage: 60,
  });
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  assert.doesNotThrow(() => validateEncounterState(state));
  assert.doesNotThrow(() => validateCombatantInvariants(context));
  assert.ok(
    getLimbCapacity(context, "player", "hand_l")
      < getPartCapacity(context, "player", "hand_l") * 0.3,
  );

  state.participants.player.pose = "standing";
  assert.throws(() => validateCombatantInvariants(context), /grounded or wall-supported/);
});

test("damage anywhere in a source chain reduces the capacity of its hand", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  const forearm = game.currentStory.actors.mugger.body.parts.find(
    ({ id }) => id === "lower_arm_l",
  );
  forearm.health = 16;
  forearm.pain = 40;
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  assert.ok(getPartCapacity(context, "mugger", "hand_l") < 0.2);
  assert.equal(getPartCapacity(context, "mugger", "hand_r"), 1);
});
