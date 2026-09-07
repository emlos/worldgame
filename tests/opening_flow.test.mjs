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
  assert.equal(game.hasFlag("opening_seen"), true);
  const openingScene = buildScene(game);
  assert.equal(openingScene.heading, "A new beginning");
  assert.doesNotMatch(JSON.stringify(openingScene.content), /notice pinned/);

  choose(game, "Maybe this is a fresh start");
  assert.equal(game.currentStory?.locals?.outlook, "hopeful");
  assert.match(
    JSON.stringify(buildScene(game).content),
    /Reminders tracks obligations/,
  );
  choose(game, "Get up");

  assert.equal(game.currentStory, null);
  assert.equal(game.currentPlace?.key, "player_home");
  assert.match(JSON.stringify(buildScene(game).content), /notice pinned/);
  assert.equal(
    getEligibleWGAutomaticScenes(game, WG_AUTO_TRIGGER.enterPlace).some(
      (scene) => scene.id === "story.opening.new-home",
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
  assert.equal(game.hasFlag("school_first_visit_seen"), true);
  const firstVisitScene = buildScene(game);
  assert.match(JSON.stringify(firstVisitScene.content), /Open the Planner button to review/);

  choose(game, "Look around");
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

test("Taylor's introduction is not offered while class is in session", () => {
  const game = new Game({
    seed: 117,
    startDate: new Date("2026-09-01T09:30:00.000Z"),
  });
  game.setFlag("school_first_visit_seen");
  placePlayerAndTaylorAtSchool(game);

  assert.equal(
    findChoiceByLabel(buildScene(game), "Introduce yourself to Taylor"),
    undefined,
  );
});
