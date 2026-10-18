import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { playerComfort } from "../src/characters/player/stateDynamics.js";
import { createWGRuntimeContext } from "../src/story/wg/runtime/runtimeContext.js";
import { parseWGSource } from "../tools/wg/compiler/sourceParser.js";

function freshGame() {
  return new Game({ seed: 912, startDate: new Date("2026-09-02T12:00:00Z") });
}

test("stress, pain, and comfort affect rest without removing its recovery", () => {
  const rested = freshGame();
  const strained = freshGame();
  for (const game of [rested, strained]) game.player.setStatValue("energy", 10);
  strained.player.setStatValue("stress", 30);
  strained.player.temperature = "cold";
  strained.player.applyDamageToPart({ partId: "hand_l", integrityDamage: 20 });

  assert.ok(playerComfort(strained) < playerComfort(rested));
  rested.runAction({ label: "sleep", minutes: 360, energyFree: true, resting: true });
  strained.runAction({ label: "sleep", minutes: 360, energyFree: true, resting: true });

  assert.ok(strained.player.getStatValue("energy") > 10);
  assert.ok(strained.player.getStatValue("energy") < rested.player.getStatValue("energy"));
  assert.ok(strained.player.getStatValue("stress") < 30);
});

test("only tagged exertion turns depleted energy into stress", () => {
  const ordinary = freshGame();
  const exerting = freshGame();
  for (const game of [ordinary, exerting]) game.player.setStatValue("energy", 15);
  ordinary.runAction({ label: "read", minutes: 60 });
  exerting.runAction({ label: "run", minutes: 60, activity: "exert" });

  assert.equal(ordinary.player.getStatValue("stress"), 0);
  assert.ok(exerting.player.getStatValue("stress") > 0);
  assert.ok(exerting.player.getStatValue("energy") < ordinary.player.getStatValue("energy"));
});

test("exertion has the same result when elapsed time is split", () => {
  const whole = freshGame();
  const split = freshGame();
  for (const game of [whole, split]) game.player.setStatValue("energy", 24);
  whole.advanceMinutes(60, { activity: "exert" });
  split.advanceMinutes(30, { activity: "exert" });
  split.advanceMinutes(30, { activity: "exert" });
  assert.equal(split.player.getStatValue("energy"), whole.player.getStatValue("energy"));
  assert.equal(split.player.getStatValue("stress"), whole.player.getStatValue("stress"));
});

test("stress raises fear and anger reactivity, then they fade with elapsed time", () => {
  const game = freshGame();
  game.player.setStatValue("stress", 60);
  game.player.adjustStat("fear", 10);
  game.player.adjustStat("anger", 10);
  game.player.adjustStat("arousal", 10);
  assert.ok(game.player.getStatValue("fear") > 10);
  assert.ok(game.player.getStatValue("anger") > 10);
  assert.equal(createWGRuntimeContext(game).player.comfort, playerComfort(game));
  assert.ok(createWGRuntimeContext(game).player.fear > 10);
  assert.equal(createWGRuntimeContext(game).player.stressBand, "overwhelmed");
  assert.equal(createWGRuntimeContext(game).player.hygieneBand, "clean");

  const loaded = Game.fromJSON(game.toJSON());
  assert.equal(loaded.player.getStatValue("fear"), game.player.getStatValue("fear"));
  loaded.advanceMinutes(30);
  assert.ok(loaded.player.getStatValue("fear") < game.player.getStatValue("fear"));
  assert.ok(loaded.player.getStatValue("anger") < game.player.getStatValue("anger"));
  assert.ok(loaded.player.getStatValue("arousal") < game.player.getStatValue("arousal"));
});

test("WG accepts quiet and exert time tags without making them free time", () => {
  const scenes = parseWGSource({ source: `
:: test.states -> @exit
  @choice "Sit quietly" -> @exit
    @time 30m quiet
    @change stat fear 10
  @endchoice
  @choice "Run" -> @exit
    @time 10m exert
  @endchoice
` });
  const choices = scenes[0].passages[0].body.filter((node) => node.type === "choice");
  assert.deepEqual(choices.map((choice) => choice.activity), ["quiet", "exert"]);
  assert.ok(choices.every((choice) => !choice.energyFree));
});
