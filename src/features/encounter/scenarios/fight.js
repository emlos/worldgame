import { selectAiIntent } from "../ai.js";
import { getAvailableActionInstances } from "../availability.js";
import { createCombatContext, isEncounterIncapacitated } from "../combatants.js";
import { requireEncounterObjective } from "../objectives/index.js";
import { controlledParticipantId, goalOwnerId } from "../roles.js";
import {
  ENCOUNTER_PHASE,
  FIGHT_SCENARIO_ID,
  createFightState,
} from "../state.js";
import { selectAiPersonality } from "../personality.js";

function fail(message) {
  throw new Error(`Physical encounter fight scenario: ${message}`);
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
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
  const outcome = objective.resolveTargetUnable(context, events);

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
    if (typeof opponent.id !== "string" || !opponent.id || opponent.id === "player") {
      fail("config.opponent.id must be a non-player participant id");
    }
    if (typeof opponent.actor !== "string" || !opponent.actor) {
      fail("config.opponent.actor must be a scene actor alias");
    }
    const goal = requireRecord(config.goal, "config.goal");
    requireEncounterObjective({ objective: goal }).validateConfig(goal, fail);
    if (config.outcomes !== undefined) {
      requireRecord(config.outcomes, "config.outcomes");
      for (const [outcomeId, route] of Object.entries(config.outcomes)) {
        if (!outcomeId) fail("config.outcomes requires non-empty outcome ids");
        if (typeof route === "string" && route) continue;
        requireRecord(route, `config.outcomes.${outcomeId}`);
        if (typeof route.target !== "string" || !route.target) {
          fail(`config.outcomes.${outcomeId}.target must be a non-empty string`);
        }
        if (route.effects !== undefined && !Array.isArray(route.effects)) {
          fail(`config.outcomes.${outcomeId}.effects must be an array`);
        }
        if (route.paragraphs !== undefined
          && (!Array.isArray(route.paragraphs)
            || route.paragraphs.some((paragraph) => typeof paragraph !== "string"))) {
          fail(`config.outcomes.${outcomeId}.paragraphs must contain strings`);
        }
      }
    }
  },

  create({ game, instanceKey, config }) {
    this.validateConfig(config);
    const actor = game.currentStory?.actors?.[config.opponent.actor];
    if (!actor) fail(`scene actor '${config.opponent.actor}' is unavailable`);
    const objective = requireEncounterObjective({ objective: config.goal }).create({
      game,
      config: config.goal,
      ownerId: config.opponent.id,
      targetId: "player",
    });
    const personality = selectAiPersonality(game.seed, instanceKey);
    const state = createFightState({
      opponentId: config.opponent.id,
      opponentAlias: config.opponent.actor,
      objective,
      personalityId: personality.id,
    });
    const ownerId = goalOwnerId(state);
    state.participants[ownerId].controller.commitmentBase = Math.min(
      75,
      50 + personality.commitmentBias + Math.round(Number(actor.stats?.resolve || 0) * 3),
    );
    const context = createCombatContext({ game, state, instanceKey });
    const controlledId = controlledParticipantId(state);
    if (isEncounterIncapacitated(context, controlledId)) {
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

  finish({ config, definition, state }) {
    const route = config.outcomes?.[state.outcome.id] || config.outcomes?.default || null;
    if (typeof route === "string") return { target: route };
    if (route) return {
      target: route.target,
      ...(route.effects ? { effects: structuredClone(route.effects) } : {}),
      ...(route.paragraphs ? { paragraphs: [...route.paragraphs] } : {}),
    };
    return { target: definition.finalTarget };
  },
});
