import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  getEligibleWGAutomaticScenes,
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../src/story/wg/runtime/sceneExposure.js";

function findChoiceByLabel(scene, label) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.label === label);
}

function choose(game, label) {
  const scene = buildScene(game);
  const choice = findChoiceByLabel(scene, label);
  assert.ok(choice, `Expected choice '${label}' in '${scene.id}'`);
  performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

function findPlace(game, placeKey) {
  for (const location of game.world.locations.values()) {
    const place = location.places.find((candidate) => candidate.key === placeKey);
    if (place) return { location, place };
  }
  throw new Error(`The generated test world has no '${placeKey}' place`);
}

test("a new browser game can enter the one-time home opening", () => {
  const game = new Game({
    seed: 117,
    startDate: new Date("2026-09-01T07:00:00.000Z"),
  });

  assert.equal(game.currentPlace?.key, "player_home");
  const opening = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);

  assert.equal(opening?.id, "story.opening.new-home");
  assert.equal(game.currentStory?.id, "story.opening.new-home");
  assert.equal(game.hasFlag("home.opening_seen"), false);
  const openingScene = buildScene(game);
  assert.equal(openingScene.heading, "A new beginning");
  assert.doesNotMatch(
    JSON.stringify([openingScene.content, openingScene.alerts]),
    /Today is a school day/,
  );

  choose(game, "Maybe this is a fresh start");
  assert.equal(game.currentStory?.locals?.outlook, "hopeful");
  assert.match(
    JSON.stringify(buildScene(game).content),
    /Reminders tracks obligations/,
  );
  choose(game, "Get up");

  assert.equal(game.currentStory, null);
  assert.equal(game.currentPlace?.key, "player_home");
  assert.equal(game.hasFlag("home.opening_seen"), true);
  const homeScene = buildScene(game);
  assert.match(JSON.stringify(homeScene.content), /Today is a school day/);
  assert.doesNotMatch(JSON.stringify(homeScene.content), /notice has been pinned/);
  assert.equal(
    getEligibleWGAutomaticScenes(game, WG_AUTO_TRIGGER.enterPlace).some(
      (scene) => scene.id === "story.opening.new-home",
    ),
    false,
  );

  game.setCurrentPlace();
  assert.doesNotMatch(
    JSON.stringify(buildScene(game).content),
    /notice has been pinned/,
  );
  game.jumpToDate("2026-09-01T13:00:00.000Z");
  const outsideHome = buildScene(game);
  assert.match(JSON.stringify(outsideHome.content), /notice has been pinned/);
  assert.ok(
    outsideHome.sections
      .flatMap((section) => section.choices)
      .some((choice) => choice.label === "Check the notice on the door"),
  );
});

test("entering school triggers its guidance only on the first visit", () => {
  const game = new Game({
    seed: 117,
    startDate: new Date("2026-09-01T08:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  const { location, place } = findPlace(game, "high_school");
  game.moveTo(String(location.id));

  const outside = buildScene(game);
  const enter = outside.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.id === `enter:${place.id}`);
  assert.ok(enter);
  performChoice(game, { sceneId: outside.id, choiceId: enter.id });

  assert.equal(game.currentStory?.id, "school.first-visit");
  assert.equal(game.hasFlag("high_school.first_visit_seen"), true);
  const firstVisitScene = buildScene(game);
  assert.match(JSON.stringify(firstVisitScene.content), /student council office/);

  game.teleportNPC("taylor", "player");
  choose(game, "Look around");
  assert.equal(game.currentStory?.id, "school.taylor.first-meeting.traversal");
  assert.equal(game.hasFlag("journal.taylor_met"), true);

  choose(game, "See you around");
  assert.equal(game.currentStory, null);
  assert.equal(game.currentPlace?.key, "high_school");
  assert.equal(
    getEligibleWGAutomaticScenes(game, WG_AUTO_TRIGGER.enterPlace).some(
      (scene) => scene.id === "school.first-visit",
    ),
    false,
  );
});

function placePlayerAndTaylorAtSchool(game) {
  const { location, place } = findPlace(game, "high_school");
  game.moveTo(String(location.id));
  game.setCurrentPlace({ placeId: String(place.id) });
  game.teleportNPC("taylor", "player");
}

test("entering school introduces Taylor once when Taylor is present", () => {
  const game = new Game({
    seed: 117,
    startDate: new Date("2026-09-01T08:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  game.setFlag("high_school.first_visit_seen");
  const { location, place } = findPlace(game, "high_school");
  game.moveTo(String(location.id));
  game.npcs.get("taylor").setLocationAndPlace(
    String(location.id),
    String(place.id),
  );

  const outside = buildScene(game);
  const enterSchool = outside.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.id === `enter:${place.id}`);
  assert.ok(enterSchool);
  performChoice(game, {
    sceneId: outside.id,
    choiceId: enterSchool.id,
  });

  assert.equal(game.currentStory?.id, "school.taylor.first-meeting");
  assert.equal(game.hasFlag("journal.taylor_met"), true);
  choose(game, "See you around");

  game.setCurrentPlace();
  const outsideAgain = buildScene(game);
  const reenterSchool = outsideAgain.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.id === `enter:${place.id}`);
  assert.ok(reenterSchool);
  performChoice(game, {
    sceneId: outsideAgain.id,
    choiceId: reenterSchool.id,
  });
  assert.equal(game.currentStory, null);
});

test("Taylor's introduction interrupts internal travel and resumes its destination", () => {
  const game = new Game({
    seed: 117,
    startDate: new Date("2026-09-01T08:00:00.000Z"),
  });
  game.setFlag("high_school.first_visit_seen");
  placePlayerAndTaylorAtSchool(game);

  choose(game, "Go to the school nurse's office");

  assert.equal(game.currentStory?.id, "school.taylor.first-meeting.traversal");
  assert.equal(game.storyContinuations.length, 1);
  assert.equal(
    game.storyContinuations[0].target,
    "place.high-school.nurse-office",
  );
  assert.equal(game.hasFlag("journal.taylor_met"), true);

  choose(game, "See you around");

  assert.equal(game.currentStory?.id, "place.high-school.nurse-office");
  assert.equal(game.storyContinuations.length, 0);
  assert.match(JSON.stringify(buildScene(game).content), /Nurse Caro|nurse's chair/);
});

test("Taylor's introduction requires Taylor to be present", () => {
  const game = new Game({
    seed: 117,
    startDate: new Date("2026-09-01T08:00:00.000Z"),
  });
  game.setFlag("high_school.first_visit_seen");
  const { location, place } = findPlace(game, "high_school");
  game.moveTo(String(location.id));
  game.setCurrentPlace({ placeId: String(place.id) });

  assert.equal(
    resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace),
    null,
  );

  choose(game, "Go to the school nurse's office");
  assert.equal(game.currentStory?.id, "place.high-school.nurse-office");
  assert.equal(game.hasFlag("journal.taylor_met"), false);
});

test("Taylor's introduction does not interrupt school travel during class", () => {
  const game = new Game({
    seed: 117,
    startDate: new Date("2026-09-01T09:30:00.000Z"),
  });
  game.setFlag("high_school.first_visit_seen");
  placePlayerAndTaylorAtSchool(game);

  choose(game, "Go to the school nurse's office");
  assert.equal(game.currentStory?.id, "place.high-school.nurse-office");
  assert.equal(game.hasFlag("journal.taylor_met"), false);
});
