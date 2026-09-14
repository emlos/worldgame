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

test("body condition is separate from mutable player stats", () => {
  const player = new Player();

  assert.equal(player.getBodyCondition(), "fine");
  assert.equal(player.getBodyConditionScore(), 100);
  assert.throws(() => player.getStatValue("health"), /unknown player stat/i);
  assert.equal(typeof player.body.getHealthPercentage, "undefined");
});

test("WG player context exposes condition, pain, and structural incapacitation", () => {
  const game = new Game({ seed: 417 });
  game.player.applyDamageToPart({ partId: "hand_l", integrityDamage: 35 });

  const context = createWGRuntimeContext(game);
  assert.equal(context.player.condition, game.player.getBodyCondition());
  assert.equal(context.player.conditionScore, game.player.getBodyConditionScore());
  assert.equal(context.player.pain, game.player.getBodyPain());
  assert.equal(context.player.incapacitated, false);
  assert.equal(Object.hasOwn(context.player, "health"), false);
});

test("whole-body pain keeps the worst injury legible without summing every part at full weight", () => {
  const player = new Player();
  player.applyDamageToPart({ partId: "hand_l", integrityDamage: 20 });
  player.applyDamageToPart({ partId: "face", integrityDamage: 10 });

  assert.equal(player.body.getPart("hand_l").pain, 28);
  assert.equal(player.body.getPart("face").pain, 17);
  assert.equal(player.getBodyPain(), 33.1);

  const integrity = player.body.getPart("hand_l").integrity;
  player.body.relievePain(1.5);
  assert.ok(player.getBodyPain() < 33.1);
  assert.equal(player.body.getPart("hand_l").integrity, integrity);
});

test("a vital injury dominates body condition instead of disappearing into a pooled total", () => {
  const player = new Player();
  const head = player.body.getPart("head");
  head.integrity = head.maxIntegrity * 0.08;
  head.conditions.add("bruised");

  assert.equal(player.getBodyConditionScore(), 0);
  assert.equal(player.getBodyCondition(), "incapacitated");
  assert.equal(player.isIncapacitated(), true);
});
