import test from "node:test";
import assert from "node:assert/strict";

import { getAvailableActionInstances } from "../src/features/encounter/availability.js";
import { selectAiIntent } from "../src/features/encounter/ai.js";
import { CORE_ENCOUNTER_ACTIONS } from "../src/features/encounter/actions/index.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import { STEAL_MONEY_OBJECTIVE } from "../src/features/encounter/objectives/steal.js";
import { resolveEncounterExchange } from "../src/features/encounter/resolution.js";
import { FIGHT_SCENARIO } from "../src/features/encounter/scenarios/fight.js";
import { createFightState, validateEncounterState } from "../src/features/encounter/state.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

test("the fight kernel resolves actions with an arbitrary opponent participant id", () => {
  const game = gameAtStart({ seed: 712 });
  startEncounter(game);
  const objective = STEAL_MONEY_OBJECTIVE.create({
    game,
    config: { id: "steal-money", maxAmount: 20 },
  });
  const state = createFightState({
    opponentId: "attacker",
    opponentAlias: "mugger",
    objective,
    personalityId: "opportunist",
  });
  const instanceKey = game.currentStory.instanceKey;
  let context = createCombatContext({ game, state, instanceKey });
  state.npcIntent = selectAiIntent(context);
  validateEncounterState(state);

  const playerAction = getAvailableActionInstances(context, "player")
    .find(({ actionId }) => actionId === "cover-and-brace");
  assert.ok(playerAction);
  const next = resolveEncounterExchange({ game, state, instanceKey, playerAction });

  assert.ok(next.participants.attacker);
  assert.equal(next.objective.ownerId, "attacker");
  assert.equal(next.npcIntent?.actorId, "attacker");
  assert.equal(Object.hasOwn(next.participants, "mugger"), false);
});

test("core action packs exclude theft actions", () => {
  const coreIds = new Set(CORE_ENCOUNTER_ACTIONS.map(({ id }) => id));
  assert.equal(coreIds.has("search-money"), false);
  assert.equal(coreIds.has("surrender-money"), false);
  assert.equal(coreIds.has("demand-money-back"), false);
  assert.equal(coreIds.has("strike-face"), true);
});

test("fight outcome routing selects an authored target with a final-target fallback", () => {
  const definition = { finalTarget: "fallback.target" };
  const routed = FIGHT_SCENARIO.finish({
    config: { outcomes: { "mugger-fled": "victory.target" } },
    definition,
    state: { outcome: { id: "mugger-fled" } },
  });
  const fallback = FIGHT_SCENARIO.finish({
    config: {},
    definition,
    state: { outcome: { id: "unmapped" } },
  });

  assert.deepEqual(routed, { target: "victory.target" });
  assert.deepEqual(fallback, { target: "fallback.target" });
});

test("fight outcome routing can return story effects and response paragraphs", () => {
  const route = {
    target: "aftermath.target",
    effects: [{ op: "set", path: "flags.test", value: true }],
    paragraphs: ["The confrontation changes what happens next."],
  };
  const result = FIGHT_SCENARIO.finish({
    config: { outcomes: { "player-escaped": route } },
    definition: { finalTarget: "fallback.target" },
    state: { outcome: { id: "player-escaped" } },
  });

  assert.deepEqual(result, route);
  assert.notEqual(result.effects, route.effects);
});
