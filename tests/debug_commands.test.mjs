import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { advanceDebugHour } from "../src/game/debugCommands.js";

test("the debug hour control advances the simulation and NPC goals", () => {
  const game = new Game({
    seed: 7302,
    startDate: new Date("2026-09-04T17:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  const beforeRevision = game.actionRevision;

  const change = advanceDebugHour(game);

  assert.equal(game.now.toISOString(), "2026-09-04T18:00:00.000Z");
  assert.equal(change.minutes, 60);
  assert.equal(game.actionRevision, beforeRevision + 1);
  assert.equal(game.log.at(-1).label, "[Debug] Advance time by 1 hour");
  assert.equal(
    game.npcs.get("caro").brain.currentGoal?.ruleId,
    "caro_part_time_cinema",
  );
});

test("the cinema feature exposes a debug player teleport", () => {
  const game = new Game({
    seed: 7302,
    startDate: new Date("2026-09-04T18:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  const teleport = game.features.getDebugAction("cinema.teleport-player");

  assert.equal(typeof teleport, "function");
  const destination = teleport(game);

  assert.equal(destination.place.key, "cinema");
  assert.equal(game.currentPlace?.key, "cinema");
  assert.equal(game.currentLocationId, String(destination.location.id));
  assert.match(game.log.at(-1).label, /Teleport player to .*Cinema/i);
});
