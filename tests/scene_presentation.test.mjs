import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { presentScene } from "../src/ui/browser/scenePresentation.js";

function gameWithAnnouncement() {
  const game = new Game({
    seed: 441,
    startDate: new Date("2026-09-04T12:00:00.000Z"),
  });
  game.currentStory = null;
  game.dailyAnnouncements = {
    day: game.now.toISOString().slice(0, 10),
    items: [{ id: "test", tone: "info", text: "Test announcement" }],
  };
  return game;
}

test("scene presentation acknowledges alerts only after rendering succeeds", () => {
  const game = gameWithAnnouncement();
  let observedPendingAnnouncements = null;
  let observedPrelude = null;

  const scene = presentScene(
    game,
    (renderedScene, preludeParagraphs) => {
      observedPendingAnnouncements = game.dailyAnnouncements.items.length;
      observedPrelude = preludeParagraphs;
      assert.equal(renderedScene.alerts.length, 1);
      assert.equal(renderedScene.alerts[0].text, "Test announcement");
    },
    ["Previous action response"],
  );

  assert.equal(observedPendingAnnouncements, 1);
  assert.deepEqual(observedPrelude, ["Previous action response"]);
  assert.equal(scene.alerts.length, 1);
  assert.deepEqual(game.dailyAnnouncements.items, []);
});

test("failed scene rendering does not consume pending alerts", () => {
  const game = gameWithAnnouncement();

  assert.throws(
    () => presentScene(game, () => {
      throw new Error("render failed");
    }),
    /render failed/,
  );

  assert.equal(game.dailyAnnouncements.items.length, 1);
  assert.equal(game.dailyAnnouncements.items[0].text, "Test announcement");
});
