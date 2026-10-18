import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../src/story/wg/runtime/storyRuntime.js";

const FINAL_SEGMENTS = [
  { subject: "english", at: "2026-09-02T09:30:00.000Z", choiceLabel: "Study hard" },
  { subject: "math", at: "2026-09-01T09:30:00.000Z", choiceLabel: "Study hard" },
  { subject: "history", at: "2026-09-01T10:30:00.000Z", choiceLabel: "Study hard" },
  { subject: "science", at: "2026-09-01T11:30:00.000Z", choiceLabel: "Study hard" },
  { subject: "art", at: "2026-09-01T13:00:00.000Z", choiceLabel: "Study hard" },
  {
    subject: "physical_education",
    storySubject: "physical-education",
    at: "2026-09-01T14:00:00.000Z",
    choiceLabel: "Train hard",
  },
];

function placePlayerAtHighSchool(game) {
  for (const location of game.world.locations.values()) {
    const school = (location.places || []).find(
      (place) => place.key === "high_school",
    );
    if (!school) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(school.id) });
    return;
  }
  throw new Error("The generated test world has no high school");
}

function schoolEventGame(sceneId, stats = {}) {
  const game = new Game({
    seed: 917,
    startDate: new Date("2026-09-01T09:30:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  placePlayerAtHighSchool(game);
  for (const [name, value] of Object.entries(stats)) {
    game.player.setStatValue(name, value);
  }
  enterWGScene(game, sceneId);
  resolveActiveWGStory(game);
  return game;
}

test("high stress makes the math board problem harder while leaving a quiet approach", () => {
  for (const [stress, difficulty] of [[59, "tricky"], [60, "difficult"]]) {
    const game = schoolEventGame("school.math.event.problem-solving", { stress });
    const choices = buildScene(game).sections.flatMap((section) => section.choices);
    assert.equal(choices.filter((entry) => entry.label === "Raise your hand").length, 1);
    assert.equal(
      choices.find((entry) => entry.label === "Raise your hand").skillCheck.difficultyId,
      difficulty,
    );
    assert.ok(choices.some((entry) => entry.label === "Stay quiet"));
  }
});

test("low hygiene has a contextual social cost during math group work", () => {
  for (const [hygiene, stressCost] of [[40, 0], [39, 1], [14, 3]]) {
    const game = schoolEventGame("school.math.event.group-work", { hygiene });
    assert.equal(game.player.getStatValue("stress"), stressCost);
    assert.ok(buildScene(game).sections.flatMap((section) => section.choices)
      .some((entry) => entry.label === "Share your ideas"));
  }
});

for (const fixture of FINAL_SEGMENTS) {
  test(`${fixture.subject} can trigger an event after its third segment`, () => {
    const storySubject = fixture.storySubject || fixture.subject;
    const game = new Game({
      seed: 917,
      startDate: new Date(fixture.at),
      playerOptions: { startPlaceId: null },
    });
    placePlayerAtHighSchool(game);
    enterWGScene(game, `school.class.${storySubject}`);
    resolveActiveWGStory(game);

    const classScene = buildScene(game);
    assert.equal(game.currentStory?.passageId, "segment-3");
    const choice = classScene.sections
      .flatMap((section) => section.choices)
      .find((candidate) => candidate.label === fixture.choiceLabel);
    assert.ok(choice, `expected final-segment choice '${fixture.choiceLabel}'`);

    performChoice(game, {
      sceneId: classScene.id,
      choiceId: choice.id,
    });

    assert.equal(game.storyContinuations.length, 1);
    assert.equal(
      game.storyContinuations[0].poolId,
      `school.class.${storySubject}`,
    );
    assert.match(
      game.currentStory?.id || "",
      new RegExp(`^school\\.${storySubject}\\.event\\.`),
    );
  });
}
