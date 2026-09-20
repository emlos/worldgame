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
  COMBAT_SKILL_ENCOUNTER_CAP,
  awardCombatSkillForExchange,
  combatSkillProgress,
  settleCombatSkillProgress,
} from "../src/features/encounter/combatSkill.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import { calculateExertionCost } from "../src/features/encounter/effort.js";
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

test("combat skill uses escalating five-rank thresholds", () => {
  assert.deepEqual(combatSkillProgress(0), { rank: 0, points: 0, pointsForRank: 25, total: 0 });
  assert.deepEqual(combatSkillProgress(24), { rank: 0, points: 24, pointsForRank: 25, total: 24 });
  assert.deepEqual(combatSkillProgress(25), { rank: 1, points: 0, pointsForRank: 50, total: 25 });
  assert.deepEqual(combatSkillProgress(75), { rank: 2, points: 0, pointsForRank: 75, total: 75 });
  assert.deepEqual(combatSkillProgress(150), { rank: 3, points: 0, pointsForRank: 125, total: 150 });
  assert.deepEqual(combatSkillProgress(275), { rank: 4, points: 0, pointsForRank: 125, total: 275 });
  assert.deepEqual(combatSkillProgress(400), { rank: 4, points: 125, pointsForRank: 125, total: 400 });
});

test("rank zero presents a compact broad action set with core fallbacks", () => {
  const game = gameAtStart({ combatSkill: 0 });
  startEncounter(game);

  assert.deepEqual(actionIds(game), [
    "drive-body",
    "cover-and-brace",
    "surrender-money",
    "scream-for-help",
    "create-distance",
  ]);
  assert.deepEqual(actionChoices(game).map(({ label }) => label), [
    "Strike body",
    "Defend yourself",
    "Give up and hand over £20",
    "Scream for help",
    "Try to get away",
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
  const novice = gameAtStart({ combatSkill: 25 });
  startEncounter(novice);
  assert.ok(actionChoices(novice).some(({ label }) => label.startsWith("Strike body (direct attack) [")));
  assert.ok(actionIds(novice).includes("shove-away"));
  assert.ok(!actionIds(novice).includes("strike-face"));

  const trained = gameAtStart({ combatSkill: 75 });
  startEncounter(trained);
  assert.ok(actionIds(trained).includes("strike-face"));
  assert.ok(actionIds(trained).includes("shove-away"));
  assert.equal(actionIds(trained).filter((id) => id === "grab-arm").length, 2);
  assert.ok(!actionIds(trained).includes("headbutt"));

  const advanced = gameAtStart({ combatSkill: 150 });
  const advancedState = startEncounter(advanced);
  advancedState.relationships.range[0].value = "clinch";
  advancedState.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };
  assert.ok(actionIds(advanced).includes("headbutt"));
  assert.ok(actionIds(advanced).includes("knee-strike"));

  const expert = gameAtStart({ combatSkill: 275 });
  startEncounter(expert);
  const expertPhysicalLabels = actionChoices(expert)
    .filter(({ action }) => ["drive-body", "cover-and-brace"].includes(action.command.actionId))
    .map(({ label }) => label);
  assert.ok(expertPhysicalLabels.every((label) =>
    /\[(?:acts first|same timing|acts after their move)(?:; .+)?\]$/.test(label)));
  assert.ok(expertPhysicalLabels.some((label) => /\d+% estimated chance/.test(label)));
});

test("only the first successful technique in each category awards practice", () => {
  const game = gameAtStart({ combatSkill: 0 });
  const state = startEncounter(game);
  game.player.setSkillValue("strength", 10);
  state.npcIntent = {
    actorId: "mugger",
    actionId: "drive-body",
    parameters: { targetId: "player", sourcePartId: "hand_l" },
  };

  chooseAction(game, "drive-body");

  assert.equal(game.player.getSkillValue("combat"), 1);
  const learning = game.currentStory.system.state.combatLearning;
  assert.deepEqual(learning.successfulCategories, ["attack"]);

  const beforeControl = game.player.getSkillValue("combat");
  const gained = awardCombatSkillForExchange(
    game.player,
    learning,
    getEncounterAction("grab-arm"),
    "player",
    [{ type: "action.attempted", actorId: "player", actionId: "grab-arm" }],
  );
  assert.equal(gained, 1);
  assert.equal(game.player.getSkillValue("combat"), beforeControl + 1);

  assert.equal(awardCombatSkillForExchange(
    game.player,
    learning,
    getEncounterAction("grab-arm"),
    "player",
    [{ type: "action.attempted", actorId: "player", actionId: "grab-arm" }],
  ), 0);

  const beforeFailure = game.player.getSkillValue("combat");
  assert.equal(awardCombatSkillForExchange(
    game.player,
    learning,
    getEncounterAction("grab-arm"),
    "player",
    [
      { type: "action.attempted", actorId: "player", actionId: "grab-arm" },
      { type: "action.failed", actorId: "player", actionId: "grab-arm" },
    ],
  ), 0);
  assert.equal(game.player.getSkillValue("combat"), beforeFailure);
});

test("an encounter awards outcome progress once, never subtracts skill, and reports rank progress", () => {
  const game = gameAtStart({ combatSkill: 24 });
  startEncounter(game);
  const instanceKey = game.currentStory.instanceKey;

  chooseAction(game, "surrender-money");

  const terminal = game.currentStory.system.state;
  assert.equal(game.player.getSkillValue("combat"), 29);
  assert.equal(settleEncounterConsequences(game, terminal, instanceKey), false);
  assert.equal(game.player.getSkillValue("combat"), 29);
  assert.deepEqual(terminal.combatLearning.successfulCategories, []);
  assert.ok(terminal.combatLearning.pointsAwarded <= COMBAT_SKILL_ENCOUNTER_CAP);
  assert.match(
    buildScene(game).content.map(({ text }) => text).join(" "),
    /Combat experience: \+5\. You reached Combat rank 1\./,
  );

  const combat = buildPhonePlayerStatsView(game).skills.find(({ id }) => id === "combat");
  assert.deepEqual(combat, {
    id: "combat",
    label: "Combat",
    value: 4,
    min: 0,
    max: 50,
    rank: 1,
    total: 29,
  });
});

test("varied practice and encounter rewards cannot exceed ten points", () => {
  const game = gameAtStart({ combatSkill: 0 });
  const state = startEncounter(game);
  const learning = state.combatLearning;
  const successEvents = (actionId, extra = []) => [
    { type: "action.attempted", actorId: "player", actionId },
    ...extra,
  ];
  awardCombatSkillForExchange(game.player, learning, getEncounterAction("drive-body"), "player", successEvents(
    "drive-body",
    [{ type: "impact.landed", actorId: "player", targetId: "mugger" }],
  ));
  awardCombatSkillForExchange(game.player, learning, getEncounterAction("grab-arm"), "player", successEvents("grab-arm"));
  awardCombatSkillForExchange(game.player, learning, getEncounterAction("create-distance"), "player", successEvents(
    "create-distance",
    [{ type: "range.changed", from: "reach", to: "apart" }],
  ));
  awardCombatSkillForExchange(game.player, learning, getEncounterAction("cover-and-brace"), "player", successEvents("cover-and-brace"));

  state.exchange = 4;
  state.outcome = { id: "player-escaped" };
  learning.difficultyBonus = 2;
  settleCombatSkillProgress(game.player, state, []);

  assert.equal(learning.pointsAwarded, COMBAT_SKILL_ENCOUNTER_CAP);
  assert.equal(game.player.getSkillValue("combat"), COMBAT_SKILL_ENCOUNTER_CAP);
  assert.equal(Object.values(learning.breakdown).reduce((sum, value) => sum + value, 0), 10);
});

test("expert Combat reduces player exertion without changing NPC costs", () => {
  const novice = gameAtStart({ combatSkill: 274 });
  const noviceState = startEncounter(novice);
  const noviceContext = createCombatContext({
    game: novice,
    state: noviceState,
    instanceKey: novice.currentStory.instanceKey,
  });
  const expert = gameAtStart({ combatSkill: 275 });
  const expertState = startEncounter(expert);
  const expertContext = createCombatContext({
    game: expert,
    state: expertState,
    instanceKey: expert.currentStory.instanceKey,
  });

  assert.ok(
    calculateExertionCost(expertContext, "player", 10)
      < calculateExertionCost(noviceContext, "player", 10),
  );
  assert.equal(
    calculateExertionCost(expertContext, "mugger", 10),
    calculateExertionCost(noviceContext, "mugger", 10),
  );
});
