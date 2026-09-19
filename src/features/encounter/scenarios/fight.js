import { selectAiIntent } from "../ai.js";
import { getAvailableActionInstances } from "../availability.js";
import { createCombatContext, isEncounterIncapacitatedBeyondPain } from "../combatants.js";
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
    if (typeof opponent.id !== "string" || !opponent.id || opponent.id === "player") {
      fail("config.opponent.id must be a non-player participant id");
    }
    const hasActor = typeof opponent.actor === "string" && Boolean(opponent.actor);
    const hasNpc = typeof opponent.npc === "string" && Boolean(opponent.npc);
    if (hasActor === hasNpc) {
      fail("config.opponent requires exactly one of actor or npc");
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
        if (route.leavePlace !== undefined && typeof route.leavePlace !== "boolean") {
          fail(`config.outcomes.${outcomeId}.leavePlace must be a boolean`);
        }
      }
    }
  },

  create({ game, instanceKey, config }) {
    this.validateConfig(config);
    const opponent = opponentSource(game, config.opponent);
    const objective = requireEncounterObjective({ objective: config.goal }).create({
      game,
      config: config.goal,
      ownerId: config.opponent.id,
      targetId: "player",
    });
    const personality = selectAiPersonality(game.seed, instanceKey);
    const state = createFightState({
      opponentId: config.opponent.id,
      opponentRef: opponent.ref,
      objective,
      personalityId: personality.id,
    });
    const ownerId = goalOwnerId(state);
    state.participants[ownerId].controller.commitmentBase = Math.min(
      75,
      50 + personality.commitmentBias
        + Math.round(Number(opponent.character.stats?.resolve || 0) * 3),
    );
    const context = createCombatContext({ game, state, instanceKey });
    const controlledId = controlledParticipantId(state);
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

  finish({ game, config, definition, state }) {
    const route = config.outcomes?.[state.outcome.id] ?? config.outcomes?.default ?? null;
    const objective = requireEncounterObjective(state);
    const leavesByDefault = objective.playerLeavesPlaceOutcomeIds.includes(state.outcome.id);
    const leavePlace = typeof route === "object" && route !== null
      ? route.leavePlace ?? leavesByDefault
      : leavesByDefault;
    const locationOutcome = leavePlace ? { leavePlace: true } : {};
    // A queued world interrupt such as exhaustion must run before an authored
    // aftermath scene. The ordinary interrupt checkpoint activates it as soon
    // as this encounter releases the current story frame.
    if (game?.interruptState?.pending) {
      return { target: "@exit", ...locationOutcome };
    }
    if (typeof route === "string") return { target: route, ...locationOutcome };
    if (route) return {
      target: route.target,
      ...(route.effects ? { effects: structuredClone(route.effects) } : {}),
      ...(route.paragraphs ? { paragraphs: [...route.paragraphs] } : {}),
      ...locationOutcome,
    };
    return { target: definition.finalTarget, ...locationOutcome };
  },
});
