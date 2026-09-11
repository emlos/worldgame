import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import {
  NEW_GAME_SEED,
  NEW_GAME_START_ISO,
} from "../src/game/newGameConfig.js";
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

function hasMetTaylor(game) {
  const taylor = game.npcs.get("taylor");
  return game.player.getRelationshipProfile(
    taylor.id,
    taylor.relationshipProfile,
  ).met;
}

test("the configured August 31 game enters a one-time day-before-school opening", () => {
  const game = new Game({
    seed: NEW_GAME_SEED,
    startDate: new Date(NEW_GAME_START_ISO),
  });

  assert.equal(game.now.toISOString(), "2026-08-31T07:00:00.000Z");
  assert.equal(game.currentPlace?.key, "player_home");
  assert.equal(game.dailyAnnouncements.day, "2026-08-31");
  assert.equal(game.dailyAnnouncements.items.length, 1);
  assert.match(game.dailyAnnouncements.items[0].text, /School starts tomorrow/);
  assert.doesNotMatch(game.dailyAnnouncements.items[0].text, /Today is a school day/);
  const opening = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);

  assert.equal(opening?.id, "story.opening.new-home");
  assert.equal(game.currentStory?.id, "story.opening.new-home");
  assert.equal(game.hasFlag("home.opening_seen"), false);
  const openingScene = buildScene(game);
  assert.equal(openingScene.heading, "A new beginning");
  assert.match(JSON.stringify(openingScene.content), /school begins tomorrow/i);
  assert.match(JSON.stringify(openingScene.content), /before term begins/i);
  assert.doesNotMatch(
    JSON.stringify([openingScene.content, openingScene.alerts]),
    /Today is a school day/,
  );
  assert.deepEqual(openingScene.alerts, []);

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
  assert.equal(homeScene.alerts.length, 1);
  assert.match(
    JSON.stringify(homeScene.alerts),
    /School starts tomorrow/,
  );
  assert.doesNotMatch(
    JSON.stringify(homeScene.alerts),
    /Today is a school day/,
  );
  assert.doesNotMatch(
    JSON.stringify(homeScene.content),
    /Today is a school day/,
  );
  assert.doesNotMatch(JSON.stringify(homeScene.content), /notice has been pinned/);
  assert.equal(
    getEligibleWGAutomaticScenes(game, WG_AUTO_TRIGGER.enterPlace).some(
      (scene) => scene.id === "story.opening.new-home",
    ),
    false,
  );

  game.dismissDailyAnnouncements();
  assert.deepEqual(buildScene(game).alerts, []);

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

test("the one-time home neighbour is a stable temporary actor", () => {
  const game = new Game({
    seed: 7719,
    startDate: new Date(NEW_GAME_START_ISO),
  });
  game.setFlag("home.opening_seen");

  const entered = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
  assert.equal(entered?.id, "home.neighbour-introduction");
  assert.equal(game.hasFlag("home.neighbour_introduction_seen"), true);

  const actor = game.currentStory?.actors?.neighbour;
  assert.ok(actor);
  assert.equal(actor.alias, "neighbour");
  assert.equal(actor.profileId, "civilian");
  assert.match(actor.title, /^(Man|Woman|Person) 1$/);
  assert.ok(actor.age >= 18);
  assert.ok(actor.stats.strength >= 0 && actor.stats.strength <= 10);
  assert.ok(Array.isArray(actor.body.parts));
  assert.equal([...game.npcs.values()].some((npc) => npc.id === actor.id), false);

  const actorSnapshot = structuredClone(actor);
  const firstRender = JSON.stringify(buildScene(game).content);
  assert.match(firstRender, new RegExp(actor.noun, "i"));
  assert.match(firstRender, new RegExp(actor.pronouns.subject, "i"));
  assert.deepEqual(game.currentStory.actors.neighbour, actorSnapshot);
  buildScene(game);
  assert.deepEqual(game.currentStory.actors.neighbour, actorSnapshot);

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.deepEqual(restored.currentStory.actors.neighbour, actorSnapshot);
  assert.equal(JSON.stringify(buildScene(restored).content), firstRender);

  choose(restored, "Next");
  assert.equal(restored.currentStory, null);
  assert.equal(
    getEligibleWGAutomaticScenes(restored, WG_AUTO_TRIGGER.enterPlace).some(
      (scene) => scene.id === "home.neighbour-introduction",
    ),
    false,
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
  assert.equal(hasMetTaylor(game), true);

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
  assert.equal(hasMetTaylor(game), true);
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
    "school.caro.first-meeting",
  );
  assert.equal(hasMetTaylor(game), true);

  choose(game, "See you around");

  assert.equal(game.currentStory?.id, "school.caro.first-meeting");
  assert.equal(game.storyContinuations.length, 0);
  choose(game, "Nice to meet you");
  assert.equal(game.currentStory?.id, "place.high-school.nurse-office");
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
  assert.equal(game.currentStory?.id, "school.caro.first-meeting");
  assert.equal(hasMetTaylor(game), false);
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
  assert.equal(hasMetTaylor(game), false);
});

test("Taylor's class interactions stay hidden until the player has met her", () => {
  const game = new Game({
    seed: 117,
    startDate: new Date("2026-09-01T09:30:00.000Z"),
  });
  game.setFlag("high_school.first_visit_seen");
  placePlayerAndTaylorAtSchool(game);

  const school = buildScene(game);
  const attend = school.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.label.startsWith("Attend "));
  assert.ok(attend, "expected a class to be in progress");
  performChoice(game, { sceneId: school.id, choiceId: attend.id });

  const labelsBeforeMeeting = buildScene(game).sections
    .flatMap((section) => section.choices)
    .map((choice) => choice.label);
  assert.equal(labelsBeforeMeeting.includes("Chat with Taylor"), false);

  const taylor = game.npcs.get("taylor");
  game.player.adjustRelationshipMeter(
    taylor.id,
    "friendship",
    1,
    taylor.relationshipProfile,
  );
  const labelsAfterMeeting = buildScene(game).sections
    .flatMap((section) => section.choices)
    .map((choice) => choice.label);
  assert.equal(labelsAfterMeeting.includes("Chat with Taylor"), true);
});
