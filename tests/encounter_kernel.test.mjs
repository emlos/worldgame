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
import { createCombatStressState } from "../src/features/encounter/stress.js";
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
    opponentRef: { type: "scene-actor", alias: "mugger" },
    objective,
    personalityId: "opportunist",
    stress: createCombatStressState(game),
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
  assert.equal(coreIds.has("attack-limb"), false);
  assert.equal(coreIds.has("strike-face"), true);
});

test("fight outcome routing selects an authored target with a final-target fallback", () => {
  const definition = { finalTarget: "fallback.target" };
  const routed = FIGHT_SCENARIO.finish({
    config: { outcomes: { "mugger-fled": "victory.target" } },
    definition,
    state: {
      objective: { id: "steal-money" },
      outcome: { id: "mugger-fled" },
    },
  });
  const fallback = FIGHT_SCENARIO.finish({
    config: {},
    definition,
    state: {
      objective: { id: "steal-money" },
      outcome: { id: "unmapped" },
    },
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
    state: {
      objective: { id: "steal-money" },
      outcome: { id: "player-escaped" },
    },
  });

  assert.deepEqual(result, { ...route, leavePlace: true });
  assert.notEqual(result.effects, route.effects);
});

test("fight outcome routing derives post-combat place changes and permits authored overrides", () => {
  const definition = { finalTarget: "fallback.target" };
  const escaped = FIGHT_SCENARIO.finish({
    config: {},
    definition,
    state: {
      objective: { id: "steal-money" },
      outcome: { id: "player-escaped" },
    },
  });
  const stayedByAuthor = FIGHT_SCENARIO.finish({
    config: {
      outcomes: {
        "mugger-incapacitated": {
          target: "special.target",
          leavePlace: false,
        },
      },
    },
    definition,
    state: {
      objective: { id: "steal-money" },
      outcome: { id: "mugger-incapacitated" },
    },
  });
  const removedAfterLoss = FIGHT_SCENARIO.finish({
    config: {
      outcomes: {
        "player-surrendered-money": {
          target: "special.target",
          leavePlace: true,
        },
      },
    },
    definition,
    state: {
      objective: { id: "steal-money" },
      outcome: { id: "player-surrendered-money" },
    },
  });
  const beatDownWin = FIGHT_SCENARIO.finish({
    config: {},
    definition,
    state: {
      objective: { id: "beat-down" },
      outcome: { id: "attacker-incapacitated" },
    },
  });
  const beatenDown = FIGHT_SCENARIO.finish({
    config: {},
    definition,
    state: {
      objective: { id: "beat-down" },
      outcome: { id: "player-beaten-down" },
    },
  });

  assert.deepEqual(escaped, { target: "fallback.target", leavePlace: true });
  assert.deepEqual(stayedByAuthor, { target: "special.target" });
  assert.deepEqual(removedAfterLoss, {
    target: "special.target",
    leavePlace: true,
  });
  assert.deepEqual(beatDownWin, {
    target: "fallback.target",
    leavePlace: true,
  });
  assert.deepEqual(beatenDown, { target: "fallback.target" });
});
