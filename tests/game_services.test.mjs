import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { listNavigationDestinations } from "../src/game/navigation.js";

const FIXED_START = new Date("2026-09-04T12:00:00.000Z");

function gameWithoutNPCs(options = {}) {
  return new Game({
    seed: 8128,
    startDate: FIXED_START,
    npcTemplates: [],
    ...options,
  });
}

test("game events retain their payloads and unsubscribe behavior", () => {
  const game = gameWithoutNPCs();
  const events = [];
  const unsubscribe = game.on("time", (currentGame, minutes, change) => {
    events.push({ currentGame, minutes, change });
  });

  game.advanceMinutes(5);
  assert.equal(events.length, 1);
  assert.equal(events[0].currentGame, game);
  assert.equal(events[0].minutes, 5);
  assert.equal(events[0].change.mode, "simulate");
  assert.equal(events[0].change.source, "advance");

  unsubscribe();
  game.advanceMinutes(5);
  assert.equal(events.length, 1);

  let jump = null;
  game.on("timeJump", (currentGame, change) => {
    jump = { currentGame, change };
  });
  game.jumpToDate(new Date(game.now.getTime() + 60_000));
  assert.equal(jump.currentGame, game);
  assert.equal(jump.change.mode, "resync");
  assert.equal(jump.change.source, "jump");
});

test("movement preserves story, GPS, place, and event invariants", () => {
  const game = gameWithoutNPCs();
  const destination = listNavigationDestinations(game).find(
    (candidate) => candidate.locationId !== String(game.currentLocationId),
  );
  assert.ok(destination, "expected an unlocked destination outside the start location");

  const gps = game.setGpsTarget(destination.placeId);
  assert.equal(gps.active, true);
  game.currentStory = { id: "test.story", passageId: "start" };
  game.storyContinuations.push({ target: "@exit" });
  const revision = game.storyRevision;

  let observedLocation = null;
  game.on("location", (currentGame, locationId) => {
    assert.equal(currentGame.currentPlace, null);
    observedLocation = locationId;
  });
  game.moveTo(destination.locationId);

  assert.equal(observedLocation, destination.locationId);
  assert.equal(game.currentLocationId, destination.locationId);
  assert.equal(game.currentPlace, null);
  assert.equal(game.currentStory, null);
  assert.deepEqual(game.storyContinuations, []);
  assert.equal(game.storyRevision, revision + 1);
  assert.equal(game.gpsTarget, null);
});

test("the action runner preserves effect, time, interrupt, and logging order", () => {
  const game = gameWithoutNPCs({
    playerOptions: { startPlaceId: null },
  });
  game.dailyAnnouncements = {
    day: game.now.toISOString().slice(0, 10),
    items: [{ id: "test", tone: "info", text: "Test" }],
  };
  const order = [];
  game.on("time", () => order.push("time"));
  const before = game.now.getTime();
  const revision = game.actionRevision;

  game.runAction({
    label: "ordered-action",
    minutes: 5,
    apply(currentGame) {
      order.push("apply");
      currentGame.setFlag("action-applied");
    },
    after(currentGame) {
      order.push("after");
      assert.equal(currentGame.hasFlag("action-applied"), true);
    },
    interrupt(_currentGame, phase) {
      order.push(`interrupt:${phase}`);
      return false;
    },
  });

  assert.deepEqual(order, [
    "apply",
    "time",
    "interrupt:before-after",
    "after",
    "interrupt:after-after",
  ]);
  assert.equal(game.now.getTime() - before, 5 * 60_000);
  assert.equal(game.actionRevision, revision + 1);
  assert.deepEqual(game.log.at(-1), {
    t: new Date(before).toISOString(),
    label: "ordered-action",
  });
  assert.deepEqual(game.dailyAnnouncements.items, []);
});

test("crossing UTC midnight clears daily flags and refreshes announcements", () => {
  const game = gameWithoutNPCs({
    startDate: new Date("2026-09-04T23:30:00.000Z"),
  });
  game.setDailyFlag("seen-today");

  game.advanceMinutes(60);

  assert.equal(game.hasDailyFlag("seen-today"), false);
  assert.equal(game.dailyAnnouncements.day, "2026-09-05");
});

test("new games are deterministic and hydration round-trips exact state", () => {
  const options = { seed: 90210, startDate: FIXED_START };
  const first = new Game(options);
  const second = new Game(options);
  assert.deepEqual(second.toJSON(), first.toJSON());

  first.setFlag("round-trip");
  first.setDailyFlag("today-only");
  first.startTimer("rent.weekly");
  first.advanceMinutes(15);
  const saved = JSON.parse(JSON.stringify(first.toJSON()));
  const restored = Game.fromJSON(saved);

  assert.deepEqual(JSON.parse(JSON.stringify(restored.toJSON())), saved);
  assert.notEqual(restored, first);
  assert.notEqual(restored.world, first.world);
  assert.notEqual(restored.player, first.player);
});
