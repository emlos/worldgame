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

test("slower movement does not evade an attack that resolves first", () => {
  function resolveAgainstHeadbutt(playerActionId) {
    const game = gameAtStart({ seed: 1 });
    const state = startEncounter(game);
    state.relationships.range[0].value = "clinch";
    state.npcIntent = {
      actorId: "mugger",
      actionId: "headbutt",
      parameters: { targetId: "player", sourcePartId: "head" },
    };
    chooseAction(game, playerActionId);
    return game.currentStory.system.state.lastEvents.find(
      ({ type, actorId, actionId, purpose }) =>
        type === "chance.rolled"
        && actorId === "mugger"
        && actionId === "headbutt"
        && purpose === "contest",
    );
  }

  const whileMoving = resolveAgainstHeadbutt("create-distance");
  const whileStriking = resolveAgainstHeadbutt("strike-face");

  assert.ok(whileMoving);
  assert.ok(whileStriking);
  assert.equal(whileMoving.roll, whileStriking.roll);
  assert.equal(whileMoving.chance, whileStriking.chance);
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

test("the mugging can build two holds, ground the player, and convert a grip into a pin", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);
  let sawTwoHolds = false;
  let sawGrounded = false;
  let sawPin = false;

  for (let index = 0; index < 16 && game.currentStory.system.state.phase === "active"; index += 1) {
    const state = game.currentStory.system.state;
    sawTwoHolds ||= state.relationships.holds.length === 2;
    sawGrounded ||= state.participants.player.pose !== "standing";
    sawPin ||= state.relationships.holds.some(({ kind }) => kind === "limb-pin");
    chooseAction(game, "cover-and-brace");
  }

  const state = game.currentStory.system.state;
  sawPin ||= state.relationships.holds.some(({ kind }) => kind === "limb-pin");
  assert.equal(sawTwoHolds, true);
  assert.equal(sawGrounded, true);
  assert.equal(sawPin, true);
  assert.equal(state.outcome.id, "theft-completed-player-conscious");
});

test("a grounded actor can roll to face the opponent and then stand", () => {
  const game = gameAtStart({ seed: 4 });
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.player.pose = "prone";
  state.participants.mugger.pose = "kneeling";
  state.relationships.facing.find(({ actor }) => actor === "player").value = "away";
  state.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };

  chooseAction(game, "roll-toward");
  assert.equal(game.currentStory.system.state.participants.player.pose, "supine");
  assert.equal(
    game.currentStory.system.state.relationships.facing.find(({ actor }) => actor === "player").value,
    "toward",
  );

  game.currentStory.system.state.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };
  chooseAction(game, "stand-up");
  assert.equal(game.currentStory.system.state.participants.player.pose, "standing");
});

test("headbutts carry self-damage while knee strikes apply acute pressure", () => {
  const headbutt = gameAtStart({ seed: 3 });
  headbutt.player.setSkillValue("strength", 10);
  let state = startEncounter(headbutt);
  state.relationships.range[0].value = "clinch";
  state.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };
  const ownHeadBefore = headbutt.player.body.getPart("head").health;
  const targetFaceBefore = headbutt.currentStory.actors.mugger.body.parts.find(
    ({ id }) => id === "face",
  ).health;

  chooseAction(headbutt, "headbutt");

  assert.ok(headbutt.player.body.getPart("head").health < ownHeadBefore);
  assert.ok(
    headbutt.currentStory.actors.mugger.body.parts.find(({ id }) => id === "face").health
      < targetFaceBefore,
  );

  const knee = gameAtStart({ seed: 1 });
  knee.player.setSkillValue("strength", 10);
  state = startEncounter(knee);
  state.relationships.range[0].value = "clinch";
  state.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };

  chooseAction(knee, "knee-strike");

  assert.ok(knee.currentStory.system.state.lastEvents.some(
    ({ type, actorId, id }) => type === "acute.applied" && actorId === "mugger" && id === "winded",
  ));
});
