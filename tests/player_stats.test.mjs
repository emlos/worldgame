import test from "node:test";
import assert from "node:assert/strict";

import { Player } from "../src/characters/player/player.js";
import { createWGRuntimeContext } from "../src/story/wg/runtime/runtimeContext.js";
import { Game } from "../src/game/game.js";

test("player meters are bounded plain values", () => {
  const player = new Player();

  assert.equal(player.setStatValue("energy", 150), 100);
  assert.equal(player.adjustStat("energy", -150), 0);
  assert.equal(player.stats.energy, 0);
  assert.equal(typeof player.stats.energy, "number");
});

test("derived health is readable but cannot be changed as a generic stat", () => {
  const player = new Player();
  const before = player.body.toJSON();

  assert.equal(player.getStatValue("health"), 100);
  assert.throws(() => player.setStatValue("health", 50), /read-only/);
  assert.throws(() => player.adjustStat("health", -10), /read-only/);
  assert.deepEqual(player.body.toJSON(), before);
  assert.equal(typeof player.body.setHealthPercentage, "undefined");
});

test("WG player context exposes body-derived health", () => {
  const game = new Game({ seed: 417 });
  game.player.applyDamageToPart({ partId: "hand_l", amount: 35 });

  const context = createWGRuntimeContext(game);
  assert.equal(context.player.health, game.player.getStatValue("health"));
  assert.ok(context.player.health < 100);
});
