import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import { getAvailableActionInstances } from "../src/features/encounter/availability.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  chooseSimultaneousGrabPriority,
  resolveEncounterExchange,
} from "../src/features/encounter/resolution.js";
import {
  chooseAction,
  findActionChoice,
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

const PLAYER_GRAB = Object.freeze({
  id: "priority-player-grab",
  controllerId: "player",
  sourcePartId: "hand_l",
  targetId: "mugger",
  targetPartId: "lower_arm_l",
  kind: "wrist-grip",
  leverage: 40,
});

const MUGGER_GRAB = Object.freeze({
  id: "priority-mugger-grab",
  controllerId: "mugger",
  sourcePartId: "hand_l",
  targetId: "player",
  targetPartId: "lower_arm_l",
  kind: "wrist-grip",
  leverage: 40,
});

function grabPriorityContext({
  seed = 17,
  playerExertion = 0,
  muggerExertion = 0,
  playerFitness = 5,
  playerStrength = 5,
  muggerStrength = 5,
  muggerEndurance = 5,
  muggerFitness = 5,
} = {}) {
  const game = gameAtStart({ seed });
  game.player.setSkillValue("fitness", playerFitness);
  game.player.setSkillValue("strength", playerStrength);
  const state = startEncounter(game);
  Object.assign(game.currentStory.actors.mugger.stats, {
    strength: muggerStrength,
    endurance: muggerEndurance,
    fitness: muggerFitness,
  });
  state.participants.player.exertion = playerExertion;
  state.participants.mugger.exertion = muggerExertion;
  return createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
}

test("simultaneous incompatible grabs prioritize exertion, fitness, strength, then a seeded roll", () => {
  const fresher = chooseSimultaneousGrabPriority(grabPriorityContext({
    playerExertion: 20,
    muggerExertion: 5,
    playerFitness: 10,
    playerStrength: 10,
    muggerStrength: 1,
    muggerEndurance: 1,
  }), PLAYER_GRAB, MUGGER_GRAB);
  assert.deepEqual(fresher, { winnerId: "mugger", basis: "exertion", roll: null });

  const fitter = chooseSimultaneousGrabPriority(grabPriorityContext({
    playerFitness: 7,
    playerStrength: 1,
    muggerStrength: 4,
    muggerEndurance: 4,
    muggerFitness: 4,
  }), PLAYER_GRAB, MUGGER_GRAB);
  assert.deepEqual(fitter, { winnerId: "player", basis: "fitness", roll: null });

  const stronger = chooseSimultaneousGrabPriority(grabPriorityContext({
    playerFitness: 5,
    playerStrength: 7,
    muggerStrength: 6,
    muggerEndurance: 4,
  }), PLAYER_GRAB, MUGGER_GRAB);
  assert.deepEqual(stronger, { winnerId: "player", basis: "strength", roll: null });

  const tiedContext = grabPriorityContext({ seed: 29 });
  const tied = chooseSimultaneousGrabPriority(tiedContext, PLAYER_GRAB, MUGGER_GRAB);
  assert.equal(tied.basis, "roll");
  assert.ok(["player", "mugger"].includes(tied.winnerId));
  assert.ok(tied.roll >= 0 && tied.roll < 1);
  assert.deepEqual(
    tied,
    chooseSimultaneousGrabPriority(tiedContext, MUGGER_GRAB, PLAYER_GRAB),
  );
});

test("only the priority winner keeps a mutually incompatible simultaneous grab", () => {
  const game = gameAtStart({ seed: 3 });
  const state = startEncounter(game);
  assert.equal(state.npcIntent.actionId, "grab-arm");
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const npcSourceSide = state.npcIntent.parameters.sourcePartId.endsWith("_l") ? "_l" : "_r";
  const npcTargetSide = state.npcIntent.parameters.targetPartId.endsWith("_l") ? "_l" : "_r";
  const playerGrab = getAvailableActionInstances(context, "player").find(
    (candidate) => candidate.actionId === "grab-arm"
      && candidate.parameters.targetPartId.endsWith(npcSourceSide)
      && candidate.parameters.sourcePartId.endsWith(npcTargetSide),
  );
  assert.ok(playerGrab);

  const next = resolveEncounterExchange({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
    playerAction: playerGrab,
  });
  const successfulGrabRolls = next.lastEvents.filter(
    ({ type, actionId, purpose, success }) => type === "chance.rolled"
      && actionId === "grab-arm"
      && purpose === "contest"
      && success,
  );
  const priority = next.lastEvents.find(({ type }) => type === "hold.priority-resolved");

  assert.equal(successfulGrabRolls.length, 2);
  assert.ok(priority);
  assert.equal(next.relationships.holds.length, 1);
  assert.equal(next.relationships.holds[0].controllerId, priority.winnerId);
  assert.equal(next.relationships.holds[0].id, priority.holdId);
});

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
  const game = gameAtStart({ seed: 4 });
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

test("simultaneous pain limits leave the player helpless but incapacitate the attacker", () => {
  const game = gameAtStart({ seed: 2 });
  game.player.setSkillValue("strength", 10);
  const state = startEncounter(game);
  Object.assign(game.currentStory.actors.mugger.stats, {
    strength: 10,
    endurance: 0,
    resolve: 0,
  });
  game.player.body.getPart("abdomen").acutePain = 70;
  game.currentStory.actors.mugger.body.parts
    .find(({ id }) => id === "abdomen").acutePain = 70;
  forceNpcIntent(game, "drive-body");

  chooseAction(game, "drive-body");

  assert.equal(state.outcome, null);
  assert.deepEqual(game.currentStory.system.state.outcome, {
    id: "mugger-incapacitated",
    moneyLost: 0,
  });
  assert.equal(
    game.currentStory.system.state.lastEvents
      .filter(({ type, partId }) => type === "impact.landed" && partId === "abdomen")
      .length,
    2,
  );
  const painChanges = game.currentStory.system.state.lastEvents
    .filter(({ type }) => type === "pain.changed");
  assert.deepEqual(
    painChanges.map(({ actorId }) => actorId).sort(),
    ["mugger", "player"],
  );
  assert.ok(painChanges.every(({ before, after, amount }) =>
    amount > 0 && after > before));
  assert.match(JSON.stringify(buildScene(game).content), /cannot continue|safe to leave/i);
});

test("losing the last physical response still leaves surrender available", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  game.player.setSkillValue("resolve", 4);
  const state = startEncounter(game);
  const setCapacity = (partId, ratio) => {
    const part = game.player.body.getPart(partId);
    part.integrity = part.maxIntegrity * ratio;
    part.acutePain = 0;
    part.conditions.clear();
  };
  setCapacity("hand_l", 0.18);
  setCapacity("hand_r", 0);
  setCapacity("foot_l", 0.18);
  setCapacity("foot_r", 0.18);
  state.relationships.range[0].value = "clinch";
  state.relationships.facing.find(({ actor }) => actor === "player").value = "away";
  state.relationships.holds.push({
    id: "last-response-hold",
    controllerId: "player",
    sourcePartId: "hand_l",
    targetId: "mugger",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 20,
  });
  forceNpcIntent(game, "strike-holding-arm");

  chooseAction(game, "tighten-hold");

  const next = game.currentStory.system.state;
  assert.equal(next.phase, "active");
  assert.equal(next.outcome, null);
  assert.equal(game.player.money, 50);
  assert.ok(findActionChoice(game, "surrender-money"));
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
  const game = gameAtStart({ seed: 2 });
  game.player.setSkillValue("strength", 10);
  startEncounter(game);
  const faceBefore = game.currentStory.actors.mugger.body.parts
    .find(({ id }) => id === "face").integrity;

  chooseAction(game, "strike-face");

  const faceAfter = game.currentStory.actors.mugger.body.parts
    .find(({ id }) => id === "face").integrity;
  assert.ok(faceAfter < faceBefore);
  const content = JSON.stringify(buildScene(game).content);
  assert.match(content, /fist|strike/i);
  assert.match(content, /bruised face/i);
});

test("a terminal exchange narrates the player's landed strike before the opponent flees", () => {
  const game = gameAtStart({ seed: 117, money: 20, combatSkill: 300 });
  startEncounter(game);
  forceNpcIntent(game, "flee");

  chooseAction(game, "drive-body");

  const state = game.currentStory.system.state;
  assert.equal(state.outcome.id, "mugger-fled");
  const paragraphs = buildScene(game).content
    .filter(({ type }) => type === "paragraph")
    .map(({ text, parts }) => text ?? parts
      .filter(({ type }) => type === "text")
      .map((part) => part.text)
      .join(""));
  assert.match(paragraphs[0], /body blow|strike/i);
  assert.doesNotMatch(paragraphs[0], /You drive a blow toward her body\. The blow lands/i);
  assert.match(paragraphs[1], /risk is no longer worth|breaks off the mugging|abandons the attack/i);
});

test("the mugging can build control despite repeated low-risk defense", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);
  let sawTwoHolds = false;
  let sawGrounded = false;
  let sawPin = false;

  for (let index = 0; index < 60 && game.currentStory.system.state.phase === "active"; index += 1) {
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
      "catch-breath",
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

test("varied sequences of legal actions preserve encounter invariants", () => {
  const strategies = [
    [
      "pin-limb",
      "turn-target-away",
      "force-to-ground",
      "force-to-wall",
      "tighten-hold",
      "grab-arm",
      "stand-up",
      "roll-toward",
      "shove-away",
      "strike-face",
    ],
    [
      "strike-holding-arm",
      "wrench-free",
      "shove-away",
      "stand-up",
      "roll-toward",
      "create-distance",
      "flee",
      "strike-face",
      "cover-and-brace",
    ],
    [
      "tighten-hold",
      "force-to-ground",
      "pin-limb",
      "turn-target-away",
      "grab-arm",
      "knee-strike",
      "drive-body",
      "shove-away",
      "cover-and-brace",
    ],
  ];

  for (let seed = 1; seed <= 30; seed += 1) {
    const game = gameAtStart({ seed });
    game.player.setSkillValue("strength", 7);
    game.player.setSkillValue("fitness", 7);
    let state = startEncounter(game);
    Object.assign(game.currentStory.actors.mugger.stats, {
      strength: 5,
      fitness: 5,
      endurance: 5,
    });

    for (let exchange = 0; exchange < 60 && state.phase === "active"; exchange += 1) {
      const context = createCombatContext({
        game,
        state,
        instanceKey: game.currentStory.instanceKey,
      });
      const available = getAvailableActionInstances(context, "player");
      const priorities = strategies[(seed - 1) % strategies.length];
      const playerAction = priorities
        .map((actionId) => available.find((candidate) => candidate.actionId === actionId))
        .find(Boolean) || available[0];
      let next;
      assert.doesNotThrow(() => {
        next = resolveEncounterExchange({
          game,
          state,
          instanceKey: game.currentStory.instanceKey,
          playerAction,
        });
      }, `seed ${seed}, exchange ${exchange}, action ${playerAction.actionId}`);
      state = next;
      game.currentStory.system.state = state;
    }
  }
});

test("catching breath restores exertion and eases winded severity", () => {
  const game = gameAtStart({ seed: 1 });
  const state = startEncounter(game);
  state.participants.player.exertion = 80;
  state.participants.player.acute = [{ id: "winded", severity: 2, exchanges: 4 }];
  forceNpcIntent(game, "cover-and-brace");

  chooseAction(game, "catch-breath");

  const next = game.currentStory.system.state;
  assert.ok(next.participants.player.exertion < 80);
  assert.equal(
    next.participants.player.acute.find(({ id }) => id === "winded")?.severity,
    1,
  );
  assert.ok(next.lastEvents.some(({ type }) => type === "exertion.recovered"));
  assert.ok(next.lastEvents.some(({ type }) => type === "acute.eased"));
  assert.match(JSON.stringify(buildScene(game).content), /slow your breathing/i);
});

test("an overextended NPC action usually fails before its normal contest and is narrated", () => {
  const game = gameAtStart({ seed: 1 });
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.mugger.exertion = 100;
  state.participants.mugger.acute = [{ id: "winded", severity: 2, exchanges: 4 }];
  forceNpcIntent(game, "headbutt");

  chooseAction(game, "cover-and-brace");

  const events = game.currentStory.system.state.lastEvents;
  const effortRoll = events.find(
    ({ type, actorId, actionId, purpose }) => type === "chance.rolled"
      && actorId === "mugger"
      && actionId === "headbutt"
      && purpose === "desperate-effort",
  );
  assert.ok(effortRoll);
  assert.equal(effortRoll.success, false);
  assert.ok(effortRoll.chance <= 0.18);
  assert.ok(events.some(
    ({ type, actorId, reason }) => type === "action.failed"
      && actorId === "mugger"
      && reason === "too-winded",
  ));
  assert.ok(!events.some(
    ({ type, actorId, purpose }) => type === "chance.rolled"
      && actorId === "mugger"
      && purpose === "contest",
  ));
  assert.match(JSON.stringify(buildScene(game).content), /too winded/i);
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

test("standing from a weak hostile knee pin breaks the pin without invalid geometry", () => {
  const game = gameAtStart({ seed: 3 });
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.player.pose = "supine";
  state.participants.mugger.pose = "kneeling";
  state.relationships.holds.push({
    id: "weak-knee-pin",
    controllerId: "mugger",
    sourcePartId: "knee_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "limb-pin",
    leverage: 10,
  });
  state.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };

  chooseAction(game, "stand-up");

  const next = game.currentStory.system.state;
  assert.equal(next.participants.player.pose, "standing");
  assert.ok(!next.relationships.holds.some(({ id }) => id === "weak-knee-pin"));
  assert.ok(next.lastEvents.some(
    ({ type, holdId, reason }) =>
      type === "hold.broken"
      && holdId === "weak-knee-pin"
      && reason === "pin-target-unconstrained",
  ));
});

test("a new simultaneous pin is reconciled against the merged final pose", () => {
  const game = gameAtStart({ seed: 2 });
  game.player.setSkillValue("strength", 10);
  game.player.setSkillValue("fitness", 10);
  const state = startEncounter(game);
  Object.assign(game.currentStory.actors.mugger.stats, {
    strength: 10,
    fitness: 10,
    endurance: 10,
  });
  state.relationships.range[0].value = "clinch";
  state.participants.player.pose = "supine";
  state.participants.mugger.pose = "kneeling";
  state.relationships.holds.push(
    {
      id: "player-grip",
      controllerId: "player",
      sourcePartId: "hand_l",
      targetId: "mugger",
      targetPartId: "lower_arm_r",
      kind: "wrist-grip",
      leverage: 100,
    },
    {
      id: "mugger-pin",
      controllerId: "mugger",
      sourcePartId: "hand_l",
      targetId: "player",
      targetPartId: "lower_arm_r",
      kind: "wrist-grip",
      leverage: 100,
    },
  );
  forceNpcIntent(game, "pin-limb");

  chooseAction(game, "turn-target-away");

  const next = game.currentStory.system.state;
  assert.equal(next.participants.mugger.pose, "prone");
  assert.ok(!next.relationships.holds.some(({ id }) => id === "mugger-pin"));
  assert.ok(next.lastEvents.some(
    ({ type, holdId }) => type === "hold.pinned" && holdId === "mugger-pin",
  ));
  assert.ok(next.lastEvents.some(
    ({ type, holdId, reason }) =>
      type === "hold.broken"
      && holdId === "mugger-pin"
      && reason === "knee-pin-geometry-lost",
  ));
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
  const ownHeadBefore = headbutt.player.body.getPart("head").integrity;
  const targetFaceBefore = headbutt.currentStory.actors.mugger.body.parts.find(
    ({ id }) => id === "face",
  ).integrity;

  chooseAction(headbutt, "headbutt");

  assert.ok(headbutt.player.body.getPart("head").integrity < ownHeadBefore);
  assert.ok(
    headbutt.currentStory.actors.mugger.body.parts.find(({ id }) => id === "face").integrity
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
