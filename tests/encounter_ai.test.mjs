import test from "node:test";
import assert from "node:assert/strict";

import {
  getMuggerCommitment,
  selectNpcIntent,
} from "../src/features/encounter/ai.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

test("NPC intent is stored and pure re-selection is deterministic", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  assert.deepEqual(selectNpcIntent(context), selectNpcIntent(context));
  assert.deepEqual(state.npcIntent, selectNpcIntent(context));
});

test("low commitment gives retreat hard priority", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.elapsedSeconds = 100;
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  assert.equal(getMuggerCommitment(context), 0);
  assert.equal(selectNpcIntent(context).actionId, "flee");
});

