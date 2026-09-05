import test from "node:test";
import assert from "node:assert/strict";

import { BUS_ACTION_TYPE } from "../src/features/bus/sceneDecorators.js";
import { BUS_SERVICE } from "../src/features/bus/config.js";
import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";

function placePlayerAtFirstBusStop(game) {
  for (const location of game.world.locations.values()) {
    const place = (location.places ?? []).find((candidate) => candidate.key === "bus_stop");
    if (!place) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(place.id) });
    return place;
  }
  throw new Error("The generated test world has no bus stop");
}

function findChoice(scene, id) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.id === id);
}

function createBusGame() {
  const game = new Game({
    seed: 7301,
    startDate: new Date("2026-09-03T14:07:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  game.player.adjustMoney(10);
  placePlayerAtFirstBusStop(game);
  return game;
}

test("the bus feature decorates its authored hub and boarding scene", () => {
  const game = createBusGame();
  const hub = buildScene(game);
  const wait = findChoice(hub, "wait");

  assert.match(hub.content.at(-1).text, /single bus ticket costs £2\.50/);
  assert.equal(wait.durationMinutes, 8);
  assert.equal(wait.enabled, true);

  performChoice(game, { sceneId: hub.id, choiceId: wait.id });
  const boarding = buildScene(game);
  const travelChoices = boarding.sections
    .flatMap((section) => section.choices)
    .filter((choice) => choice.action.type === BUS_ACTION_TYPE.travel);

  assert.equal(game.currentStory.id, "transit.bus-boarding");
  assert.ok(travelChoices.length > 0);
  assert.ok(travelChoices.every((choice) => choice.costs[0].amount === BUS_SERVICE.fare));
});

test("registered bus travel charges, advances time, relocates, and exits boarding", () => {
  const game = createBusGame();
  let scene = buildScene(game);
  performChoice(game, { sceneId: scene.id, choiceId: "wait" });
  scene = buildScene(game);
  const travel = scene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.action.type === BUS_ACTION_TYPE.travel);
  const before = {
    money: game.player.money,
    time: game.now.getTime(),
    placeId: game.currentPlaceId,
  };

  performChoice(game, { sceneId: scene.id, choiceId: travel.id });

  assert.equal(game.player.money, before.money - BUS_SERVICE.fare);
  assert.equal(game.now.getTime() - before.time, travel.durationMinutes * 60_000);
  assert.notEqual(game.currentPlaceId, before.placeId);
  assert.equal(game.currentPlaceId, travel.action.targetPlaceId);
  assert.equal(game.currentPlace.key, "bus_stop");
  assert.equal(game.currentStory, null);
});

test("bus choices become unavailable when the fare cannot be paid", () => {
  const game = createBusGame();
  game.player.adjustMoney(-game.player.money);
  const wait = findChoice(buildScene(game), "wait");

  assert.equal(wait.enabled, false);
  assert.match(wait.disabledReason, /need £2\.50/);
});
