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
