import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  chooseAction,
  gameAtStart,
  startEncounter,
} from "./support/encounter.mjs";

test("an exchange consumes its slower action duration and advances once", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  const startedAt = game.now.getTime();
  const choice = chooseAction(game, "cover-and-brace");

  assert.equal(choice.durationMinutes * 60, 2);
  assert.equal(game.now.getTime() - startedAt, 2_000);
  assert.equal(state.exchange, 0);
  assert.equal(game.currentStory.system.state.exchange, 1);
  assert.equal(game.currentStory.system.state.elapsedSeconds, 2);
  assert.equal(game.actionRevision, 1);
});

test("a simultaneous move can evade the telegraphed grab", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);
  chooseAction(game, "create-distance");

  const state = game.currentStory.system.state;
  assert.equal(state.relationships.range[0].value, "far");
  assert.deepEqual(state.relationships.holds, []);
  assert.equal(state.npcIntent.actionId, "close-distance");
  assert.ok(state.lastEvents.some(({ type }) => type === "range.changed"));
  assert.ok(state.lastEvents.some(
    ({ type, actorId, actionId }) =>
      type === "action.failed" && actorId === "mugger" && actionId === "grab-arm",
  ));
});

test("landed strikes persist damage on the temporary actor body", () => {
  const game = gameAtStart({ seed: 1 });
  game.player.setSkillValue("strength", 10);
  startEncounter(game);
  const faceBefore = game.currentStory.actors.mugger.body.parts
    .find(({ id }) => id === "face").health;

  chooseAction(game, "strike-face");

  const faceAfter = game.currentStory.actors.mugger.body.parts
    .find(({ id }) => id === "face").health;
  assert.ok(faceAfter < faceBefore);
  assert.match(JSON.stringify(buildScene(game).content), /blow lands/i);
});

