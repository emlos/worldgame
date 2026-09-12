import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import { getAvailableActionInstances } from "../src/features/encounter/availability.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  chooseAction,
  gameAtStart,
  startEncounter,
} from "./support/encounter.mjs";

function forceNpcIntent(game, actionId) {
  const state = game.currentStory.system.state;
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const instance = getAvailableActionInstances(context, "mugger")
    .find((candidate) => candidate.actionId === actionId);
  assert.ok(instance, `expected NPC encounter action '${actionId}'`);
  state.npcIntent = {
    actorId: instance.actorId,
    actionId: instance.actionId,
    parameters: { targetId: instance.targetId, ...instance.parameters },
  };
}

function npcContestEvent(game, actionId) {
  return game.currentStory.system.state.lastEvents.find(
    ({ type, actorId, actionId: eventActionId, purpose }) =>
      type === "chance.rolled"
      && actorId === "mugger"
      && eventActionId === actionId
      && purpose === "contest",
  );
}

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

test("surviving objective progress resets the commitment stall clock", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);

  chooseAction(game, "cover-and-brace");
  assert.equal(game.currentStory.system.state.objective.lastProgressSecond, 0);
  chooseAction(game, "cover-and-brace");

  const state = game.currentStory.system.state;
  assert.equal(state.relationships.holds.length, 1);
  assert.equal(state.objective.lastProgressSecond, state.elapsedSeconds);
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

test("creating distance clears stale wall support", () => {
  const game = gameAtStart({ seed: 1 });
  const state = startEncounter(game);
  state.participants.player.support = "wall";
  state.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };

  chooseAction(game, "create-distance");

  const next = game.currentStory.system.state;
  assert.equal(next.participants.player.support, "free");
  assert.ok(next.lastEvents.some(
    ({ type, actorId, from, to }) =>
      type === "support.changed"
      && actorId === "player"
      && from === "wall"
      && to === "free",
  ));
  assert.match(JSON.stringify(buildScene(game).content), /move clear of the wall/i);
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

test("equal-speed contests read the shared pre-exchange snapshot", () => {
  function resolveAgainst(playerActionId) {
    const game = gameAtStart({ seed: 2 });
    game.player.setSkillValue("strength", 10);
    startEncounter(game);
    forceNpcIntent(game, "drive-body");
    chooseAction(game, playerActionId);
    return {
      contest: npcContestEvent(game, "drive-body"),
      events: game.currentStory.system.state.lastEvents,
    };
  }

  const simultaneous = resolveAgainst("drive-body");
  const npcFirst = resolveAgainst("shove-away");

  assert.ok(simultaneous.events.some(
    ({ type, actorId, targetId }) =>
      type === "impact.landed" && actorId === "player" && targetId === "mugger",
  ));
  assert.ok(simultaneous.contest);
  assert.ok(npcFirst.contest);
  assert.equal(simultaneous.contest.roll, npcFirst.contest.roll);
  assert.equal(simultaneous.contest.chance, npcFirst.contest.chance);
});

test("simultaneous incapacitation is an explicit mutual outcome", () => {
  const game = gameAtStart({ seed: 2 });
  game.player.setSkillValue("strength", 10);
  const state = startEncounter(game);
  Object.assign(game.currentStory.actors.mugger.stats, {
    strength: 10,
    endurance: 0,
    resolve: 0,
  });
  game.player.body.getPart("abdomen").pain = 70;
  game.currentStory.actors.mugger.body.parts
    .find(({ id }) => id === "abdomen").pain = 70;
  forceNpcIntent(game, "drive-body");

  chooseAction(game, "drive-body");

  assert.equal(state.outcome, null);
  assert.deepEqual(game.currentStory.system.state.outcome, {
    id: "both-incapacitated",
    moneyLost: 0,
  });
  assert.equal(
    game.currentStory.system.state.lastEvents
      .filter(({ type, partId }) => type === "impact.landed" && partId === "abdomen")
      .length,
    2,
  );
  assert.match(JSON.stringify(buildScene(game).content), /both of you unable to continue/i);
});

test("directly conflicting simultaneous position changes cancel", () => {
  const game = gameAtStart({ seed: 9 });
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.player.pose = "supine";
  state.participants.mugger.pose = "kneeling";
  state.relationships.facing.find(({ actor }) => actor === "player").value = "side";
  state.relationships.holds.push({
    id: "hold-facing-conflict",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 50,
  });
  forceNpcIntent(game, "turn-target-away");

  chooseAction(game, "roll-toward");

  const next = game.currentStory.system.state;
  assert.equal(
    next.relationships.facing.find(({ actor }) => actor === "player").value,
    "side",
  );
  assert.ok(next.lastEvents.some(
    ({ type, path }) =>
      type === "state.change-conflicted" && path === "relationships.facing.player",
  ));
  assert.ok(!next.lastEvents.some(
    ({ type, actorId }) => type === "facing.changed" && actorId === "player",
  ));
  assert.match(JSON.stringify(buildScene(game).content), /opposing movements cancel/i);
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
  const content = JSON.stringify(buildScene(game).content);
  assert.match(content, /blow lands/i);
  assert.match(content, /bruised face/i);
});

test("the mugging can build control despite repeated low-risk defense", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);
  let sawTwoHolds = false;
  let sawGrounded = false;
  let sawPin = false;

  for (let index = 0; index < 30 && game.currentStory.system.state.phase === "active"; index += 1) {
    const state = game.currentStory.system.state;
    sawTwoHolds ||= state.relationships.holds.length === 2;
    sawGrounded ||= state.participants.player.pose !== "standing";
    sawPin ||= state.relationships.holds.some(({ kind }) => kind === "limb-pin");
    const context = createCombatContext({
      game,
      state,
      instanceKey: game.currentStory.instanceKey,
    });
    const available = getAvailableActionInstances(context, "player");
    const response = [
      "cover-and-brace",
      "wrench-free",
      "stand-up",
      "roll-toward",
      "shove-away",
      "create-distance",
    ].find((actionId) => available.some((candidate) => candidate.actionId === actionId));
    assert.ok(response);
    chooseAction(game, response);
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
