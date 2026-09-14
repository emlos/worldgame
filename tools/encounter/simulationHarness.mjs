import { Game } from "../../src/game/game.js";
import {
  getActionAvailabilityDiagnostics,
  getActionPurpose,
  getAvailableActionInstances,
} from "../../src/features/encounter/availability.js";
import { ENCOUNTER_ACTIONS } from "../../src/features/encounter/actions/index.js";
import {
  createCombatContext,
  getBodyPain,
  persistCombatantBodies,
} from "../../src/features/encounter/combatants.js";
import { resolveEncounterExchange } from "../../src/features/encounter/resolution.js";
import { collectEncounterInvariantDiagnostics } from "../../src/features/encounter/debug.js";
import { getAiPersonality } from "../../src/features/encounter/personality.js";
import { selectAiIntent, syncObjectiveStage } from "../../src/features/encounter/ai.js";
import { FIGHT_SCENARIO } from "../../src/features/encounter/scenarios/fight.js";
import { enterWGScene, resolveActiveWGStory } from "../../src/story/wg/runtime/storyRuntime.js";

const SCENE_ID = "encounter.alley-mugging";
const FIXED_START = new Date("2026-09-11T20:00:00.000Z");

export const PLAYER_POLICIES = Object.freeze({
  escape: Object.freeze([
    "controlled-disengage", "run", "create-distance", "wrench-free", "strike-holding-arm", "shove-away",
    "stand-up", "roll-toward", "headbutt", "knee-strike", "strike-face",
    "drive-body", "grab-arm", "force-to-ground", "force-to-wall", "turn-target-away",
    "pin-limb", "tighten-hold", "catch-breath", "cover-and-brace",
  ]),
  fight: Object.freeze([
    "demand-money-back", "strike-holding-arm", "headbutt", "strike-face", "knee-strike", "drive-body",
    "wrench-free", "stand-up", "roll-toward", "shove-away", "create-distance",
    "run", "pin-limb", "turn-target-away", "force-to-ground", "force-to-wall",
    "tighten-hold", "grab-arm", "controlled-disengage", "catch-breath", "cover-and-brace",
  ]),
  resist: Object.freeze([
    "demand-money-back", "controlled-disengage", "wrench-free", "strike-holding-arm",
    "shove-away", "create-distance", "stand-up",
    "roll-toward", "headbutt", "strike-face", "knee-strike", "drive-body",
    "run", "pin-limb", "turn-target-away", "force-to-ground", "force-to-wall",
    "tighten-hold", "grab-arm", "catch-breath", "cover-and-brace",
  ]),
  brace: Object.freeze([
    "cover-and-brace", "catch-breath", "wrench-free", "stand-up", "roll-toward", "shove-away",
    "create-distance", "run", "strike-holding-arm", "drive-body", "strike-face",
    "controlled-disengage", "demand-money-back", "grab-arm", "tighten-hold",
    "pin-limb", "turn-target-away", "force-to-ground", "force-to-wall",
  ]),
  control: Object.freeze([
    "demand-money-back", "controlled-disengage", "pin-limb", "turn-target-away",
    "force-to-ground", "force-to-wall", "tighten-hold", "grab-arm", "wrench-free",
    "strike-holding-arm", "stand-up", "roll-toward", "shove-away", "create-distance",
    "run", "headbutt", "knee-strike", "drive-body", "strike-face", "catch-breath",
    "cover-and-brace",
  ]),
  surrender: Object.freeze(["surrender-money"]),
});

export const ENCOUNTER_SIMULATION_SCENARIOS = Object.freeze([
  Object.freeze({
    id: "baseline",
    defaultPolicy: "escape",
    description: "The ordinary alley opening at reach with healthy standing participants.",
  }),
  Object.freeze({
    id: "player-wall-pinned",
    defaultPolicy: "resist",
    description: "The player is off balance with one arm pinned against a wall.",
  }),
  Object.freeze({
    id: "player-grounded-injured",
    defaultPolicy: "resist",
    description: "The player starts hurt, winded, off balance, grounded, and under a knee pin.",
  }),
  Object.freeze({
    id: "mutual-grips",
    defaultPolicy: "fight",
    description: "Both participants control the other's opposite arm in a clinch.",
  }),
  Object.freeze({
    id: "player-complete-control",
    defaultPolicy: "control",
    description: "The player securely controls both wrists after money has already been taken.",
  }),
  Object.freeze({
    id: "beat-down-baseline",
    defaultPolicy: "fight",
    goal: Object.freeze({ id: "beat-down" }),
    description: "A persistent attacker tries to maximize pain or disable the player's limbs.",
  }),
]);

const SCENARIO_BY_ID = new Map(ENCOUNTER_SIMULATION_SCENARIOS.map((scenario) => [
  scenario.id,
  scenario,
]));

const PLAYER_ACTION_IDS = Object.freeze(
  ENCOUNTER_ACTIONS
    .filter(({ usableBy }) => usableBy === "any" || usableBy === "controlled")
    .map(({ id }) => id)
    .sort(),
);

function setStats(target, stats, setter = null) {
  for (const [name, value] of Object.entries(stats || {})) {
    if (setter) setter(name, value);
    else target[name] = value;
  }
}

function damagePart(context, actorId, partId, amount) {
  const part = context.combatants[actorId].body.applyDamage({ partId, amount });
  if (!part) throw new Error(`Unknown ${actorId} body part '${partId}' in simulation scenario`);
}

function configureScenario(context, scenarioId) {
  const { game, state } = context;
  const scenario = SCENARIO_BY_ID.get(scenarioId);
  if (!scenario) throw new Error(`Unknown encounter simulation scenario '${scenarioId}'`);

  if (scenarioId === "player-wall-pinned") {
    state.relationships.range[0].value = "clinch";
    state.participants.player.support = "wall";
    state.participants.player.exertion = 45;
    state.participants.player.acute = [{ id: "off-balance", severity: 1, exchanges: 4 }];
    state.relationships.holds = [{
      id: "simulation-wall-pin",
      controllerId: "mugger",
      sourcePartId: "hand_l",
      targetId: "player",
      targetPartId: "lower_arm_l",
      kind: "limb-pin",
      leverage: 76,
    }];
  } else if (scenarioId === "player-grounded-injured") {
    state.relationships.range[0].value = "clinch";
    state.participants.player.pose = "supine";
    state.participants.player.exertion = 78;
    state.participants.player.acute = [
      { id: "winded", severity: 2, exchanges: 5 },
      { id: "off-balance", severity: 2, exchanges: 4 },
    ];
    state.participants.mugger.pose = "kneeling";
    state.participants.mugger.exertion = 35;
    state.relationships.holds = [{
      id: "simulation-ground-pin",
      controllerId: "mugger",
      sourcePartId: "knee_l",
      targetId: "player",
      targetPartId: "lower_arm_l",
      kind: "limb-pin",
      leverage: 72,
    }];
    damagePart(context, "player", "lower_arm_l", 32);
    damagePart(context, "player", "knee_r", 25);
  } else if (scenarioId === "mutual-grips") {
    state.relationships.range[0].value = "clinch";
    state.relationships.holds = [
      {
        id: "simulation-player-grip",
        controllerId: "player",
        sourcePartId: "hand_r",
        targetId: "mugger",
        targetPartId: "lower_arm_l",
        kind: "wrist-grip",
        leverage: 48,
      },
      {
        id: "simulation-mugger-grip",
        controllerId: "mugger",
        sourcePartId: "hand_r",
        targetId: "player",
        targetPartId: "lower_arm_l",
        kind: "wrist-grip",
        leverage: 48,
      },
    ];
  } else if (scenarioId === "player-complete-control") {
    state.relationships.range[0].value = "clinch";
    state.participants.mugger.support = "wall";
    state.participants.mugger.exertion = 70;
    state.relationships.holds = [
      {
        id: "simulation-player-left-control",
        controllerId: "player",
        sourcePartId: "hand_l",
        targetId: "mugger",
        targetPartId: "lower_arm_l",
        kind: "wrist-grip",
        leverage: 70,
      },
      {
        id: "simulation-player-right-control",
        controllerId: "player",
        sourcePartId: "hand_r",
        targetId: "mugger",
        targetPartId: "lower_arm_r",
        kind: "wrist-grip",
        leverage: 70,
      },
    ];
    const lootAmount = Math.min(state.objective.amount, Math.floor(game.player.money));
    game.player.adjustMoney(-lootAmount);
    state.objective.searched = true;
    state.objective.lootAmount = lootAmount;
  }

  // Scenario setup changes the facts from which both objective progress and the
  // telegraphed intent are derived. Never carry the opening intent into a stress state.
  persistCombatantBodies(context);
  syncObjectiveStage(context);
  state.npcIntent = selectAiIntent(context);
  return scenario;
}

function increment(counts, key, amount = 1) {
  counts[key] = (counts[key] || 0) + amount;
}

function sortedCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) =>
    left.localeCompare(right)));
}

function actionCounts(actionIds) {
  const counts = {};
  for (const actionId of actionIds) increment(counts, actionId);
  return sortedCounts(counts);
}

function createCoverage() {
  return {
    visitedStates: 0,
    activeStates: 0,
    meaningfulChoiceStates: 0,
    ranges: new Set(),
    playerPoses: new Set(),
    muggerPoses: new Set(),
    supports: new Set(),
    objectiveStages: new Set(),
    holdKinds: new Set(),
    acuteEffects: new Set(),
    maxHolds: 0,
    maxPlayerExertion: 0,
    maxNpcExertion: 0,
    minPlayerIntegrity: 1,
    minNpcIntegrity: 1,
    playerAvailableStateCounts: {},
    playerUnavailableReasonCounts: {},
  };
}

function minimumIntegrity(context, actorId) {
  return Math.min(...[...context.combatants[actorId].body.allParts()]
    .map(({ integrityRatio }) => integrityRatio));
}

function recordCoverage(context, coverage) {
  const { state } = context;
  coverage.visitedStates += 1;
  coverage.ranges.add(state.relationships.range[0].value);
  coverage.playerPoses.add(state.participants.player.pose);
  coverage.muggerPoses.add(state.participants.mugger.pose);
  coverage.supports.add(state.participants.player.support);
  coverage.supports.add(state.participants.mugger.support);
  coverage.objectiveStages.add(state.objective.stage);
  for (const { kind } of state.relationships.holds) coverage.holdKinds.add(kind);
  for (const participant of Object.values(state.participants)) {
    for (const { id } of participant.acute) coverage.acuteEffects.add(id);
  }
  coverage.maxHolds = Math.max(coverage.maxHolds, state.relationships.holds.length);
  coverage.maxPlayerExertion = Math.max(
    coverage.maxPlayerExertion,
    state.participants.player.exertion,
  );
  coverage.maxNpcExertion = Math.max(
    coverage.maxNpcExertion,
    state.participants.mugger.exertion,
  );
  coverage.minPlayerIntegrity = Math.min(
    coverage.minPlayerIntegrity,
    minimumIntegrity(context, "player"),
  );
  coverage.minNpcIntegrity = Math.min(
    coverage.minNpcIntegrity,
    minimumIntegrity(context, "mugger"),
  );

  if (state.phase !== "active") return;
  coverage.activeStates += 1;
  const available = getAvailableActionInstances(context, "player");
  const purposes = new Set(available.map((instance) => getActionPurpose(context, instance)));
  if (purposes.size >= 2) coverage.meaningfulChoiceStates += 1;

  const diagnosticsByAction = new Map();
  for (const diagnostic of getActionAvailabilityDiagnostics(context, "player")) {
    const existing = diagnosticsByAction.get(diagnostic.actionId) || [];
    existing.push(diagnostic);
    diagnosticsByAction.set(diagnostic.actionId, existing);
  }
  for (const actionId of PLAYER_ACTION_IDS) {
    const diagnostics = diagnosticsByAction.get(actionId) || [];
    if (diagnostics.some(({ available: isAvailable }) => isAvailable)) {
      increment(coverage.playerAvailableStateCounts, actionId);
      continue;
    }
    const reasons = new Set(diagnostics.flatMap(({ reasons }) => reasons));
    for (const reason of reasons) {
      increment(coverage.playerUnavailableReasonCounts, `${actionId}: ${reason}`);
    }
  }
}

function finishCoverage(coverage) {
  return {
    visitedStates: coverage.visitedStates,
    activeStates: coverage.activeStates,
    meaningfulChoiceStates: coverage.meaningfulChoiceStates,
    meaningfulChoiceRate: coverage.activeStates
      ? Math.round(coverage.meaningfulChoiceStates / coverage.activeStates * 1000) / 1000
      : 0,
    ranges: [...coverage.ranges].sort(),
    playerPoses: [...coverage.playerPoses].sort(),
    muggerPoses: [...coverage.muggerPoses].sort(),
    supports: [...coverage.supports].sort(),
    objectiveStages: [...coverage.objectiveStages].sort(),
    holdKinds: [...coverage.holdKinds].sort(),
    acuteEffects: [...coverage.acuteEffects].sort(),
    maxHolds: coverage.maxHolds,
    maxPlayerExertion: coverage.maxPlayerExertion,
    maxNpcExertion: coverage.maxNpcExertion,
    minPlayerIntegrity: Math.round(coverage.minPlayerIntegrity * 1000) / 1000,
    minNpcIntegrity: Math.round(coverage.minNpcIntegrity * 1000) / 1000,
    playerAvailableStateCounts: sortedCounts(coverage.playerAvailableStateCounts),
    playerUnavailableReasonCounts: sortedCounts(coverage.playerUnavailableReasonCounts),
  };
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
  scenario = "baseline",
  personalityId = null,
  maxExchanges = 60,
  goal = null,
} = {}) {
  const game = new Game({ seed, startDate: FIXED_START, playerOptions: { startPlaceId: null, money } });
  setStats(null, playerStats, (name, value) => game.player.setSkillValue(name, value));
  enterWGScene(game, SCENE_ID);
  setStats(game.currentStory.actors.mugger.stats, npcStats);
  resolveActiveWGStory(game);
  const scenarioDefinition = SCENARIO_BY_ID.get(scenario);
  if (!scenarioDefinition) throw new Error(`Unknown encounter simulation scenario '${scenario}'`);
  const goalConfig = goal || scenarioDefinition.goal || null;
  if (goalConfig) {
    game.currentStory.system.state = FIGHT_SCENARIO.create({
      game,
      instanceKey: game.currentStory.instanceKey,
      config: {
        scenario: "fight",
        opponent: { id: "mugger", actor: "mugger" },
        goal: goalConfig,
      },
    });
  }
  if (personalityId) {
    const participant = game.currentStory.system.state.participants.mugger;
    const oldBias = getAiPersonality(participant.controller.personalityId).commitmentBias;
    const newPersonality = getAiPersonality(personalityId);
    participant.controller.personalityId = personalityId;
    participant.controller.commitmentBase = Math.max(0, Math.min(100,
      participant.controller.commitmentBase - oldBias + newPersonality.commitmentBias));
  }

  const instanceKey = game.currentStory.instanceKey;
  let state = game.currentStory.system.state;
  let context = createCombatContext({ game, state, instanceKey });
  configureScenario(context, scenario);
  const npcActions = [];
  const playerActions = [];
  const rolls = [];
  const coverage = createCoverage();
  let invariantFailure = null;
  recordCoverage(context, coverage);
  while (state.phase === "active" && state.exchange < maxExchanges) {
    const invariants = collectEncounterInvariantDiagnostics(context);
    if (!invariants.valid) {
      invariantFailure = invariants.checks.find(({ valid }) => !valid);
      break;
    }
    const playerAction = chooseByPolicy(getAvailableActionInstances(context, "player"), policy);
    if (!playerAction) throw new Error("Simulation reached an active state with no player action");
    npcActions.push(state.npcIntent.actionId);
    playerActions.push(playerAction.actionId);
    const exchange = state.exchange;
    state = resolveEncounterExchange({ game, state, instanceKey, playerAction });
    game.currentStory.system.state = state;
    for (const event of state.lastEvents) {
      if (event.type === "chance.rolled") rolls.push({ exchange, ...event });
    }
    context = createCombatContext({ game, state, instanceKey });
    recordCoverage(context, coverage);
  }

  const finalInvariants = collectEncounterInvariantDiagnostics(context);
  if (!invariantFailure && !finalInvariants.valid) {
    invariantFailure = finalInvariants.checks.find(({ valid }) => !valid);
  }
  return {
    seed,
    policy,
    scenario,
    personalityId: state.participants.mugger.controller.personalityId,
    outcome: state.outcome?.id || (invariantFailure ? "invariant-failure" : "timeout"),
    exchanges: state.exchange,
    elapsedSeconds: state.elapsedSeconds,
    playerPain: Math.round(getBodyPain(context, "player") * 100) / 100,
    npcPain: Math.round(getBodyPain(context, "mugger") * 100) / 100,
    moneyLost: state.outcome?.moneyLost || 0,
    playerActionCounts: actionCounts(playerActions),
    npcActionCounts: actionCounts(npcActions),
    npcLongestRepeatStreak: longestStreak(npcActions),
    npcActions,
    playerActions,
    rolls,
    coverage: finishCoverage(coverage),
    invariantFailure,
  };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
}

function aggregateRunCounts(runs, field) {
  const counts = {};
  for (const run of runs) {
    for (const [key, count] of Object.entries(run[field])) increment(counts, key, count);
  }
  return sortedCounts(counts);
}

function aggregateCoverage(runs) {
  const union = (field) => [...new Set(runs.flatMap(({ coverage }) => coverage[field]))].sort();
  const activeStates = runs.reduce((sum, { coverage }) => sum + coverage.activeStates, 0);
  const meaningfulChoiceStates = runs.reduce(
    (sum, { coverage }) => sum + coverage.meaningfulChoiceStates,
    0,
  );
  return {
    visitedStates: runs.reduce((sum, { coverage }) => sum + coverage.visitedStates, 0),
    activeStates,
    meaningfulChoiceStates,
    meaningfulChoiceRate: activeStates
      ? Math.round(meaningfulChoiceStates / activeStates * 1000) / 1000
      : 0,
    ranges: union("ranges"),
    playerPoses: union("playerPoses"),
    muggerPoses: union("muggerPoses"),
    supports: union("supports"),
    objectiveStages: union("objectiveStages"),
    holdKinds: union("holdKinds"),
    acuteEffects: union("acuteEffects"),
    maxHolds: Math.max(...runs.map(({ coverage }) => coverage.maxHolds), 0),
    maxPlayerExertion: Math.max(...runs.map(({ coverage }) => coverage.maxPlayerExertion), 0),
    maxNpcExertion: Math.max(...runs.map(({ coverage }) => coverage.maxNpcExertion), 0),
    minPlayerIntegrity: Math.min(...runs.map(({ coverage }) => coverage.minPlayerIntegrity), 1),
    minNpcIntegrity: Math.min(...runs.map(({ coverage }) => coverage.minNpcIntegrity), 1),
    playerAvailableStateCounts: aggregateRunCounts(
      runs.map(({ coverage }) => ({ playerAvailableStateCounts: coverage.playerAvailableStateCounts })),
      "playerAvailableStateCounts",
    ),
    playerUnavailableReasonCounts: aggregateRunCounts(
      runs.map(({ coverage }) => ({ playerUnavailableReasonCounts: coverage.playerUnavailableReasonCounts })),
      "playerUnavailableReasonCounts",
    ),
  };
}

function summarizeRuns(runs) {
  const outcomeCounts = {};
  for (const { outcome } of runs) increment(outcomeCounts, outcome);
  const rolls = runs.flatMap((run) => run.rolls);
  return {
    runs: runs.length,
    outcomeCounts: sortedCounts(outcomeCounts),
    playerActionCounts: aggregateRunCounts(runs, "playerActionCounts"),
    npcActionCounts: aggregateRunCounts(runs, "npcActionCounts"),
    meanExchanges: Math.round(
      runs.reduce((sum, run) => sum + run.exchanges, 0) / runs.length * 100,
    ) / 100,
    p90Exchanges: percentile(runs.map(({ exchanges }) => exchanges), 0.9),
    meanElapsedSeconds: Math.round(
      runs.reduce((sum, run) => sum + run.elapsedSeconds, 0) / runs.length * 100,
    ) / 100,
    meanNpcRepeatStreak: Math.round(
      runs.reduce((sum, run) => sum + run.npcLongestRepeatStreak, 0) / runs.length * 100,
    ) / 100,
    meanRolls: Math.round(rolls.length / runs.length * 100) / 100,
    rollSuccessRate: Math.round(
      rolls.filter(({ success }) => success).length / Math.max(1, rolls.length) * 1000,
    ) / 1000,
    invariantFailures: runs.filter(({ invariantFailure }) => invariantFailure).length,
    timeouts: runs.filter(({ outcome }) => outcome === "timeout").length,
    coverage: aggregateCoverage(runs),
    results: runs,
  };
}

export function runStatDifferenceMatrix({
  seedCount = 20,
  statDifferences = [-4, -2, 0, 2, 4],
  baseline = 5,
  policy = "escape",
  scenario = "baseline",
} = {}) {
  return statDifferences.map((difference) => {
    const playerValue = Math.max(1, Math.min(10, baseline + difference));
    const runs = Array.from({ length: seedCount }, (_, index) => runEncounterSimulation({
      seed: 1000 + index,
      policy,
      scenario,
      playerStats: { strength: playerValue, endurance: playerValue, resolve: playerValue, fitness: playerValue },
      npcStats: { strength: baseline, endurance: baseline, resolve: baseline },
    }));
    return {
      statDifference: difference,
      playerValue,
      policy,
      scenario,
      ...summarizeRuns(runs),
    };
  });
}

export function runEncounterStateSpaceMatrix({
  seedCount = 4,
  scenarios = ENCOUNTER_SIMULATION_SCENARIOS.map(({ id }) => id),
  policy = null,
  playerStats = {},
  npcStats = {},
  maxExchanges = 60,
} = {}) {
  return scenarios.map((scenarioId, scenarioIndex) => {
    const definition = SCENARIO_BY_ID.get(scenarioId);
    if (!definition) throw new Error(`Unknown encounter simulation scenario '${scenarioId}'`);
    const selectedPolicy = policy || definition.defaultPolicy;
    const runs = Array.from({ length: seedCount }, (_, index) => runEncounterSimulation({
      seed: 2000 + scenarioIndex * 1000 + index,
      policy: selectedPolicy,
      scenario: scenarioId,
      playerStats,
      npcStats,
      maxExchanges,
    }));
    return {
      scenario: scenarioId,
      description: definition.description,
      policy: selectedPolicy,
      ...summarizeRuns(runs),
    };
  });
}
