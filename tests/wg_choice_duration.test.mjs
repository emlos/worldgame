import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../src/story/wg/runtime/storyRuntime.js";

test("compacted zero-duration checked outcomes materialize as zero", () => {
  const game = new Game({
    seed: 723,
    startDate: new Date("2026-09-02T09:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });

  game.runAction({
    label: "Enter checked WG scene",
    apply(currentGame) {
      enterWGScene(currentGame, "school.english.event.reading-aloud");
    },
    after(currentGame) {
      resolveActiveWGStory(currentGame);
    },
  });

  const scene = buildScene(game);
  const choice = scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.id === "reading-volunteer");

  assert.ok(choice, "expected the checked reading-volunteer choice");
  assert.equal(choice.durationMinutes, 0);
  assert.equal(choice.action.outcomes.success.durationMinutes, 0);
  assert.equal(choice.action.outcomes.failure.durationMinutes, 0);
});
