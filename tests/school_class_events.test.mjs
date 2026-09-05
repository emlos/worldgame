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
  { subject: "english", at: "09:30", choiceId: "english-3-study" },
  { subject: "math", at: "10:30", choiceId: "math-3-study" },
  { subject: "history", at: "11:30", choiceId: "history-3-study" },
  { subject: "science", at: "13:30", choiceId: "science-3-study" },
  { subject: "art", at: "14:30", choiceId: "art-3-study" },
  {
    subject: "physical_education",
    storySubject: "physical-education",
    at: "15:30",
    choiceId: "physical-education-3-study",
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

for (const fixture of FINAL_SEGMENTS) {
  test(`${fixture.subject} can trigger an event after its third segment`, () => {
    const storySubject = fixture.storySubject || fixture.subject;
    const game = new Game({
      seed: 917,
      startDate: new Date(`2026-09-03T${fixture.at}:00.000Z`),
      playerOptions: { startPlaceId: null },
    });
    placePlayerAtHighSchool(game);
    enterWGScene(game, `school.class.${storySubject}`);
    resolveActiveWGStory(game);

    const classScene = buildScene(game);
    assert.equal(game.currentStory?.passageId, "segment-3");
    assert.ok(
      classScene.sections
        .flatMap((section) => section.choices)
        .some((choice) => choice.id === fixture.choiceId),
      `expected final-segment choice '${fixture.choiceId}'`,
    );

    performChoice(game, {
      sceneId: classScene.id,
      choiceId: fixture.choiceId,
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
