import test from "node:test";
import assert from "node:assert/strict";

import { exitWGStory } from "../src/story/wg/runtime/storyRuntime.js";
import {
  chooseAction,
  gameAtStart,
  startEncounter,
} from "./support/encounter.mjs";

test("acute pain decays outside combat without immediately repairing integrity", () => {
  const game = gameAtStart();
  game.player.applyDamageToPart({ partId: "hand_l", integrityDamage: 20 });
  const part = game.player.body.getPart("hand_l");
  const beforePain = game.player.getBodyPain();
  const beforeAcutePain = part.acutePain;
  const beforeIntegrity = part.integrity;

  game.advanceMinutes(90);

  assert.ok(Math.abs(part.acutePain - beforeAcutePain / 2) < 1e-9);
  assert.ok(game.player.getBodyPain() < beforePain);
  assert.ok(game.player.getBodyPain() >= part.injuryPainFloor);
  assert.equal(part.integrity, beforeIntegrity);
});

test("combat exchange time does not recover acute pain or integrity", () => {
  const game = gameAtStart({ seed: 1 });
  game.player.applyDamageToPart({ partId: "hand_l", integrityDamage: 10 });
  startEncounter(game);
  const part = game.player.body.getPart("hand_l");
  const beforePain = game.player.getBodyPain();
  const beforeIntegrity = part.integrity;

  chooseAction(game, "cover-and-brace");

  assert.equal(game.player.getBodyPain(), beforePain);
  assert.equal(part.integrity, beforeIntegrity);
  exitWGStory(game);
  game.advanceMinutes(90);
  assert.ok(game.player.getBodyPain() < beforePain);
  assert.equal(part.integrity, beforeIntegrity);
});

test("an injury pain floor remains after acute pain has faded", () => {
  const game = gameAtStart();
  game.player.applyDamageToPart({ partId: "hand_l", integrityDamage: 35 });
  const part = game.player.body.getPart("hand_l");
  const integrity = part.integrity;

  game.player.body.decayAcutePain(24 * 60);

  assert.ok(part.acutePain < 0.001);
  assert.ok(part.injuryPainFloor > 0);
  assert.ok(Math.abs(part.pain - part.injuryPainFloor) < 0.001);
  assert.equal(part.integrity, integrity);
});

test("integrity recovery is slow, delayed, and independent of update size", () => {
  const singleStep = gameAtStart();
  const hourlySteps = gameAtStart();
  for (const game of [singleStep, hourlySteps]) {
    game.player.applyDamageToPart({ partId: "hand_l", integrityDamage: 35 });
  }

  singleStep.player.body.recoverIntegrity(3 * 1440 + 360);
  for (let hour = 0; hour < 78; hour += 1) {
    hourlySteps.player.body.recoverIntegrity(60);
  }

  const singlePart = singleStep.player.body.getPart("hand_l");
  const steppedPart = hourlySteps.player.body.getPart("hand_l");
  assert.equal(singlePart.integrity, 45.5);
  assert.ok(Math.abs(steppedPart.integrity - singlePart.integrity) < 1e-9);
});

test("critical structural damage does not heal naturally without treatment", () => {
  const game = gameAtStart();
  game.player.applyDamageToPart({ partId: "hand_l", integrityDamage: 58 });
  const part = game.player.body.getPart("hand_l");

  game.player.body.recoverIntegrity(30 * 1440);

  assert.equal(part.integrity, 12);
  assert.equal(part.healingDelayMinutes, 0);
});
