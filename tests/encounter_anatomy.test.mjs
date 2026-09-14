import test from "node:test";
import assert from "node:assert/strict";

import { Body, BodyPartId } from "../src/characters/core/body.js";
import { getAvailableActionInstances } from "../src/features/encounter/availability.js";
import {
  createCombatContext,
  getPartCapacity,
} from "../src/features/encounter/combatants.js";
import {
  applyImpact,
  contest,
} from "../src/features/encounter/actions/helpers.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

function encounterContext() {
  const game = gameAtStart();
  const state = startEncounter(game);
  return {
    game,
    state,
    context: createCombatContext({
      game,
      state,
      instanceKey: game.currentStory.instanceKey,
    }),
  };
}

function runtime() {
  return {
    events: [],
    guarded: new Set(),
    evading: new Set(),
    outcome: null,
  };
}

test("actions choose the stronger free hand and expose both available arm targets", () => {
  const { game, context } = encounterContext();
  const leftHand = game.player.body.getPart(BodyPartId.HAND_L);
  leftHand.health = leftHand.maxHealth * 0.5;

  const actions = getAvailableActionInstances(context, "player");
  const strike = actions.find(({ actionId }) => actionId === "strike-face");
  const grabs = actions.filter(({ actionId }) => actionId === "grab-arm");

  assert.equal(strike.parameters.sourcePartId, BodyPartId.HAND_R);
  assert.deepEqual(
    grabs.map(({ parameters }) => parameters.targetPartId).sort(),
    [BodyPartId.LOWER_ARM_L, BodyPartId.LOWER_ARM_R].sort(),
  );
  assert.ok(grabs.every(({ parameters }) => parameters.sourcePartId === BodyPartId.HAND_R));
});

test("an injured source limb reduces both action chance and impact damage", () => {
  const { game, context } = encounterContext();
  const leftHand = game.player.body.getPart(BodyPartId.HAND_L);
  leftHand.health = leftHand.maxHealth * 0.5;

  const healthyRuntime = runtime();
  const injuredRuntime = runtime();
  const healthy = {
    actionId: "anatomy-test",
    actorId: "player",
    targetId: "mugger",
    parameters: { sourcePartId: BodyPartId.HAND_R },
  };
  const injured = {
    ...healthy,
    parameters: { sourcePartId: BodyPartId.HAND_L },
  };

  contest(context, healthy, healthyRuntime);
  contest(context, injured, injuredRuntime);
  assert.ok(injuredRuntime.events[0].chance < healthyRuntime.events[0].chance);

  const healthyDamage = applyImpact(context, healthy, healthyRuntime, {
    partId: BodyPartId.ABDOMEN,
    baseDamage: 10,
    strengthScale: 0,
  });
  const injuredDamage = applyImpact(context, injured, injuredRuntime, {
    partId: BodyPartId.ABDOMEN,
    baseDamage: 10,
    strengthScale: 0,
  });
  assert.ok(injuredDamage < healthyDamage);
});

test("severe combat damage creates only a temporary bruise", () => {
  const { game, context } = encounterContext();
  const forearm = game.player.body.getPart(BodyPartId.LOWER_ARM_L);
  forearm.health = forearm.maxHealth * 0.31;
  forearm.pain = 0;
  forearm.conditions.clear();
  const firstRuntime = runtime();
  const impact = {
    actionId: "anatomy-test",
    actorId: "mugger",
    targetId: "player",
    parameters: { sourcePartId: BodyPartId.HAND_L },
  };

  applyImpact(context, impact, firstRuntime, {
    partId: BodyPartId.LOWER_ARM_L,
    baseDamage: 10,
    strengthScale: 0,
  });
  assert.deepEqual([...forearm.conditions], ["bruised"]);
  assert.ok(getPartCapacity(context, "player", BodyPartId.HAND_L) > 0);
  assert.ok(firstRuntime.events.every(({ type }) => type !== "injury.broken"));
  assert.deepEqual(
    [...Body.fromJSON(game.player.body.toJSON()).getPart(BodyPartId.LOWER_ARM_L).conditions],
    ["bruised"],
  );

  game.player.body.relievePain(100);
  assert.equal(forearm.health, forearm.maxHealth);
  assert.deepEqual([...forearm.conditions], []);
  assert.equal(getPartCapacity(context, "player", BodyPartId.HAND_L), 1);
});

test("body hydration rejects disabled wound and break conditions", () => {
  const body = new Body();
  const data = body.toJSON();
  data.parts[0].conditions = ["wounded"];
  assert.throws(() => Body.fromJSON(data), /only 'bruised'/i);

  data.parts[0].conditions = ["broken"];
  assert.throws(() => Body.fromJSON(data), /only 'bruised'/i);
});
