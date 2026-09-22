import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { injuredTreatmentRegions, sashaIsOnDuty } from "../src/features/hospital/care.js";
import { resolveWGAutomaticScene, WG_AUTO_TRIGGER } from "../src/story/wg/runtime/sceneExposure.js";

function gameAt(iso) {
  return new Game({
    seed: 7302,
    startDate: new Date(iso),
    playerOptions: { startPlaceId: null },
  });
}

function placeAtSashaHospital(game) {
  const sasha = game.npcs.get("sasha");
  let found = game.world.getPlace(sasha.locationId, sasha.currentPlaceId);
  let locationId = sasha.locationId;
  if (found?.key !== "hospital") {
    for (const location of game.world.locations.values()) {
      const hospital = location.places.find((place) => place.key === "hospital");
      if (hospital) {
        found = hospital;
        locationId = location.id;
        break;
      }
    }
  }
  assert.equal(found?.key, "hospital");
  game.moveTo(String(locationId));
  game.setCurrentPlace({ placeId: String(found.id) });
}

function choose(game, label) {
  const scene = buildScene(game);
  const choice = scene.sections.flatMap(({ choices }) => choices)
    .find((candidate) => candidate.label === label);
  assert.ok(choice, `Missing choice '${label}'`);
  return performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

function relationship(game) {
  const sasha = game.npcs.get("sasha");
  return game.player.getRelationshipProfile(sasha.id, sasha.relationshipProfile);
}

function sceneHasChoice(game, label) {
  return buildScene(game).sections.flatMap(({ choices }) => choices)
    .some((choice) => choice.label === label);
}

test("Sasha works weekday day shifts and is off duty in the evening and on days off", () => {
  const workday = gameAt("2026-09-03T10:00:00.000Z");
  placeAtSashaHospital(workday);
  assert.equal(workday.npcs.get("sasha").age, 36);
  assert.equal(sashaIsOnDuty(workday), true);
  for (const iso of ["2026-09-03T19:00:00.000Z", "2026-09-05T10:00:00.000Z"]) {
    const game = gameAt(iso);
    placeAtSashaHospital(game);
    assert.equal(sashaIsOnDuty(game), false, iso);
  }
});

test("injured hospital visitors meet Sasha once when they are on duty", () => {
  const game = gameAt("2026-09-03T10:00:00.000Z");
  placeAtSashaHospital(game);
  game.player.body.applyDamage({ partId: "hand_l", integrityDamage: 30 });
  assert.equal(resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace)?.id,
    "hospital.sasha.first-meeting");
  assert.equal(relationship(game).met, true);
  assert.equal(relationship(game).meters.get("interest").value, 1);
  const scene = buildScene(game);
  assert.match(JSON.stringify(scene.content), /Dr\. Sasha Volkov/);
  assert.match(JSON.stringify(scene.content), /welcome here anytime/);
  choose(game, "Thank them");
  assert.equal(resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace), null);
  assert.equal(relationship(game).meters.get("interest").value, 1);
});

test("treatment takes one hour per injured region and restores otherwise unrecoverable limbs", () => {
  const game = gameAt("2026-09-03T19:00:00.000Z");
  placeAtSashaHospital(game);
  game.player.setStatValue("energy", 0.5);
  const hand = game.player.body.getPart("hand_l");
  const arm = game.player.body.getPart("upper_arm_l");
  const chest = game.player.body.getPart("chest");
  game.player.body.applyDamage({ partId: "hand_l", integrityDamage: hand.maxIntegrity * 0.9 });
  game.player.body.applyDamage({ partId: "upper_arm_l", integrityDamage: 5 });
  game.player.body.applyDamage({ partId: "chest", integrityDamage: 7 });
  assert.deepEqual(injuredTreatmentRegions(game.player.body).map(({ id }) => id),
    ["torso", "left-arm"]);
  const choice = buildScene(game).sections.flatMap(({ choices }) => choices)
    .find(({ id }) => id === "hospital:treat");
  assert.equal(choice.durationMinutes, 120);
  const startedAt = game.now.getTime();
  const result = choose(game, "Get treatment (2 regions)");
  assert.equal(game.now.getTime() - startedAt, 120 * 60_000);
  assert.ok(game.player.getStatValue("energy") > 0.5);
  assert.equal(game.currentStory, null);
  for (const part of [hand, arm, chest]) {
    assert.equal(part.integrity, part.maxIntegrity);
    assert.equal(part.acutePain, 0);
    assert.equal(part.healingDelayMinutes, 0);
    assert.equal(part.conditions.size, 0);
  }
  assert.deepEqual(injuredTreatmentRegions(game.player.body), []);
  assert.match(result.paragraphs.join(" "), /hospital staff/);
  assert.equal(relationship(game).met, false);
  const repeat = buildScene(game).sections.flatMap(({ choices }) => choices)
    .find(({ id }) => id === "hospital:treat");
  assert.equal(repeat.enabled, false);
});

test("on-duty treatment uses Sasha's own care text", () => {
  const game = gameAt("2026-09-03T10:00:00.000Z");
  placeAtSashaHospital(game);
  game.player.body.applyDamage({ partId: "hand_r", integrityDamage: 10 });
  const result = choose(game, "Get treatment (1 region)");
  assert.match(result.paragraphs.join(" "), /Dr\. Volkov examines/);
  assert.match(result.paragraphs.join(" "), /Dr\. Sasha Volkov/);
  assert.equal(relationship(game).met, true);
  assert.equal(relationship(game).meters.get("interest").value, 1);
});

test("hospital wake-up introduces Sasha when on duty and defers it when absent", () => {
  for (const [iso, expectedMeeting] of [
    ["2026-09-03T10:00:00.000Z", true],
    ["2026-09-03T19:00:00.000Z", false],
  ]) {
    const game = gameAt(iso);
    placeAtSashaHospital(game);
    game.player.setStatValue("energy", 0.5);
    choose(game, "Leave");
    assert.equal(game.currentStory?.id, "interrupt.exhaustion.hospital");
    choose(game, "Next");
    assert.equal(game.currentPlace?.key, "hospital");
    choose(game, "Next");
    assert.equal(game.currentStory?.id === "hospital.sasha.first-meeting", expectedMeeting);
    assert.equal(relationship(game).met, expectedMeeting);
    if (!expectedMeeting) {
      assert.equal(game.hasFlag("hospital.awaiting_sasha_introduction"), true);
      game.jumpToDate("2026-09-07T10:00:00.000Z");
      placeAtSashaHospital(game);
      assert.equal(resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace)?.id,
        "hospital.sasha.first-meeting");
      assert.equal(relationship(game).met, true);
      assert.equal(game.hasFlag("hospital.awaiting_sasha_introduction"), false);
    }
  }
});

test("Sasha gives different injury advice for ordinary and unrecoverable damage", () => {
  for (const [damageFraction, expected] of [
    [0.2, /improve gradually with time/],
    [0.85, /too severe to mend on its own/],
  ]) {
    const game = gameAt("2026-09-03T10:00:00.000Z");
    placeAtSashaHospital(game);
    const hand = game.player.body.getPart("hand_l");
    game.player.body.applyDamage({
      partId: "hand_l",
      integrityDamage: hand.maxIntegrity * damageFraction,
    });
    resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
    choose(game, "Thank them");
    assert.equal(sceneHasChoice(game, "Ask Dr. Volkov about your injuries"), true);
    choose(game, "Ask Dr. Volkov about your injuries");
    assert.match(JSON.stringify(buildScene(game).content), expected);
    choose(game, "Thank them");
    assert.equal(relationship(game).meters.get("interest").value, 1);
  }
});

test("Sasha's work conversation is available once and interest cannot be farmed", () => {
  const game = gameAt("2026-09-03T10:00:00.000Z");
  placeAtSashaHospital(game);
  game.player.body.applyDamage({ partId: "hand_l", integrityDamage: 10 });
  resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
  choose(game, "Thank them");
  assert.equal(sceneHasChoice(game, "Ask Sasha about their work"), true);
  choose(game, "Ask Sasha about their work");
  assert.match(JSON.stringify(buildScene(game).content), /someone walks out of here/);
  assert.equal(relationship(game).meters.get("interest").value, 2);
  choose(game, "Let them get back to work");
  assert.equal(sceneHasChoice(game, "Ask Sasha about their work"), false);
  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.equal(sceneHasChoice(restored, "Ask Sasha about their work"), false);
  assert.equal(relationship(restored).meters.get("interest").value, 2);
});

test("Sasha follows up once when the player returns after treatment", () => {
  const game = gameAt("2026-09-03T10:00:00.000Z");
  placeAtSashaHospital(game);
  const hospitalId = String(game.currentPlaceId);
  game.player.body.applyDamage({ partId: "hand_l", integrityDamage: 10 });
  resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
  choose(game, "Thank them");
  choose(game, "Get treatment (1 region)");
  assert.equal(game.hasFlag("hospital.treatment_received"), true);
  assert.equal(game.hasFlag("hospital.sasha_followup_done"), false);
  choose(game, "Leave");
  const outside = buildScene(game);
  const reenter = outside.sections.flatMap(({ choices }) => choices)
    .find((choice) => choice.action?.type === "enter" &&
      String(choice.action.placeId) === hospitalId);
  assert.ok(reenter);
  performChoice(game, { sceneId: outside.id, choiceId: reenter.id });
  assert.equal(game.currentStory?.id, "hospital.sasha.follow-up");
  assert.equal(relationship(game).meters.get("interest").value, 2);
  assert.equal(game.hasFlag("hospital.sasha_followup_done"), true);
  choose(game, "Thank Sasha");
  game.setCurrentPlace();
  game.setCurrentPlace({ placeId: hospitalId });
  assert.equal(resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace), null);
  assert.equal(relationship(game).meters.get("interest").value, 2);
});
