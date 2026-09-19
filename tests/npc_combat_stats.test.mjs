import test from "node:test";
import assert from "node:assert/strict";

import { NPC_REGISTRY } from "../src/characters/npc/npcs.js";
import { AI_PERSONALITY_IDS } from "../src/features/encounter/personality.js";

const COMBAT_STATS = Object.freeze(["strength", "endurance", "resolve", "fitness"]);

test("every persistent NPC has hardcoded combat stats", () => {
  for (const definition of NPC_REGISTRY) {
    for (const stat of COMBAT_STATS) {
      assert.ok(
        Number.isFinite(definition.stats?.[stat]),
        `${definition.id} must define ${stat}`,
      );
      assert.ok(
        definition.stats[stat] >= 0 && definition.stats[stat] <= 10,
        `${definition.id}.${stat} must be from 0 through 10`,
      );
    }
  }
});

test("every persistent NPC has a hardcoded combat personality", () => {
  const expected = {
    taylor: "skittish",
    jackie: "forceful",
    shade: "opportunist",
    officer_vega: "forceful",
    caro: "skittish",
    mike: "skittish",
    vinny: "opportunist",
    kim: "forceful",
  };

  assert.deepEqual(
    Object.fromEntries(NPC_REGISTRY.map(({ id, meta }) => [id, meta.combatPersonalityId])),
    expected,
  );
  for (const definition of NPC_REGISTRY) {
    assert.ok(
      AI_PERSONALITY_IDS.includes(definition.meta.combatPersonalityId),
      `${definition.id} must use a registered combat personality`,
    );
  }
});

test("Jackie is a schedule-free persistent combat coach", () => {
  const jackie = NPC_REGISTRY.find(({ id }) => id === "jackie");

  assert.ok(jackie);
  assert.equal(jackie.name, "Jackie");
  assert.equal(jackie.meta.shortName, "Jackie");
  assert.equal(jackie.meta.combatPersonalityId, "forceful");
  assert.deepEqual(jackie.pronouns, {
    subject: "they",
    object: "them",
    dependent: "their",
    independent: "theirs",
    reflexive: "themself",
  });
  assert.equal(jackie.behavior, null);
  assert.equal(jackie.stats.strength, 6);
  assert.equal(jackie.stats.endurance, 7);
  assert.equal(jackie.stats.resolve, 7);
  assert.equal(jackie.stats.fitness, 6);
});
