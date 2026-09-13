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
import { renderLastExchange } from "../src/features/encounter/prose.js";
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

test("a newly broken player limb is announced once and ordinary healing cannot restore its use", () => {
  const { game, state, context } = encounterContext();
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
  assert.equal(forearm.isBroken, true);
  assert.equal(getPartCapacity(context, "player", BodyPartId.HAND_L), 0);
  assert.equal(firstRuntime.events.filter(({ type }) => type === "injury.broken").length, 1);

  state.lastEvents = firstRuntime.events;
  assert.match(
    renderLastExchange(context),
    /feel your left forearm snap.*pain is blinding.*no longer use it/i,
  );

  const secondRuntime = runtime();
  applyImpact(context, impact, secondRuntime, {
    partId: BodyPartId.LOWER_ARM_L,
    baseDamage: 2,
    strengthScale: 0,
  });
  assert.equal(secondRuntime.events.some(({ type }) => type === "injury.broken"), false);

  game.player.healBodyPart(BodyPartId.LOWER_ARM_L, forearm.maxHealth);
  assert.equal(forearm.health, forearm.maxHealth);
  assert.equal(forearm.isBroken, true);
  assert.equal(getPartCapacity(context, "player", BodyPartId.HAND_L), 0);
  assert.equal(
    Body.fromJSON(game.player.body.toJSON()).getPart(BodyPartId.LOWER_ARM_L).isBroken,
    true,
  );
});

test("a newly broken opponent limb receives visible third-person prose", () => {
  const { state, context } = encounterContext();
  const foot = context.combatants.mugger.body.getPart(BodyPartId.FOOT_L);
  foot.health = foot.maxHealth * 0.31;
  foot.pain = 0;
  foot.conditions.clear();
  const result = runtime();

  applyImpact(context, {
    actionId: "anatomy-test",
    actorId: "player",
    targetId: "mugger",
    parameters: { sourcePartId: BodyPartId.HAND_L },
  }, result, {
    partId: BodyPartId.FOOT_L,
    baseDamage: 10,
    strengthScale: 0,
  });

  state.lastEvents = result.events;
  assert.equal(foot.isBroken, true);
  assert.match(renderLastExchange(context), /left foot turns at an unnatural angle/i);
  assert.match(renderLastExchange(context), /can no longer use it/i);
});
