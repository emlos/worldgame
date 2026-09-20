import { selectAiIntent } from "../ai.js";
import { getAvailableActionInstances } from "../availability.js";
import {
  createCombatContext,
  isEncounterIncapacitatedBeyondPain,
} from "../combatants.js";
import { requireEncounterObjective } from "../objectives/index.js";
import { controlledParticipantId, goalOwnerId } from "../roles.js";
import {
  ENCOUNTER_PHASE,
  FIGHT_SCENARIO_ID,
  createFightState,
} from "../state.js";
import { getAiPersonality, selectAiPersonality } from "../personality.js";
import { createCombatStressState } from "../stress.js";
import {
  combatDifficultyBonus,
  createCombatLearningState,
} from "../combatSkill.js";
import { deriveSeed, makeRNG, randInt } from "../../../shared/util/random.js";

const TEMPORARY_OPPONENT_STAT_NAMES = Object.freeze([
  "strength",
  "endurance",
  "resolve",
  "fitness",
]);
const TEMPORARY_OPPONENT_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ min: -2, max: -1 }),
  medium: Object.freeze({ min: -1, max: 1 }),
  hard: Object.freeze({ min: 1, max: 2 }),
  maxed: null,
});
const TEMPORARY_OPPONENT_DIFFICULTY_IDS = new Set(
  Object.keys(TEMPORARY_OPPONENT_DIFFICULTIES),
);
const DEFAULT_TEMPORARY_OPPONENT_DIFFICULTY = "relative";
const DEFAULT_TEMPORARY_OPPONENT_OFFSETS = Object.freeze([-2, -1, 1, 2]);

function fail(message) {
  throw new Error(`Physical encounter fight scenario: ${message}`);
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  return value;
}

function opponentSource(game, opponent) {
  if (opponent.actor) {
    const actor = game.currentStory?.actors?.[opponent.actor];
    if (!actor) fail(`scene actor '${opponent.actor}' is unavailable`);
    return {
      character: actor,
      ref: { type: "scene-actor", alias: opponent.actor },
    };
  }
  const npc = game.npcs.get(String(opponent.npc));
  if (!npc) fail(`NPC '${String(opponent.npc)}' is unavailable`);
  return {
    character: npc,
    ref: { type: "npc", npcId: String(opponent.npc) },
  };
}

const clampCombatStat = (value) => Math.max(0, Math.min(10, value));

function playerCombatStat(game, statName) {
  const value = Number(game.player.getSkillValue(statName));
  return Number.isFinite(value) ? value : 0;
}

function temporaryOpponentOffsets(difficulty, rnd) {
  if (difficulty === DEFAULT_TEMPORARY_OPPONENT_DIFFICULTY) {
    return TEMPORARY_OPPONENT_STAT_NAMES.map(() =>
      DEFAULT_TEMPORARY_OPPONENT_OFFSETS[randInt(
        0,
        DEFAULT_TEMPORARY_OPPONENT_OFFSETS.length - 1,
        rnd,
      )]);
  }
  const range = TEMPORARY_OPPONENT_DIFFICULTIES[difficulty];
  if (range === null) return TEMPORARY_OPPONENT_STAT_NAMES.map(() => null);
  return TEMPORARY_OPPONENT_STAT_NAMES.map(() => randInt(range.min, range.max, rnd));
}

/**
 * Resolve a generated opponent's combat stats once for this story instance.
 * The marker makes repeated create attempts idempotent and lets the combat lab
 * apply deliberate stat overrides after ordinary difficulty resolution.
 */
export function resolveTemporaryOpponentDifficulty(game, instanceKey, config) {
  const opponent = opponentSource(game, config.opponent);
  if (opponent.ref.type !== "scene-actor") return opponent;

  const actor = opponent.character;
  const previous = actor.meta?.combatDifficulty;
  if (previous?.instanceKey === instanceKey) return opponent;

  const difficulty = config.opponent.difficulty
    ?? DEFAULT_TEMPORARY_OPPONENT_DIFFICULTY;
  const rnd = makeRNG(deriveSeed(
    game.seed,
    `encounter-opponent-difficulty-v1:${instanceKey}:${opponent.ref.alias}:${difficulty}`,
  ));
  const offsets = temporaryOpponentOffsets(difficulty, rnd);
  for (const [index, statName] of TEMPORARY_OPPONENT_STAT_NAMES.entries()) {
    actor.stats[statName] = offsets[index] === null
      ? 10
      : clampCombatStat(playerCombatStat(game, statName) + offsets[index]);
  }
  actor.meta ??= {};
  actor.meta.combatDifficulty = { difficulty, instanceKey };
  return opponent;
}

function temporaryOpponentThreatLevel(context) {
  const ownerId = goalOwnerId(context.state);
  const owner = context.combatants[ownerId];
  if (owner?.actor?.alias === undefined) return null;
  const player = context.combatants[controlledParticipantId(context.state)];
  const averageDifference = TEMPORARY_OPPONENT_STAT_NAMES.reduce(
    (sum, statName) => sum + owner.stat(statName) - player.stat(statName),
    0,
  ) / TEMPORARY_OPPONENT_STAT_NAMES.length;
  if (averageDifference <= -1) return "Low";
  if (averageDifference < 1) return "Comparable";
  if (averageDifference < 3) return "High";
  return "Extreme";
}

function opponentPersonality(opponent, seed, instanceKey) {
  if (opponent.ref.type !== "npc")
    return selectAiPersonality(seed, instanceKey);
  const personalityId = opponent.character.meta?.combatPersonalityId;
  if (typeof personalityId !== "string" || !personalityId) {
    fail(`named NPC '${opponent.ref.npcId}' has no combat personality`);
  }
  return getAiPersonality(personalityId);
}

function restorePersistentNpcBodies(game, state) {
  if (!state?.participants) return;
  for (const participant of Object.values(state.participants)) {
    if (participant.ref?.type !== "npc") continue;
    const npc = game.npcs.get(participant.ref.npcId);
    if (!npc)
      fail(
        `NPC '${participant.ref.npcId}' is unavailable while finishing combat`,
      );
    npc.body.fullyHeal();
  }
}

function resolveUnopposedEntry(context, reason) {
  const { state } = context;
  const targetId = controlledParticipantId(state);
  const ownerId = goalOwnerId(state);
  const objective = requireEncounterObjective(state);
  const previousObjective = structuredClone(state.objective);
  const events = [
    ...state.lastEvents,
    { type: "participant.unable-to-act", actorId: targetId, reason },
    {
      type: "action.attempted",
      actorId: ownerId,
      targetId,
      actionId: objective.unopposedActionId,
    },
  ];
  const outcome = objective.resolveTargetUnable(context, events, { reason });

  state.phase = ENCOUNTER_PHASE.terminal;
  state.npcIntent = null;
  objective.complete(context);
  state.outcome = outcome;
  events.push({
    type: "encounter.ended",
    outcomeId: outcome.id,
    details: structuredClone(outcome),
  });
  state.lastEvents = events.slice(-24);
  objective.commitGameState(context, previousObjective);
}

export const FIGHT_SCENARIO = Object.freeze({
  id: FIGHT_SCENARIO_ID,

  validateConfig(config) {
    requireRecord(config, "config");
    const opponent = requireRecord(config.opponent, "config.opponent");
    if (
      typeof opponent.id !== "string" ||
      !opponent.id ||
      opponent.id === "player"
    ) {
      fail("config.opponent.id must be a non-player participant id");
    }
    const hasActor =
      typeof opponent.actor === "string" && Boolean(opponent.actor);
    const hasNpc = typeof opponent.npc === "string" && Boolean(opponent.npc);
    if (hasActor === hasNpc) {
      fail("config.opponent requires exactly one of actor or npc");
    }
    if (opponent.difficulty !== undefined) {
      if (!hasActor) {
        fail("config.opponent.difficulty is supported only for temporary actors");
      }
      if (!TEMPORARY_OPPONENT_DIFFICULTY_IDS.has(opponent.difficulty)) {
        fail(
          "config.opponent.difficulty must be easy, medium, hard, or maxed",
        );
      }
    }
    const goal = requireRecord(config.goal, "config.goal");
    requireEncounterObjective({ objective: goal }).validateConfig(goal, fail);
    if (
      config.stressMultiplier !== undefined &&
      (!Number.isFinite(config.stressMultiplier) ||
        config.stressMultiplier < 0 ||
        config.stressMultiplier > 2)
    ) {
      fail("config.stressMultiplier must be a number from 0 through 2");
    }
    if (config.outcomes !== undefined) {
      requireRecord(config.outcomes, "config.outcomes");
      for (const [outcomeId, route] of Object.entries(config.outcomes)) {
        if (!outcomeId) fail("config.outcomes requires non-empty outcome ids");
        if (typeof route === "string" && route) continue;
        requireRecord(route, `config.outcomes.${outcomeId}`);
        if (typeof route.target !== "string" || !route.target) {
          fail(
            `config.outcomes.${outcomeId}.target must be a non-empty string`,
          );
        }
        if (route.effects !== undefined && !Array.isArray(route.effects)) {
          fail(`config.outcomes.${outcomeId}.effects must be an array`);
        }
        if (
          route.paragraphs !== undefined &&
          (!Array.isArray(route.paragraphs) ||
            route.paragraphs.some((paragraph) => typeof paragraph !== "string"))
        ) {
          fail(`config.outcomes.${outcomeId}.paragraphs must contain strings`);
        }
        if (
          route.leavePlace !== undefined &&
          typeof route.leavePlace !== "boolean"
        ) {
          fail(`config.outcomes.${outcomeId}.leavePlace must be a boolean`);
        }
      }
    }
  },

  create({ game, instanceKey, config }) {
    this.validateConfig(config);
    const opponent = resolveTemporaryOpponentDifficulty(game, instanceKey, config);
    const objective = requireEncounterObjective({
      objective: config.goal,
    }).create({
      game,
      config: config.goal,
      ownerId: config.opponent.id,
      targetId: "player",
    });
    const personality = opponentPersonality(opponent, game.seed, instanceKey);
    const state = createFightState({
      opponentId: config.opponent.id,
      opponentRef: opponent.ref,
      objective,
      personalityId: personality.id,
      stress: createCombatStressState(game, config.stressMultiplier ?? 1),
      combatLearning: createCombatLearningState(game.player),
    });
    const ownerId = goalOwnerId(state);
    state.participants[ownerId].controller.commitmentBase = Math.min(
      75,
      50 +
        personality.commitmentBias +
        Math.round(Number(opponent.character.stats?.resolve || 0) * 3),
    );
    const context = createCombatContext({ game, state, instanceKey });
    const controlledId = controlledParticipantId(state);
    state.combatLearning.difficultyBonus = combatDifficultyBonus(
      context,
      controlledId,
      ownerId,
    );
    if (isEncounterIncapacitatedBeyondPain(context, controlledId)) {
      resolveUnopposedEntry(context, "already-incapacitated");
      return state;
    }
    if (!getAvailableActionInstances(context, controlledId).length) {
      resolveUnopposedEntry(context, "no-legal-response");
      return state;
    }
    state.npcIntent = selectAiIntent(context);
    return state;
  },

  opponentThreatLevel(context) {
    return temporaryOpponentThreatLevel(context);
  },

  finish({ game, config, definition, state }) {
    restorePersistentNpcBodies(game, state);
    const route =
      config.outcomes?.[state.outcome.id] ?? config.outcomes?.default ?? null;
    const objective = requireEncounterObjective(state);
    const leavesByDefault = objective.playerLeavesPlaceOutcomeIds.includes(
      state.outcome.id,
    );
    const leavePlace =
      typeof route === "object" && route !== null
        ? (route.leavePlace ?? leavesByDefault)
        : leavesByDefault;
    const locationOutcome = leavePlace ? { leavePlace: true } : {};
    // A queued world interrupt such as exhaustion must run before an authored
    // aftermath scene. The ordinary interrupt checkpoint activates it as soon
    // as this encounter releases the current story frame.
    if (game?.interruptState?.pending) {
      return { target: "@exit", ...locationOutcome };
    }
    if (typeof route === "string") return { target: route, ...locationOutcome };
    if (route)
      return {
        target: route.target,
        ...(route.effects ? { effects: structuredClone(route.effects) } : {}),
        ...(route.paragraphs ? { paragraphs: [...route.paragraphs] } : {}),
        ...locationOutcome,
      };
    return { target: definition.finalTarget, ...locationOutcome };
  },
});
