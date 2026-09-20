import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../src/story/wg/runtime/sceneExposure.js";
import {
  enterWGScene,
  exitWGStory,
  resolveActiveWGStory,
} from "../src/story/wg/runtime/storyRuntime.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  STEAL_MONEY_OBJECTIVE,
  STEAL_MONEY_OUTCOME,
} from "../src/features/encounter/objectives/steal.js";
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

test("every pre-fight outcome leads to Jackie's introduction in the alley", () => {
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
  assert.equal(surrender.currentStory.id, "encounter.alley-jackie-introduction");
  assert.equal(surrender.currentPlace.key, "alleyway");
  assert.equal(String(surrender.location.id), String(surrenderLocationId));
  assert.equal(surrender.player.getRelationshipProfile(
    "jackie",
    surrender.npcs.get("jackie").relationshipProfile,
  ).met, true);
  assert.ok(surrender.getNPCsAtCurrentPosition().includes(surrender.npcs.get("jackie")));
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
  assert.equal(escape.currentStory.id, "encounter.alley-jackie-introduction");
  assert.equal(escape.currentPlace.key, "alleyway");
  assert.equal(String(escape.location.id), String(escapeLocationId));
  assert.match(result.paragraphs.join(" "), /outrun the mugger/i);
});

test("Jackie offers both current combat drills as a persistent NPC opponent", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  placePlayerAtAlley(game);
  resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
  let scene = buildScene(game);
  performChoice(game, {
    sceneId: scene.id,
    choiceId: sceneChoiceByLabel(scene, "Hand over the money").id,
  });

  scene = buildScene(game);
  const introductionText = scene.content
    .flatMap(({ parts = [] }) => parts)
    .map(({ text = "" }) => text)
    .join("");
  assert.match(introductionText, /Name's Jackie/i);
  assert.match(introductionText, /where you can find them/i);
  performChoice(game, {
    sceneId: scene.id,
    choiceId: sceneChoiceByLabel(scene, "Hear them out").id,
  });

  scene = buildScene(game);
  assert.deepEqual(
    scene.sections.flatMap(({ choices }) => choices.map(({ label }) => label)),
    [
      "Try to rob me",
      "Try to hurt me",
      "Not right now",
    ],
  );

  const moneyBeforeTraining = game.player.money;
  const trainingResult = performChoice(game, {
    sceneId: scene.id,
    choiceId: sceneChoiceByLabel(scene, "Try to rob me").id,
  });

  const state = game.currentStory.system.state;
  assert.equal(state.objective.id, "steal-money");
  assert.equal(state.objective.amount, 5);
  assert.equal(state.stress.contextMultiplier, 0.3);
  assert.equal(state.stress.maximumGain, 10.5);
  assert.equal(game.player.money, moneyBeforeTraining + 5);
  assert.match(trainingResult.paragraphs.join(" "), /hands you £5/i);
  assert.deepEqual(state.participants.jackie.ref, { type: "npc", npcId: "jackie" });
  assert.equal(state.participants.jackie.controller.personalityId, "forceful");
  assert.equal(game.currentStory.actors, undefined);
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  assert.strictEqual(context.combatants.jackie.actor, game.npcs.get("jackie"));
  assert.strictEqual(context.combatants.jackie.body, game.npcs.get("jackie").body);
  assert.equal(context.combatants.jackie.title, "Jackie");
  assert.equal(context.combatants.jackie.stat("fitness"), 6);

  const restored = Game.fromJSON(game.toJSON());
  assert.equal(restored.currentStory.system.state.participants.jackie.ref.type, "npc");
  assert.doesNotThrow(() => buildScene(restored));

  const beatDown = gameAtStart({ seed: 2 });
  placePlayerAtAlley(beatDown);
  beatDown.teleportNPC("jackie", "player");
  enterWGScene(beatDown, "encounter.alley-jackie-coaching");
  resolveActiveWGStory(beatDown);
  scene = buildScene(beatDown);
  performChoice(beatDown, {
    sceneId: scene.id,
    choiceId: sceneChoiceByLabel(scene, "Try to hurt me").id,
  });
  assert.equal(beatDown.currentStory.system.state.objective.id, "beat-down");
  assert.deepEqual(
    beatDown.currentStory.system.state.participants.jackie.ref,
    { type: "npc", npcId: "jackie" },
  );
  assert.equal(
    beatDown.currentStory.system.state.participants.jackie.controller.personalityId,
    "forceful",
  );
});

test("Jackie declines training when the player is badly injured or in too much pain", () => {
  for (const injure of [
    (game) => {
      game.player.body.getPart("chest").integrity = 35;
    },
    (game) => {
      game.player.body.getPart("chest").acutePain = 50;
    },
  ]) {
    const game = gameAtStart();
    placePlayerAtAlley(game);
    game.teleportNPC("jackie", "player");
    injure(game);
    enterWGScene(game, "encounter.alley-jackie-coaching");
    resolveActiveWGStory(game);

    const scene = buildScene(game);
    assert.match(JSON.stringify(scene.content), /too hurt.*get some rest/i);
    assert.deepEqual(
      scene.sections.flatMap(({ choices }) => choices.map(({ label }) => label)),
      ["Take Jackie's advice"],
    );
  }
});

test("persistent NPC injuries are cleared after combat finishes", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  placePlayerAtAlley(game);
  game.teleportNPC("jackie", "player");
  enterWGScene(game, "encounter.alley-jackie-theft-practice");
  resolveActiveWGStory(game);

  const jackie = game.npcs.get("jackie");
  jackie.body.applyDamage({ partId: "chest", integrityDamage: 30, painDamage: 55 });
  assert.ok(jackie.body.getConditionScore() < 100);
  assert.ok(jackie.body.getTotalPain() > 0);

  chooseAction(game, "surrender-money");
  assert.equal(game.currentStory.system.state.phase, "terminal");
  assert.ok(jackie.body.getTotalPain() > 0, "terminal summary should retain fight injuries");
  chooseAction(game, "finish");

  assert.equal(jackie.body.getConditionScore(), 100);
  assert.equal(jackie.body.getTotalPain(), 0);
  assert.ok([...jackie.body.allParts()].every((part) => part.conditions.size === 0));
});

test("Jackie's introduction catches up on a later alley visit", () => {
  const game = gameAtStart();
  game.setFlag("encounter.alley_mugging_seen");
  placePlayerAtAlley(game);

  const entered = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);

  assert.equal(entered?.id, "encounter.alley-jackie-introduction");
  assert.ok(game.getNPCsAtCurrentPosition().includes(game.npcs.get("jackie")));
  assert.equal(game.player.getRelationshipProfile(
    "jackie",
    game.npcs.get("jackie").relationshipProfile,
  ).met, true);
});

test("Jackie's direct introduction uses her name around unconjugated authored verbs", () => {
  const game = gameAtStart();
  placePlayerAtAlley(game);
  enterWGScene(game, "encounter.alley-jackie-introduction");
  resolveActiveWGStory(game);

  const text = buildScene(game).content
    .flatMap(({ parts = [], text: paragraph = "" }) => [
      paragraph,
      ...parts.map(({ text: part = "" }) => part),
    ])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  assert.match(text, /Jackie is dressed in a loose hoodie and jeans\./);
  assert.match(text, /"Nice to see ya," Jackie says\./);
  assert.doesNotMatch(text, /\bThey is\b|\bthey says\b/);
});

test("an unanswered scream spends the exchange and leaves the fight active", () => {
  const game = gameAtStart({ seed: 1 });
  startEncounter(game);

  chooseAction(game, "scream-for-help");

  const state = game.currentStory.system.state;
  assert.equal(state.phase, "active");
  assert.equal(state.outcome, null);
  assert.ok(state.lastEvents.some(({ type, actionId, purpose, chance, success }) =>
    type === "chance.rolled"
      && actionId === "scream-for-help"
      && purpose === "heard-by-bystander"
      && chance === 0.2
      && success === false));
  assert.ok(state.lastEvents.some(({ type, reason }) =>
    type === "action.failed" && reason === "help-not-heard"));
  assert.ok(findActionChoice(game, "scream-for-help"));
  assert.match(JSON.stringify(buildScene(game).content), /nobody comes to help/i);
});

test("a heard scream ends combat and routes to a scene with a generated rescuer", () => {
  const game = gameAtStart({ seed: 4 });
  startEncounter(game);

  chooseAction(game, "scream-for-help");

  const state = game.currentStory.system.state;
  assert.equal(state.phase, "terminal");
  assert.deepEqual(state.outcome, { id: "player-rescued", moneyLost: 0 });
  assert.deepEqual(state.relationships.holds, []);
  assert.equal(state.relationships.range[0].value, "far");
  assert.ok(state.lastEvents.some(({ type }) => type === "help.heard"));
  let scene = buildScene(game);
  assert.match(JSON.stringify(scene.content), /call is answered/i);

  const continueChoice = scene.sections
    .flatMap(({ choices }) => choices)
    .find(({ id }) => id === "encounter-action:finish");
  assert.ok(continueChoice);
  performChoice(game, { sceneId: scene.id, choiceId: continueChoice.id });

  assert.ok(game.currentStory.actors.rescuer);
  assert.equal(game.currentStory.actors.rescuer.profileId, "civilian");
  assert.equal(
    [...game.npcs.values()].some(({ id }) => id === game.currentStory.actors.rescuer.id),
    false,
  );
  scene = buildScene(game);
  assert.match(JSON.stringify(scene.content), /mugger releases you and runs/i);
  assert.match(JSON.stringify(scene.content), /stays with you and makes sure you are safe/i);
  performChoice(game, {
    sceneId: scene.id,
    choiceId: sceneChoiceByLabel(scene, "Thank them").id,
  });
  assert.equal(game.currentStory.id, "encounter.alley-jackie-introduction");
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

test("empty-wallet surrender renders one dedicated terminal summary", () => {
  const game = gameAtStart({ seed: 1, money: 0 });
  startEncounter(game);

  chooseAction(game, "surrender-money");

  const state = game.currentStory.system.state;
  const eventTypes = state.lastEvents.map(({ type }) => type);
  for (const type of [
    "action.attempted",
    "theft.empty",
    "range.changed",
    "surrender.completed",
    "escape.completed",
    "action.spoiled",
    "encounter.ended",
  ]) {
    assert.ok(eventTypes.includes(type), `expected retained event '${type}'`);
  }
  const scene = buildScene(game);
  assert.deepEqual(scene.content.map(({ type }) => type), ["paragraph", "paragraph"]);
  const summary = scene.content[0].text;
  assert.match(summary, /empty pockets/i);
  assert.match(summary, /finding nothing to take|nothing to steal|no money/i);
  assert.match(summary, /lets you go|abandons the mugging|nothing worth staying for/i);
  assert.equal((summary.match(/nothing/gi) || []).length, 1);
  assert.doesNotMatch(summary, /clear gap|abandons the attempt|turns? and runs?|accepts your surrender/i);
});

test("every theft outcome supplies dedicated terminal content", () => {
  const game = gameAtStart({ seed: 1 });
  const state = startEncounter(game);
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  for (const id of Object.values(STEAL_MONEY_OUTCOME)) {
    state.outcome = { id, moneyLost: 20 };
    const content = STEAL_MONEY_OBJECTIVE.renderTerminal(context);
    assert.equal(content.length, 1, id);
    assert.equal(content[0].type, "paragraph", id);
    assert.ok(content[0].text.length > 0, id);
    assert.doesNotMatch(content[0].text, /^The encounter is over\.$/, id);
  }
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
  leftHand.integrity = leftHand.maxIntegrity * 0.2;
  leftHand.acutePain = 0;
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
  assert.match(JSON.stringify(buildScene(high).content), /several steps|safe gap|jump back|spring/i);
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
  assert.equal(game.currentStory.id, "encounter.alley-jackie-introduction");
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
  actor.body.parts.find(({ id }) => id === "face").acutePain = painThreshold - 1;

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

test("a player at maximum pain can only writhe while the mugger follows the telegraphed intent", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  game.player.body.getPart("abdomen").acutePain = 90;
  game.player.setStatValue("energy", 0.5);

  const state = startEncounter(game);
  const telegraphedActionId = state.npcIntent.actionId;

  assert.equal(state.outcome, null);
  assert.equal(state.phase, "active");
  assert.equal(game.player.money, 50);
  assert.deepEqual(buildScene(game).sections.flatMap(({ choices }) => choices).map(({ label }) => label), [
    "Writhe in pain",
  ]);

  chooseAction(game, "writhe-in-pain");

  const next = game.currentStory.system.state;
  assert.ok(next.lastEvents.some(
    ({ type, reason }) => type === "participant.unable-to-act"
      && reason === "pain-overwhelmed",
  ));
  assert.ok(next.lastEvents.some(
    ({ type, actorId, actionId }) => type === "action.attempted"
      && actorId === "mugger"
      && actionId === telegraphedActionId,
  ));
  assert.ok(!next.lastEvents.some(({ type }) => type === "theft.completed"));
  assert.equal(game.player.money, 50);
  assert.match(JSON.stringify(buildScene(game).content), /pain|injur/i);
});

test("a structurally incapacitated player cannot create an actionless encounter", () => {
  const game = gameAtStart({ seed: 1, money: 50 });
  for (const partId of ["hand_l", "hand_r", "foot_l", "foot_r"]) {
    const part = game.player.body.getPart(partId);
    part.integrity = 0;
    part.acutePain = 0;
  }
  assert.equal(game.player.isIncapacitated(), true);

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

test("escape, attacker incapacitation, and theft from a pain-overwhelmed target are reachable", () => {
  const escape = gameAtStart({ seed: 10 });
  placePlayerAtAlley(escape);
  const escapeLocationId = escape.currentLocationId;
  startEncounter(escape);
  assert.equal(playUntilTerminal(escape, (game) =>
    findActionChoice(game, "run")
      ? "run"
      : findActionChoice(game, "create-distance")
        ? "create-distance"
        : findActionChoice(game, "wrench-free")
          ? "wrench-free"
          : "shove-away").id, "player-escaped");
  chooseAction(escape, "finish");
  assert.equal(escape.currentStory.id, "encounter.alley-jackie-introduction");
  assert.equal(escape.currentPlace.key, "alleyway");
  assert.equal(String(escape.currentLocationId), String(escapeLocationId));

  const cleanWin = gameAtStart({ seed: 2 });
  cleanWin.player.setSkillValue("strength", 10);
  placePlayerAtAlley(cleanWin);
  const cleanWinLocationId = cleanWin.currentLocationId;
  startEncounter(cleanWin);
  assert.equal(playUntilTerminal(cleanWin, (game) =>
    findActionChoice(game, "strike-holding-arm") ? "strike-holding-arm" : "strike-face").id,
  "mugger-incapacitated");
  chooseAction(cleanWin, "finish");
  assert.equal(cleanWin.currentStory.id, "encounter.alley-jackie-introduction");
  assert.equal(cleanWin.currentPlace.key, "alleyway");
  assert.equal(String(cleanWin.currentLocationId), String(cleanWinLocationId));

  const injuredLoss = gameAtStart({ seed: 1 });
  const injuredLossAlley = placePlayerAtAlley(injuredLoss);
  startEncounter(injuredLoss);
  injuredLoss.player.body.getPart("abdomen").acutePain = 77;
  assert.equal(playUntilTerminal(injuredLoss, (game) =>
    findActionChoice(game, "shove-away")
      ? "shove-away"
      : findActionChoice(game, "create-distance")
        ? "create-distance"
        : findActionChoice(game, "run")
          ? "run"
          : findActionChoice(game, "wrench-free")
            ? "wrench-free"
            : findActionChoice(game, "writhe-in-pain")
              ? "writhe-in-pain"
              : "cover-and-brace").id,
  "theft-completed-player-conscious");
  chooseAction(injuredLoss, "finish");
  assert.equal(injuredLoss.currentStory.id, "encounter.alley-jackie-introduction");
  assert.equal(injuredLoss.currentPlace.id, injuredLossAlley.id);
});
