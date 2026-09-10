import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { advanceDebugHour } from "../src/game/debugCommands.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";

function findActionChoice(scene, actionType) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.action?.type === actionType);
}

function findEnterHomeChoice(game, scene) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find(
      (choice) =>
        choice.action?.type === "enter" &&
        String(choice.action.placeId) === String(game.homePlaceId),
    );
}

function drainToDisplayedZero(game) {
  game.player.setStatBase("energy", 6.5);
  advanceDebugHour(game);
  assert.equal(game.player.getStatBase("energy"), 0.5);
}

test("leaving a hub triggers exhaustion when fractional energy displays as zero", () => {
  const game = new Game({
    seed: 7401,
    startDate: new Date("2026-09-03T14:00:00.000Z"),
  });
  drainToDisplayedZero(game);

  const hub = buildScene(game);
  const leave = findActionChoice(hub, "leave");
  assert.ok(leave);

  performChoice(game, { sceneId: hub.id, choiceId: leave.id });

  assert.equal(game.currentStory?.id, "interrupt.exhaustion.hospital");
  assert.equal(game.interruptState.active?.sceneId, game.currentStory.id);
});

test("entering a hub triggers its specific exhaustion interrupt", () => {
  const game = new Game({
    seed: 7402,
    startDate: new Date("2026-09-03T14:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  drainToDisplayedZero(game);

  const outside = buildScene(game);
  const enterHome = findEnterHomeChoice(game, outside);
  assert.ok(enterHome);

  performChoice(game, { sceneId: outside.id, choiceId: enterHome.id });

  assert.equal(game.currentPlace?.key, "player_home");
  assert.equal(game.currentStory?.id, "interrupt.exhaustion.home");
});

test("fractional exhaustion survives saving and triggers on later traversal", () => {
  const original = new Game({
    seed: 7403,
    startDate: new Date("2026-09-03T14:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  drainToDisplayedZero(original);

  const game = Game.fromJSON(JSON.parse(JSON.stringify(original.toJSON())));
  assert.equal(game.player.getStatBase("energy"), 0.5);

  const outside = buildScene(game);
  const enterHome = findEnterHomeChoice(game, outside);
  performChoice(game, { sceneId: outside.id, choiceId: enterHome.id });

  assert.equal(game.currentStory?.id, "interrupt.exhaustion.home");
});
