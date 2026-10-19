import test from "node:test";
import assert from "node:assert/strict";

import { Game, SaveValidationError, validateGameSave } from "../src/game/game.js";
import { playerComfort } from "../src/characters/player/stateDynamics.js";
import { Place } from "../src/world/model/place.js";

function freshGame() {
  return new Game({
    seed: 912,
    startDate: new Date("2026-09-02T12:00:00Z"),
  });
}

function enterPlace(game, key) {
  const place = game.world.findFirstPlaceByKey(key);
  assert.ok(place, `Expected a generated ${key} place`);
  game.moveTo(String(place.locationId));
  game.setCurrentPlace({ placeId: String(place.id) });
  assert.equal(game.currentPlace, place);
  return place;
}

function addTestPlace(game, key, props = {}) {
  const place = new Place({
    id: `${key}@${game.currentLocationId}`,
    key,
    name: key,
    locationId: game.currentLocationId,
    props: { category: [], ...props },
  });
  game.location.places.push(place);
  game.setCurrentPlace({ placeId: place.id });
  return place;
}

function comfortAt(game, { weather, temperatureC }) {
  game.world.weather._current.kind = weather;
  game.world.temperatureC = temperatureC;
  return playerComfort(game);
}

test("generated open-air places remain exposed and indoor places declare shelter", () => {
  const game = freshGame();
  for (const key of ["park", "alleyway"]) {
    const place = game.world.findFirstPlaceByKey(key);
    assert.ok(place, `Expected a generated ${key} place`);
    assert.equal(place.props.shelter, "outdoor", key);
  }
  for (const key of ["player_home", "cafe"]) {
    const place = game.world.findFirstPlaceByKey(key);
    assert.ok(place, `Expected a generated ${key} place`);
    assert.equal(place.props.shelter, "indoor", key);
  }
});

test("outdoor places and an untagged place expose the player to rain and cold", () => {
  const game = freshGame();
  for (const key of ["park", "alleyway"]) {
    enterPlace(game, key);
    const dryMild = comfortAt(game, { weather: "clear", temperatureC: 20 });
    const rainyMild = comfortAt(game, { weather: "rain", temperatureC: 20 });
    const dryCold = comfortAt(game, { weather: "clear", temperatureC: 0 });
    assert.ok(rainyMild < dryMild, `${key} should expose the player to rain`);
    assert.ok(dryCold < dryMild, `${key} should expose the player to cold`);
  }

  const untagged = addTestPlace(game, "test_untagged");
  assert.equal(untagged.props.shelter, "outdoor");
  const dryMild = comfortAt(game, { weather: "clear", temperatureC: 20 });
  assert.ok(comfortAt(game, { weather: "rain", temperatureC: 20 }) < dryMild);
  assert.ok(comfortAt(game, { weather: "clear", temperatureC: 0 }) < dryMild);
});

test("a location street is outdoors when no place is selected", () => {
  const game = freshGame();
  enterPlace(game, "park");
  const parkComfort = comfortAt(game, { weather: "rain", temperatureC: 0 });
  game.setCurrentPlace({ placeId: null });
  assert.equal(game.currentPlace, null);
  assert.equal(comfortAt(game, { weather: "rain", temperatureC: 0 }), parkComfort);
});

test("a covered place blocks precipitation but remains exposed to ambient cold", () => {
  const game = freshGame();
  enterPlace(game, "park");
  addTestPlace(game, "test_covered", { shelter: "covered" });

  const dryMild = comfortAt(game, { weather: "clear", temperatureC: 20 });
  const rainyMild = comfortAt(game, { weather: "rain", temperatureC: 20 });
  const dryCold = comfortAt(game, { weather: "clear", temperatureC: 0 });
  const rainyCold = comfortAt(game, { weather: "rain", temperatureC: 0 });
  assert.equal(rainyMild, dryMild);
  assert.ok(dryCold < dryMild);
  assert.equal(rainyCold, dryCold);
  assert.ok(comfortAt(game, { weather: "storm", temperatureC: 20 }) < dryMild);
});

test("an indoor place blocks both precipitation and ambient cold", () => {
  const game = freshGame();
  enterPlace(game, "cafe");

  const dryMild = comfortAt(game, { weather: "clear", temperatureC: 20 });
  assert.equal(comfortAt(game, { weather: "rain", temperatureC: 20 }), dryMild);
  assert.equal(comfortAt(game, { weather: "clear", temperatureC: 0 }), dryMild);
  assert.equal(comfortAt(game, { weather: "rain", temperatureC: 0 }), dryMild);
  assert.equal(comfortAt(game, { weather: "storm", temperatureC: 20 }), dryMild);
});

test("generated shelter metadata and comfort survive save/load", () => {
  const game = freshGame();
  enterPlace(game, "cafe");
  const before = playerComfort(game);
  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));

  assert.equal(restored.currentPlace?.key, "cafe");
  assert.equal(restored.currentPlace?.props.shelter, "indoor");
  assert.equal(playerComfort(restored), before);
});

test("saved places require a known shelter value", () => {
  for (const shelter of [undefined, "unknown"]) {
    const save = freshGame().toJSON();
    const place = save.world.map.locations[0].places[0];
    if (shelter === undefined) delete place.props.shelter;
    else place.props.shelter = shelter;
    assert.throws(
      () => validateGameSave(save),
      (error) => error instanceof SaveValidationError &&
        error.path.endsWith(".props.shelter"),
    );
  }
});
