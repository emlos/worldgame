import test from "node:test";
import assert from "node:assert/strict";

import { Game, SaveValidationError, validateGameSave } from "../src/game/game.js";

const FIXED_START = new Date("2026-09-04T12:00:00.000Z");

function createGame() {
  return new Game({ seed: 0x5a17, startDate: FIXED_START });
}

test("clearing the current place also clears its derived key", () => {
  const game = createGame();

  game.setCurrentPlace({ placeKey: "stale-place-key" });

  assert.equal(game.currentPlaceId, null);
  assert.equal(game.currentPlaceKey, null);
});

test("save validation rejects a place key without a current place", () => {
  const save = createGame().toJSON();
  save.currentPlaceId = null;
  save.currentPlaceKey = "stale-place-key";

  assert.throws(
    () => validateGameSave(save),
    (error) => {
      assert.ok(error instanceof SaveValidationError);
      assert.equal(error.path, "save.currentPlaceKey");
      return true;
    },
  );
});
