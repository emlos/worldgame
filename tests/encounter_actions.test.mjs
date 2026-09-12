import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  actionLabel,
  getAvailableActionInstances,
  sameActionInstance,
} from "../src/features/encounter/availability.js";
import { intentToActionInstance } from "../src/features/encounter/ai.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

function actionIds(instances) {
  return instances.map(({ actionId }) => actionId);
}

test("the opening state exposes the minimum contextual choices", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  const scene = buildScene(game);

  assert.deepEqual(
    scene.sections[0].choices.map(({ id }) => id),
    [
      "encounter-action:strike-face",
      "encounter-action:drive-body",
      "encounter-action:shove-away",
      "encounter-action:grab-arm",
      "encounter-action:create-distance",
      "encounter-action:cover-and-brace",
    ],
  );
  assert.ok(scene.sections[0].choices.length <= 7);
  assert.match(JSON.stringify(scene.content), /Next:/);
  assert.match(JSON.stringify(scene.content), /Current situation/);
  assert.match(JSON.stringify(scene.content), /complete exchange time/);

  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const npcActions = getAvailableActionInstances(context, "mugger");
  assert.ok(npcActions.some((candidate) =>
    sameActionInstance(candidate, intentToActionInstance(state.npcIntent))));
});

test("a relational wrist hold generates hold-specific responses", () => {
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
  state.npcIntent = {
    actorId: "mugger",
    actionId: "force-to-wall",
    parameters: { targetId: "player", holdId: "hold-test" },
  };

  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const ids = actionIds(getAvailableActionInstances(context, "player"));
  assert.ok(ids.includes("strike-holding-arm"));
  assert.ok(ids.includes("wrench-free"));
  assert.equal(Object.hasOwn(state, "is_left_arm_held"), false);
  assert.equal(Object.hasOwn(state.participants.player, "pressed_against_wall"), false);
});

test("two held arms generate one combined wrench and separate holding-limb attacks", () => {
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
      leverage: 50,
    },
    {
      id: "hold-right",
      controllerId: "mugger",
      sourcePartId: "hand_r",
      targetId: "player",
      targetPartId: "lower_arm_r",
      kind: "wrist-grip",
      leverage: 48,
    },
  );
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const actions = getAvailableActionInstances(context, "player");
  const wrench = actions.filter(({ actionId }) => actionId === "wrench-free");
  const holdingLimbStrikes = actions.filter(({ actionId }) => actionId === "strike-holding-arm");

  assert.equal(wrench.length, 1);
  assert.deepEqual(wrench[0].parameters.holdIds, ["hold-left", "hold-right"]);
  assert.equal(actionLabel(context, wrench[0]), "Try to wrestle both arms free");
  assert.equal(holdingLimbStrikes.length, 2);
  assert.ok(holdingLimbStrikes.every(({ parameters }) => parameters.sourcePartId.startsWith("knee_")));
  assert.ok(actionIds(actions).includes("headbutt"));
  assert.ok(actionIds(actions).includes("knee-strike"));

  state.npcIntent = {
    actorId: "mugger",
    actionId: "force-to-ground",
    parameters: { targetId: "player", holdId: "hold-left" },
  };
  const choices = buildScene(game).sections[0].choices;
  assert.ok(choices.length <= 7);
  assert.equal(new Set(choices.map(({ id }) => id)).size, choices.length);
  assert.equal(
    choices.filter(({ action }) => action.command.actionId === "strike-holding-arm").length,
    2,
  );
});

test("ground position exposes standing, turning, and pin actions contextually", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.player.pose = "supine";
  state.participants.mugger.pose = "kneeling";
  state.relationships.holds.push({
    id: "ground-grip",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 24,
  });
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  let playerIds = actionIds(getAvailableActionInstances(context, "player"));
  assert.ok(playerIds.includes("stand-up"));
  assert.ok(!playerIds.includes("knee-strike"));
  assert.ok(!playerIds.includes("headbutt"));
  assert.ok(actionIds(getAvailableActionInstances(context, "mugger")).includes("pin-limb"));

  state.participants.player.pose = "prone";
  state.relationships.facing.find(({ actor }) => actor === "player").value = "away";
  playerIds = actionIds(getAvailableActionInstances(context, "player"));
  assert.ok(playerIds.includes("roll-toward"));
});
