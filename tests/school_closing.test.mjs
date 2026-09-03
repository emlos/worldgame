import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";

function placePlayerAtHighSchool(game) {
  for (const location of game.world.locations.values()) {
    const school = (location.places || []).find(
      (place) => place.key === "high_school",
    );
    if (!school) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(school.id) });
    return school;
  }
  throw new Error("The generated test world has no high school");
}

test("waiting until school closes leaves a valid outdoor scene", () => {
  const game = new Game({
    seed: 902,
    startDate: new Date("2026-09-03T16:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  const school = placePlayerAtHighSchool(game);
  const schoolScene = buildScene(game);
  const waitChoice = schoolScene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.id === "after-school-wait");

  assert.ok(waitChoice, "expected the after-school waiting choice");
  assert.equal(waitChoice.durationMinutes, 60);

  const result = performChoice(game, {
    sceneId: schoolScene.id,
    choiceId: waitChoice.id,
  });

  assert.equal(game.now.toISOString(), "2026-09-03T17:00:00.000Z");
  assert.equal(game.currentPlace, null);
  assert.equal(game.currentStory, null);
  assert.match(result.notice, new RegExp(`${school.name} has closed`));

  const outdoorScene = buildScene(game);
  assert.equal(outdoorScene.kind, "location");
});
