import test from "node:test";
import assert from "node:assert/strict";

import { exitWGStory } from "../src/story/wg/runtime/storyRuntime.js";
import {
  chooseAction,
  gameAtStart,
  startEncounter,
} from "./support/encounter.mjs";

test("player pain recovers by 1.5 per elapsed minute outside physical encounters", () => {
  const game = gameAtStart();
  game.player.applyDamageToPart({ partId: "hand_l", amount: 20 });
  const before = game.player.getBodyPain();

  game.advanceMinutes(4);

  assert.ok(Math.abs(game.player.getBodyPain() - (before - 6)) < 1e-9);
  game.advanceMinutes(100);
  assert.equal(game.player.getBodyPain(), 0);
});

test("combat exchange time does not recover persistent pain", () => {
  const game = gameAtStart({ seed: 1 });
  game.player.applyDamageToPart({ partId: "hand_l", amount: 10 });
  startEncounter(game);
  const before = game.player.getBodyPain();

  chooseAction(game, "cover-and-brace");

  assert.equal(game.player.getBodyPain(), before);
  exitWGStory(game);
  game.advanceMinutes(1);
  assert.ok(Math.abs(game.player.getBodyPain() - (before - 1.5)) < 1e-9);
});
