import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../src/story/wg/runtime/sceneExposure.js";
import { exitWGStory } from "../src/story/wg/runtime/storyRuntime.js";
import {
  chooseAction,
  chooseFirstAvailableAction,
  findActionChoice,
  gameAtStart,
  placePlayerAtAlley,
  startEncounter,
} from "./support/encounter.mjs";

const PASSIVE_RESPONSES = Object.freeze([
  "cover-and-brace",
  "catch-breath",
  "wrench-free",
  "stand-up",
  "roll-toward",
  "shove-away",
  "create-distance",
  "run",
  "strike-holding-arm",
  "drive-body",
  "strike-face",
]);

function sceneChoiceByLabel(scene, label) {
  const choice = scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.label === label);
  assert.ok(choice, `expected scene choice '${label}'`);
  return choice;
}

function playUntilTerminal(game, choose) {
  for (let index = 0; index < 60 && game.currentStory.system.state.phase === "active"; index += 1) {
    const requested = choose(game);
    if (findActionChoice(game, requested)) chooseAction(game, requested);
    else chooseFirstAvailableAction(game, PASSIVE_RESPONSES);
  }
  assert.equal(game.currentStory.system.state.phase, "terminal");
  return game.currentStory.system.state.outcome;
}

function prepareControlledSearch(game) {
  const state = game.currentStory.system.state;
  state.relationships.range[0].value = "clinch";
  state.participants.player.support = "wall";
  state.relationships.holds.push({
    id: "test-search-pin",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "limb-pin",
    leverage: 80,
  });
  state.npcIntent = {
    actorId: "mugger",
    actionId: "search-money",
    parameters: { targetId: "player" },
  };
  return state;
}

test("entering an alley triggers the mugging once", () => {
  const game = gameAtStart();
  placePlayerAtAlley(game);

  const entered = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
  assert.equal(entered?.id, "encounter.alley-mugging-approach");
  assert.equal(game.currentStory.system, undefined);
  const approach = buildScene(game);
  assert.deepEqual(approach.sections.flatMap(({ choices }) => choices).map(({ label }) => label), [
    "No way!",
    "Hand over up to £20",
    "Run for the street",
  ]);
  const run = sceneChoiceByLabel(approach, "Run for the street");
  assert.deepEqual(run.skillCheck, {
    targetType: "skill",
    targetId: "fitness",
    targetLabel: "Fitness",
    difficultyId: "easy",
    difficultyLabel: "Easy",
  });

  const result = performChoice(game, {
    sceneId: approach.id,
    choiceId: run.id,
  });
  assert.equal(game.currentStory.system.id, "encounter.physical");
  assert.ok(game.currentStory.actors.mugger);
  assert.match(result.paragraphs.join(" "), /catches you/i);
  assert.equal(game.hasFlag("encounter.alley_mugging_seen"), true);

  exitWGStory(game);
  const repeated = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
  assert.notEqual(repeated?.id, "encounter.alley-mugging-approach");
});

test("the pre-fight choices surrender bounded money or escape to the street", () => {
  const surrender = gameAtStart({ seed: 1, money: 7 });
  placePlayerAtAlley(surrender);
  const surrenderLocationId = surrender.currentLocationId;
  resolveWGAutomaticScene(surrender, WG_AUTO_TRIGGER.enterPlace);
  let scene = buildScene(surrender);
  let result = performChoice(surrender, {
    sceneId: scene.id,
    choiceId: sceneChoiceByLabel(scene, "Hand over up to £20").id,
  });

  assert.equal(surrender.player.money, 0);
  assert.equal(surrender.currentStory, null);
  assert.equal(surrender.currentPlace.key, "alleyway");
  assert.equal(String(surrender.location.id), String(surrenderLocationId));
  assert.match(result.paragraphs.join(" "), /hand over/i);

  const escape = gameAtStart({ seed: 1, money: 50 });
  placePlayerAtAlley(escape);
  const escapeLocationId = escape.currentLocationId;
  escape.player.setSkillValue("fitness", 10);
  resolveWGAutomaticScene(escape, WG_AUTO_TRIGGER.enterPlace);
  scene = buildScene(escape);
  result = performChoice(escape, {
    sceneId: scene.id,
    choiceId: sceneChoiceByLabel(scene, "Run for the street").id,
  });

  assert.equal(escape.player.money, 50);
  assert.equal(escape.currentStory, null);
  assert.equal(escape.currentPlace, null);
  assert.equal(String(escape.location.id), String(escapeLocationId));
  assert.match(result.paragraphs.join(" "), /outrun the mugger/i);
});

function preparePlayerControl(game, { stolen = false, muggerExertion = 35 } = {}) {
  const state = game.currentStory.system.state;
  state.relationships.range[0].value = "clinch";
  state.participants.mugger.support = "wall";
  state.participants.mugger.exertion = muggerExertion;
  state.relationships.holds = [
    {
      id: "player-left-control",
      controllerId: "player",
      sourcePartId: "hand_l",
      targetId: "mugger",
      targetPartId: "lower_arm_l",
      kind: "wrist-grip",
      leverage: 60,
    },
    {
      id: "player-right-control",
      controllerId: "player",
      sourcePartId: "hand_r",
      targetId: "mugger",
      targetPartId: "lower_arm_r",
      kind: "wrist-grip",
      leverage: 60,
    },
  ];
  if (stolen) {
    state.objective.searched = true;
    state.objective.stage = "disengage";
    state.objective.lootAmount = 20;
    game.player.adjustMoney(-20);
  }
  state.npcIntent = {
    actorId: "mugger",
    actionId: "wrench-free",
    parameters: {
      targetId: "player",
      holdIds: ["player-left-control", "player-right-control"],
    },
  };
  return state;
}

test("surrendering during combat ends the mugging and caps the loss", () => {
  const game = gameAtStart({ seed: 1, money: 7 });
  startEncounter(game);

  chooseAction(game, "surrender-money");

  const state = game.currentStory.system.state;
  assert.deepEqual(state.outcome, {
    id: "player-surrendered-money",
    moneyLost: 7,
  });
  assert.equal(game.player.money, 0);
  assert.equal(state.relationships.range[0].value, "far");
  assert.deepEqual(state.relationships.holds, []);
  assert.match(JSON.stringify(buildScene(game).content), /surrender £7/i);

  const afterTheft = gameAtStart({ seed: 1, money: 50 });
  startEncounter(afterTheft);
  prepareControlledSearch(afterTheft);
  chooseAction(afterTheft, "cover-and-brace");
  assert.equal(afterTheft.player.money, 30);

  chooseAction(afterTheft, "surrender-money");
  assert.deepEqual(afterTheft.currentStory.system.state.outcome, {
    id: "player-surrendered-money",
    moneyLost: 20,
  });
  assert.equal(afterTheft.player.money, 30, "already-stolen money must not be taken twice");
});

test("controlled disengagement requires complete control and improves with exhaustion", () => {
  const tokenControl = gameAtStart({ seed: 4, money: 50 });
  startEncounter(tokenControl);
  const tokenState = preparePlayerControl(tokenControl, {
    stolen: true,
    muggerExertion: 90,
  });
  tokenState.relationships.holds[0].leverage = 1;
  tokenState.relationships.holds[1].leverage = 1;
  assert.equal(findActionChoice(tokenControl, "controlled-disengage"), null);
  assert.equal(findActionChoice(tokenControl, "demand-money-back"), null);

  tokenState.relationships.holds[0].leverage = 100;
  assert.equal(
    findActionChoice(tokenControl, "demand-money-back"),
    null,
    "one strong wrist hold must not compensate for ineffective control of the other wrist",
  );

  const weakenedControl = gameAtStart({ seed: 4, money: 50 });
  startEncounter(weakenedControl);
  preparePlayerControl(weakenedControl, { stolen: true, muggerExertion: 90 });
  const leftHand = weakenedControl.player.body.getPart("hand_l");
  leftHand.health = leftHand.maxHealth * 0.2;
  leftHand.pain = 0;
  assert.equal(
    findActionChoice(weakenedControl, "demand-money-back"),
    null,
    "stored leverage must be discounted by the controlling limb's actual capacity",
  );

  const unavailable = gameAtStart({ seed: 4 });
  startEncounter(unavailable);
  preparePlayerControl(unavailable, { muggerExertion: 34 });
  assert.equal(findActionChoice(unavailable, "controlled-disengage"), null);

  const low = gameAtStart({ seed: 4 });
  startEncounter(low);
  preparePlayerControl(low, { muggerExertion: 35 });
  chooseAction(low, "controlled-disengage");
  const lowRoll = low.currentStory.system.state.lastEvents.find(
    ({ type, actionId }) => type === "chance.rolled" && actionId === "controlled-disengage",
  );
  assert.equal(lowRoll.success, false);

  const high = gameAtStart({ seed: 4 });
  startEncounter(high);
  preparePlayerControl(high, { muggerExertion: 90 });
  chooseAction(high, "controlled-disengage");
  const highState = high.currentStory.system.state;
  const highRoll = highState.lastEvents.find(
    ({ type, actionId }) => type === "chance.rolled" && actionId === "controlled-disengage",
  );
  assert.equal(highRoll.success, true);
  assert.ok(highRoll.chance > lowRoll.chance);
  assert.equal(highState.relationships.range[0].value, "far");
  assert.deepEqual(highState.relationships.holds, []);
  assert.match(JSON.stringify(buildScene(high).content), /several steps back/i);
});

test("controlled disengagement requires standing mobility", () => {
  const game = gameAtStart({ seed: 4, money: 50 });
  startEncounter(game);
  const state = preparePlayerControl(game, { stolen: true, muggerExertion: 90 });
  state.participants.player.pose = "kneeling";

  assert.equal(findActionChoice(game, "controlled-disengage"), null);
  assert.ok(
    findActionChoice(game, "demand-money-back"),
    "kneeling does not by itself prevent a demand from a secure control position",
  );
});

test("a Speech demand can recover stolen money and switches the mugger to escape", () => {
  const failed = gameAtStart({ seed: 2, money: 50 });
  startEncounter(failed);
  preparePlayerControl(failed, { stolen: true });
  chooseAction(failed, "demand-money-back");
  const failedState = failed.currentStory.system.state;
  const failedRoll = failedState.lastEvents.find(
    ({ type, actionId }) => type === "chance.rolled" && actionId === "demand-money-back",
  );
  assert.equal(failedRoll.success, false);
  assert.equal(failed.player.money, 30);
  assert.equal(failedState.objective.lootAmount, 20);

  const succeeded = gameAtStart({ seed: 2, money: 50 });
  succeeded.player.setSkillValue("speech", 10);
  startEncounter(succeeded);
  preparePlayerControl(succeeded, { stolen: true });
  succeeded.currentStory.system.state.npcIntent = {
    actorId: "mugger",
    actionId: "headbutt",
    parameters: { targetId: "player", sourcePartId: "head" },
  };
  chooseAction(succeeded, "demand-money-back");
  const succeededState = succeeded.currentStory.system.state;
  const succeededRoll = succeededState.lastEvents.find(
    ({ type, actionId }) => type === "chance.rolled" && actionId === "demand-money-back",
  );
  assert.equal(succeededRoll.success, true);
  assert.ok(succeededRoll.chance > failedRoll.chance);
  assert.equal(succeeded.player.money, 50);
  assert.equal(succeededState.objective.lootAmount, 0);
  assert.equal(succeededState.objective.stage, "disengage");
  assert.equal(findActionChoice(succeeded, "surrender-money"), null);
  assert.ok(["flee", "create-distance", "wrench-free", "strike-holding-arm", "shove-away"]
    .includes(succeededState.npcIntent.actionId));
  assert.match(JSON.stringify(buildScene(succeeded).content), /gives in to your demand/i);
});

test("failure to disrupt control completes bounded theft exactly once", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  startEncounter(game);
  const outcome = playUntilTerminal(game, () => "cover-and-brace");

  assert.deepEqual(outcome, {
    id: "theft-completed-player-conscious",
    moneyLost: 20,
  });
  assert.equal(game.player.money, 30);
  assert.equal(game.currentStory.system.state.objective.amount, 20);
  assert.equal(game.currentStory.system.state.npcIntent, null);
  assert.deepEqual(buildScene(game).sections[0].choices.map(({ id }) => id), [
    "encounter-action:finish",
  ]);

  buildScene(game);
  buildScene(game);
  assert.equal(game.player.money, 30);
  chooseAction(game, "finish");
  assert.equal(game.currentStory, null);
});

test("taking money begins an interruptible getaway before theft completes", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  startEncounter(game);
  prepareControlledSearch(game);

  chooseAction(game, "cover-and-brace");

  let state = game.currentStory.system.state;
  assert.equal(game.player.money, 30);
  assert.equal(state.phase, "active");
  assert.equal(state.outcome, null);
  assert.equal(state.objective.stage, "disengage");
  assert.equal(state.objective.searched, true);
  assert.equal(state.objective.lootAmount, 20);
  assert.equal(state.npcIntent.actionId, "create-distance");
  assert.ok(state.relationships.holds.length > 0);
  assert.ok(state.lastEvents.some(({ type }) => type === "theft.taken"));
  assert.match(JSON.stringify(buildScene(game).content), /trying to escape/i);

  chooseAction(game, "cover-and-brace");
  state = game.currentStory.system.state;
  assert.equal(state.phase, "active");
  assert.equal(state.relationships.range[0].value, "reach");
  assert.deepEqual(state.relationships.holds, []);
  assert.equal(state.npcIntent.actionId, "flee");

  chooseAction(game, "cover-and-brace");
  state = game.currentStory.system.state;
  assert.deepEqual(state.outcome, {
    id: "theft-completed-player-conscious",
    moneyLost: 20,
  });
  assert.equal(game.player.money, 30);
  assert.equal(state.relationships.range[0].value, "far");
  assert.deepEqual(state.relationships.holds, []);
  assert.ok(state.lastEvents.some(({ type }) => type === "theft.completed"));
});

test("incapacitating the mugger during the getaway recovers the stolen money", () => {
  const game = gameAtStart({ seed: 3, money: 50 });
  game.player.setSkillValue("strength", 10);
  startEncounter(game);
  prepareControlledSearch(game);
  chooseAction(game, "cover-and-brace");

  const actor = game.currentStory.actors.mugger;
  const painThreshold = Math.min(
    95,
    78 + actor.stats.resolve * 1.9,
  );
  actor.body.parts.find(({ id }) => id === "face").pain = painThreshold - 1;

  chooseAction(game, "strike-face");

  const state = game.currentStory.system.state;
  assert.deepEqual(state.outcome, {
    id: "mugger-incapacitated",
    moneyLost: 0,
  });
  assert.equal(game.player.money, 50);
  assert.equal(state.objective.lootAmount, 0);
  assert.ok(state.lastEvents.some(
    ({ type, amount }) => type === "theft.recovered" && amount === 20,
  ));
});

test("an already-incapacitated player receives the mugging consequence on entry", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  game.player.body.getPart("abdomen").pain = 90;

  const state = startEncounter(game);

  assert.deepEqual(state.outcome, {
    id: "theft-completed-player-incapacitated",
    moneyLost: 20,
  });
  assert.equal(state.phase, "terminal");
  assert.equal(state.npcIntent, null);
  assert.equal(state.objective.stage, "complete");
  assert.equal(game.player.money, 30);
  assert.ok(state.lastEvents.some(
    ({ type, reason }) => type === "participant.unable-to-act"
      && reason === "already-incapacitated",
  ));
  assert.ok(state.lastEvents.some(({ type }) => type === "theft.completed"));
  assert.ok(state.lastEvents.some(
    ({ type, actorId }) => type === "escape.completed" && actorId === "mugger",
  ));
  assert.deepEqual(buildScene(game).sections[0].choices.map(({ id }) => id), [
    "encounter-action:finish",
  ]);
  assert.match(JSON.stringify(buildScene(game).content), /unable to resist/i);
});

test("a physically helpless but conscious player cannot create an actionless encounter", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  for (const partId of ["hand_l", "hand_r", "foot_l", "foot_r"]) {
    const part = game.player.body.getPart(partId);
    part.health = 0;
    part.pain = 0;
  }
  assert.equal(game.player.isIncapacitated(), false);

  const state = startEncounter(game);

  assert.deepEqual(state.outcome, {
    id: "theft-completed-player-incapacitated",
    moneyLost: 20,
  });
  assert.equal(game.player.money, 30);
  assert.ok(state.lastEvents.some(
    ({ type, reason }) => type === "participant.unable-to-act"
      && reason === "already-incapacitated",
  ));
});

test("theft is capped at available money and an empty target invents no new objective", () => {
  const lowMoney = gameAtStart({ seed: 1, money: 7 });
  startEncounter(lowMoney);
  const theft = playUntilTerminal(lowMoney, () => "cover-and-brace");
  assert.equal(theft.moneyLost, 7);
  assert.equal(lowMoney.player.money, 0);

  const empty = gameAtStart({ seed: 117, money: 0 });
  startEncounter(empty);
  const emptyOutcome = playUntilTerminal(empty, () => "cover-and-brace");
  assert.equal(emptyOutcome.id, "mugger-fled");
  assert.equal(empty.currentStory.system.state.relationships.range[0].value, "far");
  assert.equal(empty.currentStory.system.state.objective.amount, 0);
  assert.equal(empty.player.money, 0);
});

test("escape, retreat, incapacitation, and incapacitated theft are reachable outcomes", () => {
  const escape = gameAtStart({ seed: 10 });
  startEncounter(escape);
  assert.equal(playUntilTerminal(escape, (game) =>
    findActionChoice(game, "run")
      ? "run"
      : findActionChoice(game, "create-distance")
        ? "create-distance"
        : findActionChoice(game, "wrench-free")
          ? "wrench-free"
          : "shove-away").id, "player-escaped");

  const cleanWin = gameAtStart({ seed: 2 });
  cleanWin.player.setSkillValue("strength", 10);
  startEncounter(cleanWin);
  assert.equal(playUntilTerminal(cleanWin, (game) =>
    findActionChoice(game, "strike-holding-arm") ? "strike-holding-arm" : "strike-face").id,
  "mugger-incapacitated");

  const injuredLoss = gameAtStart({ seed: 1 });
  startEncounter(injuredLoss);
  injuredLoss.player.body.getPart("abdomen").pain = 77;
  assert.equal(playUntilTerminal(injuredLoss, (game) =>
    findActionChoice(game, "shove-away")
      ? "shove-away"
      : findActionChoice(game, "create-distance")
        ? "create-distance"
        : findActionChoice(game, "run")
          ? "run"
          : findActionChoice(game, "wrench-free")
            ? "wrench-free"
            : "cover-and-brace").id,
  "theft-completed-player-incapacitated");
});
