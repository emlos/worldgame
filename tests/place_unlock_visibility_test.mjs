import assert from "node:assert/strict";

import { Game, SaveValidationError } from "../src/classes/game/game.js";
import { listNavigationDestinations, resolveNavigationDestination } from "../src/classes/game/navigation.js";
import { buildFullMapView, buildLocalMapView } from "../src/classes/game/scene/mapView.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";

function allPlaced(game) {
  return [...game.world.locations.values()].flatMap((location) =>
    (location.places || []).map((place) => ({ location, place })),
  );
}

const game = new Game({
  seed: 117,
  startDate: new Date("2026-09-01T07:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});

const locked = allPlaced(game).find(({ place }) => !place.unlocked);
assert.ok(locked, "the fixture world should contain a locked place");

// Locked places still exist for simulation and NPC place queries.
assert.equal(
  game.world.map.findNearestPlace(
    (place) => place.id === locked.place.id,
    game.currentLocationId,
    game.now,
    false,
  )?.placeId,
  locked.place.id,
);

game.moveTo(locked.location.id);

assert.equal(
  buildScene(game).sections
    .flatMap((section) => section.choices)
    .some((choice) => choice.action?.placeId === locked.place.id),
  false,
  "locked places must not create entry choices",
);
assert.equal(
  buildLocalMapView(game).nodes
    .flatMap((node) => node.places)
    .some((place) => place.id === locked.place.id),
  false,
  "locked places must not appear on the local map",
);
assert.equal(
  buildFullMapView(game).nodes
    .flatMap((node) => node.places)
    .some((place) => place.id === locked.place.id),
  false,
  "locked places must not appear on the full map",
);
assert.equal(
  listNavigationDestinations(game).some(
    (destination) => destination.placeId === locked.place.id,
  ),
  false,
  "locked places must not appear in GPS search",
);
assert.equal(resolveNavigationDestination(game, locked.place.id), null);
assert.equal(game.getPlaceAccess(locked.place).code, "locked");
assert.throws(
  () => game.setCurrentPlace({ placeId: locked.place.id }),
  /not been unlocked/,
);

const unlockedCount = game.unlockPlacesByKey(locked.place.key);
assert.ok(unlockedCount > 0);
assert.ok(
  allPlaced(game)
    .filter(({ place }) => place.key === locked.place.key)
    .every(({ place }) => place.unlocked),
  "unlocking a registry key should reveal every generated instance",
);
assert.equal(game.getPlaceAccess(locked.place).allowed, true);
assert.ok(
  buildScene(game).sections
    .flatMap((section) => section.choices)
    .some((choice) => choice.action?.placeId === locked.place.id),
  "an unlocked place should immediately gain an entry choice",
);
assert.ok(resolveNavigationDestination(game, locked.place.id));

assert.throws(() => {
  locked.place.unlocked = false;
}, TypeError);
assert.equal(locked.place.unlocked, true, "an unlocked place cannot be relocked");

const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
const restoredPlace = allPlaced(restored).find(
  ({ place }) => place.id === locked.place.id,
)?.place;
assert.equal(restoredPlace?.unlocked, true, "unlocked state must survive save/load");
assert.equal(restored.toJSON().saveVersion, 22);

const invalidSave = JSON.parse(JSON.stringify(game));
const initiallyUnlocked = allPlaced(game).find(
  ({ place }) => place.key === "player_home",
);
assert.ok(initiallyUnlocked);
const savedHome = invalidSave.world.map.locations
  .flatMap((location) => location.places)
  .find((place) => place.id === initiallyUnlocked.place.id);
savedHome.unlocked = false;
assert.throws(
  () => Game.fromJSON(invalidSave),
  (error) =>
    error instanceof SaveValidationError &&
    /cannot relock a place that starts unlocked/.test(error.message),
);

console.log("Place unlock visibility checks passed.");
