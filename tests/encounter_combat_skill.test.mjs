import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import { buildPhonePlayerStatsView } from "../src/game/scene/phoneView.js";
import {
  ENCOUNTER_ACTIONS,
  getEncounterAction,
} from "../src/features/encounter/actions/index.js";
import {
  COMBAT_ACTION_MINIMUM_RANK,
  COMBAT_SKILL_SUCCESS_GAIN,
  awardCombatSkillForExchange,
  combatSkillProgress,
} from "../src/features/encounter/combatSkill.js";
import { settleEncounterConsequences } from "../src/features/encounter/consequences.js";
import { getEncounterObjectives } from "../src/features/encounter/objectives/index.js";
import {
  chooseAction,
  gameAtStart,
  startEncounter,
} from "./support/encounter.mjs";

function choices(game) {
  return buildScene(game).sections.flatMap(({ choices: sectionChoices }) => sectionChoices);
}

function actionChoices(game) {
  return choices(game).filter(({ action }) => action.command?.actionId);
}

function actionIds(game) {
  return actionChoices(game).map(({ action }) => action.command.actionId);
}

test("every attacker goal exposes a valid combat-laboratory default", () => {
  const objectives = getEncounterObjectives();
  assert.deepEqual(objectives.map(({ id }) => id).sort(), ["beat-down", "steal-money"]);
  for (const objective of objectives) {
    assert.equal(objective.laboratoryConfig.id, objective.id);
    assert.doesNotThrow(() => objective.validateConfig(
      structuredClone(objective.laboratoryConfig),
      (message) => { throw new Error(message); },
    ));
  }
});

test("every encounter action has an explicit combat rank", () => {
  assert.deepEqual(
    Object.keys(COMBAT_ACTION_MINIMUM_RANK).sort(),
    ENCOUNTER_ACTIONS.map(({ id }) => id).sort(),
  );
});

test("every damaging attack declares its escalation severity", () => {
  const severities = new Set(["light", "moderate", "severe"]);
  for (const action of ENCOUNTER_ACTIONS.filter(({ tags }) => tags.includes("attack"))) {
    assert.ok(severities.has(action.severity), `${action.id} is missing a valid severity`);
  }
});

test("combat skill uses five 100-point ranks with cross-rank demotion", () => {
  assert.deepEqual(combatSkillProgress(0), { rank: 0, points: 0, total: 0 });
  assert.deepEqual(combatSkillProgress(99.85), { rank: 0, points: 99.85, total: 99.85 });
  assert.deepEqual(combatSkillProgress(100), { rank: 1, points: 0, total: 100 });
  assert.deepEqual(combatSkillProgress(399), { rank: 3, points: 99, total: 399 });
  assert.deepEqual(combatSkillProgress(400), { rank: 4, points: 0, total: 400 });
  assert.deepEqual(combatSkillProgress(500), { rank: 4, points: 100, total: 500 });

  const game = gameAtStart({ combatSkill: 400 });
  game.player.adjustSkill("combat", -1);
  assert.deepEqual(combatSkillProgress(game.player.getSkillValue("combat")), {
    rank: 3,
    points: 99,
    total: 399,
  });
});

test("rank zero presents a compact broad action set with core fallbacks", () => {
  const game = gameAtStart({ combatSkill: 0 });
  startEncounter(game);

  assert.deepEqual(actionIds(game), [
    "surrender-money",
    "scream-for-help",
    "create-distance",
    "cover-and-brace",
    "drive-body",
  ]);
  assert.deepEqual(actionChoices(game).map(({ label }) => label), [
    "Give up and hand over £20",
    "Scream for help",
    "Try to get away",
    "Defend yourself",
    "Strike body",
  ]);
});

test("rank zero keeps a held-player response compact and non-technical", () => {
  const game = gameAtStart({ combatSkill: 0 });
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.relationships.holds.push({
    id: "hold-test",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 45,
  });
  state.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };

  const available = actionChoices(game);
  assert.ok(available.length < 10);
  assert.ok(available.some(({ label, action }) =>
    label === "Break away" && action.command.actionId === "wrench-free"));
  assert.ok(!available.some(({ action }) => [
    "strike-holding-arm",
    "grab-arm",
    "headbutt",
    "knee-strike",
  ].includes(action.command.actionId)));
});

test("combat ranks progressively replace broad choices with technical actions", () => {
  const novice = gameAtStart({ combatSkill: 100 });
  startEncounter(novice);
  assert.ok(actionChoices(novice).some(({ label }) => label === "Strike body (direct attack)"));
  assert.ok(!actionIds(novice).includes("strike-face"));

  const trained = gameAtStart({ combatSkill: 200 });
  startEncounter(trained);
  assert.ok(actionIds(trained).includes("strike-face"));
  assert.ok(actionIds(trained).includes("shove-away"));
  assert.equal(actionIds(trained).filter((id) => id === "grab-arm").length, 2);
  assert.ok(!actionIds(trained).includes("headbutt"));

  const advanced = gameAtStart({ combatSkill: 300 });
  const advancedState = startEncounter(advanced);
  advancedState.relationships.range[0].value = "clinch";
  advancedState.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };
  assert.ok(actionIds(advanced).includes("headbutt"));
  assert.ok(actionIds(advanced).includes("knee-strike"));

  const expert = gameAtStart({ combatSkill: 400 });
  startEncounter(expert);
  const expertPhysicalLabels = actionChoices(expert)
    .filter(({ action }) => ["drive-body", "cover-and-brace"].includes(action.command.actionId))
    .map(({ label }) => label);
  assert.ok(expertPhysicalLabels.every((label) => /\((?:acts first|same timing|acts after their move)\)$/.test(label)));
});

test("successful damaging and controlling actions award silent fractional progress", () => {
  const game = gameAtStart({ combatSkill: 0 });
  const state = startEncounter(game);
  game.player.setSkillValue("strength", 10);
  state.npcIntent = {
    actorId: "mugger",
    actionId: "drive-body",
    parameters: { targetId: "player", sourcePartId: "hand_l" },
  };

  chooseAction(game, "drive-body");

  assert.equal(game.player.getSkillValue("combat"), COMBAT_SKILL_SUCCESS_GAIN);
  assert.ok(!game.currentStory.system.state.lastEvents.some(({ type }) => type.includes("skill")));

  const beforeControl = game.player.getSkillValue("combat");
  const gained = awardCombatSkillForExchange(
    game.player,
    getEncounterAction("grab-arm"),
    "player",
    [{ type: "action.attempted", actorId: "player", actionId: "grab-arm" }],
  );
  assert.equal(gained, COMBAT_SKILL_SUCCESS_GAIN);
  assert.equal(game.player.getSkillValue("combat"), beforeControl + COMBAT_SKILL_SUCCESS_GAIN);

  const beforeFailure = game.player.getSkillValue("combat");
  assert.equal(awardCombatSkillForExchange(
    game.player,
    getEncounterAction("grab-arm"),
    "player",
    [
      { type: "action.attempted", actorId: "player", actionId: "grab-arm" },
      { type: "action.failed", actorId: "player", actionId: "grab-arm" },
    ],
  ), 0);
  assert.equal(game.player.getSkillValue("combat"), beforeFailure);
});

test("a combat loss applies one point once and the phone shows rank progress", () => {
  const game = gameAtStart({ combatSkill: 400 });
  startEncounter(game);
  const instanceKey = game.currentStory.instanceKey;

  chooseAction(game, "surrender-money");

  const terminal = game.currentStory.system.state;
  assert.equal(game.player.getSkillValue("combat"), 399);
  assert.equal(settleEncounterConsequences(game, terminal, instanceKey), false);
  assert.equal(game.player.getSkillValue("combat"), 399);

  const combat = buildPhonePlayerStatsView(game).skills.find(({ id }) => id === "combat");
  assert.deepEqual(combat, {
    id: "combat",
    label: "Combat",
    value: 99,
    min: 0,
    max: 100,
    rank: 3,
    total: 399,
  });
});
