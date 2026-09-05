import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { WG_BUNDLE } from "../src/story/wg/generated/scenes.js";

const CAFE_SHIFT_SCENE_IDS = [
  "cafe.job.shift.cleanup",
  "cafe.job.shift.mistake",
  "cafe.job.shift.routine",
  "cafe.job.shift.rowdy-customer",
];

function placePlayerAtCafe(game) {
  for (const location of game.world.locations.values()) {
    const cafe = (location.places || []).find((place) => place.key === "cafe");
    if (!cafe) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(cafe.id) });
    return cafe;
  }
  throw new Error("The generated test world has no cafe");
}

function createCafeGame(at = "2026-09-03T15:00:00.000Z", seed = 411) {
  const game = new Game({
    seed,
    startDate: new Date(at),
    playerOptions: { startPlaceId: null },
  });
  placePlayerAtCafe(game);
  return game;
}

function choices(game) {
  return buildScene(game).sections.flatMap((section) => section.choices);
}

function choice(game, id) {
  return choices(game).find((candidate) => candidate.id === id) || null;
}

function choose(game, id) {
  const scene = buildScene(game);
  const selected = scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.id === id);
  assert.ok(selected, `expected choice '${id}' in '${scene.id}'`);
  performChoice(game, { sceneId: scene.id, choiceId: id });
}

function continueScene(game) {
  const scene = buildScene(game);
  const available = scene.sections.flatMap((section) => section.choices);
  assert.equal(available.length, 1, "expected one continuation choice");
  performChoice(game, { sceneId: scene.id, choiceId: available[0].id });
}

test("the cafe offers unemployed players a job they can decline", () => {
  const game = createCafeGame();

  assert.ok(choice(game, "ask-for-work"));
  assert.equal(choice(game, "work-shift"), null);

  choose(game, "ask-for-work");
  assert.ok(choice(game, "accept"));
  assert.ok(choice(game, "decline"));
  choose(game, "decline");

  assert.equal(game.flags.has("cafe_employee"), false);
  assert.equal(game.reminders.has("cafe_job"), false);

  continueScene(game);
  assert.ok(choice(game, "ask-for-work"), "declining should leave the offer open");
});

test("accepting the cafe job adds its reminder and enables paid one-hour shifts", () => {
  const game = createCafeGame();

  choose(game, "ask-for-work");
  choose(game, "accept");

  assert.equal(game.flags.has("cafe_employee"), true);
  assert.equal(game.reminders.has("cafe_job"), true);

  continueScene(game);
  assert.equal(choice(game, "ask-for-work"), null);
  assert.ok(choice(game, "work-shift"));

  const cafeId = game.currentPlace.id;
  game.setCurrentPlace();
  game.setCurrentPlace({ placeId: cafeId });
  assert.equal(game.currentStory, null, "re-entering should exercise the normal place-hub path");

  const work = choice(game, "work-shift");
  assert.ok(work);
  assert.equal(work.durationMinutes, 60);
  assert.deepEqual(work.effectsPreview, [
    {
      type: "money",
      amount: 7,
      label: "£7 wages",
      direction: "increase",
    },
  ]);

  const before = game.now.getTime();
  choose(game, "work-shift");

  assert.equal(game.now.getTime() - before, 60 * 60_000);
  assert.equal(game.player.money, 7);
  assert.ok(CAFE_SHIFT_SCENE_IDS.includes(game.currentStory?.id));
  assert.equal(game.storyContinuations.length, 1);

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.equal(restored.player.money, 7);
  assert.equal(restored.flags.has("cafe_employee"), true);
  assert.equal(restored.reminders.has("cafe_job"), true);
  assert.equal(restored.currentStory.id, game.currentStory.id);
  assert.equal(restored.storyContinuations.length, 1);
});

test("cafe shifts have four equally weighted events", () => {
  const poolScenes = Object.values(WG_BUNDLE.scenes)
    .filter((scene) => scene.pools?.includes("cafe.job.shift"))
    .sort((left, right) => left.id.localeCompare(right.id));

  assert.deepEqual(poolScenes.map((scene) => scene.id), CAFE_SHIFT_SCENE_IDS);
  assert.ok(poolScenes.every((scene) => (scene.weight ?? 1) === 1));
  assert.ok(poolScenes.every((scene) => scene.placeKeys.includes("cafe")));
});

test("cafe shifts can start from 07:00 through exactly 21:00", () => {
  const cases = [
    ["2026-09-03T06:59:00.000Z", false],
    ["2026-09-03T07:00:00.000Z", true],
    ["2026-09-03T20:59:00.000Z", true],
    ["2026-09-03T21:00:00.000Z", true],
    ["2026-09-03T21:01:00.000Z", false],
    ["2026-09-03T22:00:00.000Z", false],
  ];

  for (const [at, expected] of cases) {
    const game = createCafeGame(at);
    game.setFlag("cafe_employee", true);
    assert.equal(Boolean(choice(game, "work-shift")), expected, at);
  }
});
