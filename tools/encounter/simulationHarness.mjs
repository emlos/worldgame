import { Game } from "../../src/game/game.js";
import { getAvailableActionInstances } from "../../src/features/encounter/availability.js";
import { createCombatContext, getBodyPain } from "../../src/features/encounter/combatants.js";
import { resolveEncounterExchange } from "../../src/features/encounter/resolution.js";
import { collectEncounterInvariantDiagnostics } from "../../src/features/encounter/debug.js";
import { getMuggerPersonality } from "../../src/features/encounter/personality.js";
import { enterWGScene, resolveActiveWGStory } from "../../src/story/wg/runtime/storyRuntime.js";

const SCENE_ID = "encounter.alley-mugging";
const FIXED_START = new Date("2026-09-11T20:00:00.000Z");

export const PLAYER_POLICIES = Object.freeze({
  escape: Object.freeze([
    "run", "create-distance", "wrench-free", "strike-holding-arm", "shove-away",
    "stand-up", "roll-toward", "headbutt", "knee-strike", "strike-face",
    "drive-body", "grab-arm", "cover-and-brace",
  ]),
  fight: Object.freeze([
    "strike-holding-arm", "headbutt", "strike-face", "knee-strike", "drive-body",
    "wrench-free", "stand-up", "roll-toward", "shove-away", "create-distance",
    "run", "grab-arm", "cover-and-brace",
  ]),
  resist: Object.freeze([
    "wrench-free", "strike-holding-arm", "shove-away", "create-distance", "stand-up",
    "roll-toward", "headbutt", "strike-face", "knee-strike", "drive-body",
    "run", "cover-and-brace",
  ]),
  brace: Object.freeze(["cover-and-brace"]),
});

function setStats(target, stats, setter = null) {
  for (const [name, value] of Object.entries(stats || {})) {
    if (setter) setter(name, value);
    else target[name] = value;
  }
}

function chooseByPolicy(available, policy) {
  const priorities = PLAYER_POLICIES[policy];
  if (!priorities) throw new Error(`Unknown encounter simulation policy '${policy}'`);
  for (const actionId of priorities) {
    const found = available.find((candidate) => candidate.actionId === actionId);
    if (found) return found;
  }
  return available[0] || null;
}

function longestStreak(actionIds) {
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const actionId of actionIds) {
    current = actionId === previous ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = actionId;
  }
  return longest;
}

export function runEncounterSimulation({
  seed = 1,
  money = 50,
  playerStats = {},
  npcStats = {},
  policy = "escape",
  personalityId = null,
  maxExchanges = 60,
} = {}) {
  const game = new Game({ seed, startDate: FIXED_START, playerOptions: { startPlaceId: null, money } });
  setStats(null, playerStats, (name, value) => game.player.setSkillValue(name, value));
  enterWGScene(game, SCENE_ID);
  setStats(game.currentStory.actors.mugger.stats, npcStats);
  resolveActiveWGStory(game);
  if (personalityId) {
    const participant = game.currentStory.system.state.participants.mugger;
    const oldBias = getMuggerPersonality(participant.personalityId).commitmentBias;
    const newPersonality = getMuggerPersonality(personalityId);
    participant.personalityId = personalityId;
    participant.commitmentBase = Math.max(0, Math.min(100,
      participant.commitmentBase - oldBias + newPersonality.commitmentBias));
  }

  const instanceKey = game.currentStory.instanceKey;
  const npcActions = [];
  const playerActions = [];
  const rolls = [];
  let invariantFailure = null;
  while (game.currentStory.system.state.phase === "active"
    && game.currentStory.system.state.exchange < maxExchanges) {
    const state = game.currentStory.system.state;
    const context = createCombatContext({ game, state, instanceKey });
    const invariants = collectEncounterInvariantDiagnostics(context);
    if (!invariants.valid) {
      invariantFailure = invariants.checks.find(({ valid }) => !valid);
      break;
    }
    const playerAction = chooseByPolicy(getAvailableActionInstances(context, "player"), policy);
    if (!playerAction) throw new Error("Simulation reached an active state with no player action");
    npcActions.push(state.npcIntent.actionId);
    playerActions.push(playerAction.actionId);
    game.currentStory.system.state = resolveEncounterExchange({ game, state, instanceKey, playerAction });
    for (const event of game.currentStory.system.state.lastEvents) {
      if (event.type === "chance.rolled") rolls.push({ exchange: state.exchange, ...event });
    }
  }

  const state = game.currentStory.system.state;
  const context = createCombatContext({ game, state, instanceKey });
  const actionCounts = Object.fromEntries([...new Set(npcActions)].sort().map((actionId) => [
    actionId,
    npcActions.filter((candidate) => candidate === actionId).length,
  ]));
  return {
    seed,
    policy,
    personalityId: state.participants.mugger.personalityId,
    outcome: state.outcome?.id || (invariantFailure ? "invariant-failure" : "timeout"),
    exchanges: state.exchange,
    elapsedSeconds: state.elapsedSeconds,
    playerPain: Math.round(getBodyPain(context, "player") * 100) / 100,
    npcPain: Math.round(getBodyPain(context, "mugger") * 100) / 100,
    moneyLost: state.outcome?.moneyLost || 0,
    npcActionCounts: actionCounts,
    npcLongestRepeatStreak: longestStreak(npcActions),
    npcActions,
    playerActions,
    rolls,
    invariantFailure,
  };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
}

export function runStatDifferenceMatrix({
  seedCount = 20,
  statDifferences = [-4, -2, 0, 2, 4],
  baseline = 5,
  policy = "escape",
} = {}) {
  return statDifferences.map((difference) => {
    const playerValue = Math.max(1, Math.min(10, baseline + difference));
    const runs = Array.from({ length: seedCount }, (_, index) => runEncounterSimulation({
      seed: 1000 + index,
      policy,
      playerStats: { strength: playerValue, endurance: playerValue, resolve: playerValue, fitness: playerValue },
      npcStats: { strength: baseline, endurance: baseline, resolve: baseline },
    }));
    const outcomeCounts = {};
    const actionCounts = {};
    for (const run of runs) {
      outcomeCounts[run.outcome] = (outcomeCounts[run.outcome] || 0) + 1;
      for (const [actionId, count] of Object.entries(run.npcActionCounts)) {
        actionCounts[actionId] = (actionCounts[actionId] || 0) + count;
      }
    }
    return {
      statDifference: difference,
      playerValue,
      runs: runs.length,
      outcomeCounts,
      actionCounts,
      meanExchanges: Math.round(runs.reduce((sum, run) => sum + run.exchanges, 0) / runs.length * 100) / 100,
      p90Exchanges: percentile(runs.map(({ exchanges }) => exchanges), 0.9),
      meanElapsedSeconds: Math.round(runs.reduce((sum, run) => sum + run.elapsedSeconds, 0) / runs.length * 100) / 100,
      meanNpcRepeatStreak: Math.round(runs.reduce((sum, run) => sum + run.npcLongestRepeatStreak, 0) / runs.length * 100) / 100,
      meanRolls: Math.round(runs.reduce((sum, run) => sum + run.rolls.length, 0) / runs.length * 100) / 100,
      rollSuccessRate: Math.round(
        runs.flatMap(({ rolls }) => rolls).filter(({ success }) => success).length
        / Math.max(1, runs.flatMap(({ rolls }) => rolls).length) * 1000,
      ) / 1000,
      invariantFailures: runs.filter(({ invariantFailure }) => invariantFailure).length,
      timeouts: runs.filter(({ outcome }) => outcome === "timeout").length,
      results: runs,
    };
  });
}
