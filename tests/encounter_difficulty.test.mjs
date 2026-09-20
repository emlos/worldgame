import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  FIGHT_SCENARIO,
  resolveTemporaryOpponentDifficulty,
} from "../src/features/encounter/scenarios/fight.js";
import { enterWGScene } from "../src/story/wg/runtime/storyRuntime.js";
import {
  ENCOUNTER_SCENE_ID,
  gameAtStart,
  startEncounter,
} from "./support/encounter.mjs";

const STAT_NAMES = Object.freeze(["strength", "endurance", "resolve", "fitness"]);

function configuredEncounter(difficulty, { seed = 117, playerStat = 5 } = {}) {
  const game = gameAtStart({ seed });
  for (const statName of STAT_NAMES) game.player.setSkillValue(statName, playerStat);
  enterWGScene(game, ENCOUNTER_SCENE_ID, { runOnEnter: false });
  const opponent = { id: "mugger", actor: "mugger" };
  if (difficulty !== undefined) opponent.difficulty = difficulty;
  const config = {
    scenario: "fight",
    opponent,
    goal: { id: "steal-money", maxAmount: 20 },
  };
  const state = FIGHT_SCENARIO.create({
    game,
    instanceKey: game.currentStory.instanceKey,
    config,
  });
  return { game, state, config, actor: game.currentStory.actors.mugger };
}

test("an omitted temporary-opponent difficulty resolves deterministically near player stats", () => {
  const first = configuredEncounter(undefined, { seed: 431, playerStat: 5 });
  const second = configuredEncounter(undefined, { seed: 431, playerStat: 5 });

  assert.deepEqual(first.actor.stats, second.actor.stats);
  for (const statName of STAT_NAMES) {
    assert.ok(first.actor.stats[statName] >= 3 && first.actor.stats[statName] <= 7);
    assert.ok(Math.abs(first.actor.stats[statName] - 5) >= 1);
  }
  assert.deepEqual(first.actor.meta.combatDifficulty, {
    difficulty: "relative",
    instanceKey: first.game.currentStory.instanceKey,
  });

  first.actor.stats.strength = 9;
  resolveTemporaryOpponentDifficulty(
    first.game,
    first.game.currentStory.instanceKey,
    first.config,
  );
  assert.equal(first.actor.stats.strength, 9, "difficulty resolution is idempotent");
});

test("declared temporary-opponent difficulties use their player-relative ranges", () => {
  const expectedRanges = {
    easy: [3, 4],
    medium: [4, 6],
    hard: [6, 7],
  };
  for (const [difficulty, [min, max]] of Object.entries(expectedRanges)) {
    const { actor } = configuredEncounter(difficulty, { seed: 901, playerStat: 5 });
    for (const statName of STAT_NAMES) {
      assert.ok(
        actor.stats[statName] >= min && actor.stats[statName] <= max,
        `${difficulty} ${statName} should be within ${min}..${max}`,
      );
    }
  }

  const { actor } = configuredEncounter("maxed", { playerStat: 5 });
  assert.deepEqual(actor.stats, {
    strength: 10,
    endurance: 10,
    resolve: 10,
    fitness: 10,
  });
});

test("temporary-opponent difficulty clamps every resolved stat to 0..10", () => {
  const easy = configuredEncounter("easy", { playerStat: 0 }).actor;
  const hard = configuredEncounter("hard", { playerStat: 10 }).actor;
  for (const statName of STAT_NAMES) {
    assert.equal(easy.stats[statName], 0);
    assert.equal(hard.stats[statName], 10);
  }
});

test("temporary-opponent difficulty is a strict actor-only enum", () => {
  const base = {
    scenario: "fight",
    goal: { id: "steal-money", maxAmount: 20 },
  };
  assert.throws(
    () => FIGHT_SCENARIO.validateConfig({
      ...base,
      opponent: { id: "mugger", actor: "mugger", difficulty: "nightmare" },
    }),
    /must be easy, medium, hard, or maxed/,
  );
  assert.throws(
    () => FIGHT_SCENARIO.validateConfig({
      ...base,
      opponent: { id: "jackie", npc: "jackie", difficulty: "easy" },
    }),
    /supported only for temporary actors/,
  );
});

test("active temporary-actor encounters expose a qualitative opponent threat level", () => {
  const game = gameAtStart({ seed: 333 });
  for (const statName of STAT_NAMES) game.player.setSkillValue(statName, 5);
  startEncounter(game);

  const scene = buildScene(game);
  assert.ok(scene.content.some(
    ({ text }) => /^Opponent threat level: (Low|Comparable|High|Extreme)\.$/.test(text),
  ));

  const context = createCombatContext({
    game,
    state: game.currentStory.system.state,
    instanceKey: game.currentStory.instanceKey,
  });
  assert.match(FIGHT_SCENARIO.opponentThreatLevel(context), /Low|Comparable|High|Extreme/);
});
