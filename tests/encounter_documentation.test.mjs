import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  COMBAT_SKILL_MAX_POINTS,
  COMBAT_SKILL_RANK_THRESHOLDS,
} from "../src/characters/player/stats.js";
import { AI_PERSONALITY_IDS } from "../src/features/encounter/personality.js";
import { ENCOUNTER_STATE_VERSION } from "../src/features/encounter/state.js";

const combatReference = await readFile(
  new URL("../docs/physical-encounter-system-reference.md", import.meta.url),
  "utf8",
);
const wgReference = await readFile(
  new URL("../docs/wg-language.md", import.meta.url),
  "utf8",
);
const combatLab = await readFile(
  new URL("./combat_inspector.js", import.meta.url),
  "utf8",
);

test("combat documentation tracks serialized state and progression constants", () => {
  assert.ok(combatReference.includes(
    `exact serialized version is \`${ENCOUNTER_STATE_VERSION}\``,
  ));
  assert.ok(combatReference.includes(
    `Combat is one total from \`0\` through \`${COMBAT_SKILL_MAX_POINTS}\``,
  ));
  COMBAT_SKILL_RANK_THRESHOLDS.forEach((start, rank) => {
    const lastRank = rank === COMBAT_SKILL_RANK_THRESHOLDS.length - 1;
    const end = lastRank
      ? COMBAT_SKILL_MAX_POINTS
      : COMBAT_SKILL_RANK_THRESHOLDS[rank + 1] - 1;
    const width = (lastRank
      ? COMBAT_SKILL_MAX_POINTS
      : COMBAT_SKILL_RANK_THRESHOLDS[rank + 1]) - start;
    const display = lastRank
      ? `Rank ${rank}; ${COMBAT_SKILL_MAX_POINTS} displays ${width}/${width}`
      : `Rank ${rank}; ${width} points wide`;
    assert.ok(combatReference.includes(`| \`${start}..${end}\` | ${display} |`));
  });
});

test("combat documentation contains add and removal tutorials for extension registries", () => {
  for (const heading of [
    "### Add an NPC AI personality",
    "### Remove or rename an NPC AI personality",
    "### Add or modify an objective",
    "### Add or modify a move",
    "### Remove or rename a move",
    "### Add or remove a fight scenario",
  ]) {
    assert.ok(combatReference.includes(heading), `missing tutorial heading: ${heading}`);
  }
  for (const personalityId of AI_PERSONALITY_IDS) {
    assert.ok(combatReference.includes(`\`${personalityId}\``));
  }
  assert.ok(wgReference.includes("#### Physical encounters"));
  assert.ok(wgReference.includes("@system encounter.physical"));
});

test("the combat lab follows live skill limits and has no fixed mugger diagnostic", () => {
  assert.ok(combatLab.includes("max: COMBAT_SKILL_MAX_POINTS"));
  assert.ok(!combatLab.includes("snapshot.combatants.mugger"));
  assert.ok(!combatLab.includes("generateSceneActors"));
});
