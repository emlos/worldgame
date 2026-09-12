import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
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

