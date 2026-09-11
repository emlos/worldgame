import test from "node:test";
import assert from "node:assert/strict";

import { PronounSets } from "../src/characters/core/pronouns.js";
import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { findCinemaScreening } from "../src/features/cinema/programme.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../src/story/wg/runtime/sceneExposure.js";

const CINEMA_SHIFT_AT = "2026-09-04T18:00:00.000Z";
const FIRST_SCHOOL_SHIFT_AT = "2026-09-01T08:00:00.000Z";
const NEXT_SCHOOL_SHIFT_AT = "2026-09-07T08:00:00.000Z";

function gameAt(iso, { money = 100 } = {}) {
  return new Game({
    seed: 7302,
    startDate: new Date(iso),
    playerOptions: { startPlaceId: null, money },
  });
}

function findPlace(game, placeKey) {
  for (const location of game.world.locations.values()) {
    const place = location.places.find((candidate) => candidate.key === placeKey);
    if (place) return { location, place };
  }
  throw new Error(`Generated world has no '${placeKey}' place`);
}

function placePlayerAt(game, placeKey) {
  const found = findPlace(game, placeKey);
  game.moveTo(String(found.location.id));
  game.setCurrentPlace({ placeId: String(found.place.id) });
  return found;
}

function choicesWithLabel(game, label) {
  return buildScene(game).sections
    .flatMap(({ choices }) => choices)
    .filter((choice) => choice.label === label);
}

function sceneText(game) {
  return buildScene(game).content
    .flatMap(({ parts = [] }) => parts)
    .map(({ text = "" }) => text)
    .join("");
}

function choose(game, label) {
  const choices = choicesWithLabel(game, label);
  assert.equal(choices.length, 1, `Expected one available choice '${label}'`);
  const scene = buildScene(game);
  return performChoice(game, { sceneId: scene.id, choiceId: choices[0].id });
}

function caroRelationship(game) {
  const caro = game.npcs.get("caro");
  return game.player.getRelationshipProfile(caro.id, caro.relationshipProfile);
}

function moveTaylorHome(game) {
  const taylor = game.npcs.get("taylor");
  taylor.setLocationAndPlace(taylor.homeLocationId, taylor.homePlaceId);
}

function enterCinemaIntroduction(game) {
  placePlayerAt(game, "cinema");
  return resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
}

test("Caro works at school on workdays and at the cinema on weekend evenings", () => {
  const cases = [
    ["2026-09-03T18:00:00.000Z", null],
    ["2026-09-04T18:00:00.000Z", "caro_part_time_cinema"],
    ["2026-09-05T18:00:00.000Z", "caro_part_time_cinema"],
    ["2026-09-06T18:00:00.000Z", "caro_part_time_cinema"],
    [NEXT_SCHOOL_SHIFT_AT, "caro_nurse_hours"],
  ];

  for (const [iso, obligationId] of cases) {
    const game = gameAt(iso);
    const caro = game.npcs.get("caro");
    assert.equal(
      caro.brain.getScheduleStatus(game.now).obligationId,
      obligationId,
      iso,
    );
  }
});

test("the cinema introduction requires both Caro's presence and her active shift", () => {
  const absent = gameAt(CINEMA_SHIFT_AT);
  placePlayerAt(absent, "cinema");
  const absentCaro = absent.npcs.get("caro");
  absentCaro.setLocationAndPlace(absentCaro.homeLocationId, absentCaro.homePlaceId);
  assert.equal(resolveWGAutomaticScene(absent, WG_AUTO_TRIGGER.enterPlace), null);

  const offDuty = gameAt("2026-09-03T18:00:00.000Z");
  placePlayerAt(offDuty, "cinema");
  const offDutyCaro = offDuty.npcs.get("caro");
  offDutyCaro.setLocationAndPlace(
    String(offDuty.currentLocationId),
    String(offDuty.currentPlaceId),
  );
  assert.equal(offDuty.getNPCsAtCurrentPosition().includes(offDutyCaro), true);
  assert.notEqual(
    offDutyCaro.brain.getScheduleStatus(offDuty.now).obligationId,
    "caro_part_time_cinema",
  );
  assert.equal(resolveWGAutomaticScene(offDuty, WG_AUTO_TRIGGER.enterPlace), null);

  const working = gameAt(CINEMA_SHIFT_AT);
  assert.equal(enterCinemaIntroduction(working)?.id, "cinema.caro.first-meeting");
});

test("Caro's cinema introduction happens once and survives saving", () => {
  const game = gameAt(CINEMA_SHIFT_AT);
  game.npcs.get("caro").pronouns = PronounSets.HE_HIM;
  assert.equal(enterCinemaIntroduction(game)?.id, "cinema.caro.first-meeting");
  assert.match(sceneText(game), /He catches one against his hip/);
  assert.equal(caroRelationship(game).met, true);
  assert.equal(caroRelationship(game).meters.get("rapport").value, 1);
  assert.equal(game.hasFlag("npc.caro.cinema_encountered"), true);

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.equal(restored.currentStory?.id, "cinema.caro.first-meeting");
  assert.equal(caroRelationship(restored).met, true);
  assert.equal(caroRelationship(restored).meters.get("rapport").value, 1);
  assert.equal(restored.hasFlag("npc.caro.cinema_encountered"), true);

  choose(restored, "Nice save");
  assert.equal(choicesWithLabel(restored, "Ask Caro what he recommends").length, 1);
  restored.setCurrentPlace();
  const { place } = findPlace(restored, "cinema");
  restored.setCurrentPlace({ placeId: String(place.id) });
  assert.equal(resolveWGAutomaticScene(restored, WG_AUTO_TRIGGER.enterPlace), null);
});

test("meeting Caro at school first unlocks her cinema recognition dialogue", () => {
  const game = gameAt(FIRST_SCHOOL_SHIFT_AT);
  game.npcs.get("caro").pronouns = PronounSets.HE_HIM;
  game.setFlag("high_school.first_visit_seen");
  placePlayerAt(game, "high_school");
  moveTaylorHome(game);

  choose(game, "Go to the school nurse's office");
  assert.equal(game.currentStory?.id, "school.caro.first-meeting");
  assert.match(sceneText(game), /Caro Novak/);
  assert.match(sceneText(game), /puts down his pen/);
  choose(game, "Nice to meet you");
  choose(game, "Leave");

  assert.equal(game.hasFlag("npc.caro.school_encountered"), true);
  assert.equal(caroRelationship(game).meters.get("rapport").value, 1);

  game.jumpToDate(CINEMA_SHIFT_AT);
  game.player.setStatValue("energy", 100);
  placePlayerAt(game, "cinema");
  assert.equal(
    resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace)?.id,
    "cinema.caro.school-recognition",
  );
  assert.match(sceneText(game), /Nurse Caro/);
  assert.match(sceneText(game), /recognise him/);
  assert.equal(game.hasFlag("npc.caro.cinema_encountered"), true);
  assert.equal(caroRelationship(game).meters.get("rapport").value, 2);
});

test("meeting Caro at the cinema first unlocks her school recognition dialogue", () => {
  const game = gameAt(CINEMA_SHIFT_AT);
  assert.equal(enterCinemaIntroduction(game)?.id, "cinema.caro.first-meeting");
  choose(game, "Nice save");

  game.jumpToDate(NEXT_SCHOOL_SHIFT_AT);
  game.player.setStatValue("energy", 100);
  game.setFlag("high_school.first_visit_seen");
  placePlayerAt(game, "high_school");
  moveTaylorHome(game);

  choose(game, "Go to the school nurse's office");
  assert.equal(game.currentStory?.id, "school.caro.cinema-recognition");
  assert.match(JSON.stringify(buildScene(game).content), /cinema uniform/);
  assert.equal(game.hasFlag("npc.caro.school_encountered"), true);
  assert.equal(caroRelationship(game).meters.get("rapport").value, 2);
});

test("Caro's counter interactions repeat and her ticket comment names the selected film", () => {
  const game = gameAt(CINEMA_SHIFT_AT);
  enterCinemaIntroduction(game);
  choose(game, "Nice save");

  assert.equal(choicesWithLabel(game, "Ask Caro what she recommends").length, 1);
  assert.equal(choicesWithLabel(game, "Buy popcorn from Caro").length, 1);
  choose(game, "Ask Caro what she recommends");
  choose(game, "Thanks, I think");
  assert.equal(choicesWithLabel(game, "Ask Caro what she recommends").length, 1);

  game.npcs.get("caro").pronouns = PronounSets.HE_HIM;
  const scene = buildScene(game);
  const screeningChoice = scene.sections
    .find(({ id }) => id === "screenings")
    .choices[0];
  assert.ok(screeningChoice);
  const screening = findCinemaScreening(
    game.seed,
    screeningChoice.action.screeningId,
    game.now,
  );
  const result = performChoice(game, {
    sceneId: scene.id,
    choiceId: screeningChoice.id,
  });

  assert.match(result.paragraphs[0], /Caro tears your ticket/);
  assert.match(result.paragraphs[0], new RegExp(screening.movie.title));
  assert.match(result.paragraphs[0], /he says/);
  assert.equal(game.storyContinuations[0].data.soldByCaro, true);
});
