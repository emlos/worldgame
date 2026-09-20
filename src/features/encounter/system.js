import { SCENE_ACTION_TYPE } from "../../game/scene/actions.js";
import { createChoice } from "../../game/scene/choiceContract.js";
import {
  ENCOUNTER_ACTION_PURPOSES,
  actionLabel,
  getActionPurpose,
  getAvailableActionInstances,
  sortPlayerActions,
} from "./availability.js";
import { createCombatContext } from "./combatants.js";
import {
  renderIntent,
  renderLastExchangeParts,
  renderObjectivePressure,
  renderSituationProse,
  renderTerminalExchangeParts,
} from "./prose.js";
import {
  encounterExchangeDurationSeconds,
  resolveEncounterExchange,
  validateEncounterRuntime,
} from "./resolution.js";
import { getEncounterScenario } from "./scenarios/index.js";
import {
  ENCOUNTER_PHASE,
  validateEncounterState,
} from "./state.js";
import { controlledParticipantId } from "./roles.js";
import { requireEncounterObjective } from "./objectives/index.js";
import { settleEncounterConsequences } from "./consequences.js";
import { combatSkillRewardSummary } from "./combatSkill.js";

export const ENCOUNTER_PHYSICAL_SYSTEM_ID = "encounter.physical";

function fail(message) {
  throw new Error(`Physical encounter: ${message}`);
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function validateConfig(config) {
  requireRecord(config, "config");
  const scenario = getEncounterScenario(config.scenario);
  if (!scenario) {
    fail(`unknown scenario '${String(config.scenario)}'`);
  }
  scenario.validateConfig(config);
}

function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function systemChoice(definition, systemId, {
  id,
  label,
  seconds = 0,
  command,
}) {
  return createChoice({
    id,
    label,
    durationMinutes: seconds / 60,
    showDuration: false,
    action: {
      type: SCENE_ACTION_TYPE.wgSystem,
      sceneId: definition.id,
      systemId,
      command,
    },
  });
}

function playerChoice(context, definition, systemId, instance, id) {
  const exchangeSeconds = encounterExchangeDurationSeconds(context.state, instance);
  return systemChoice(definition, systemId, {
    id,
    label: actionLabel(context, instance),
    seconds: exchangeSeconds,
    command: { type: "choose-action", ...instance },
  });
}

function encounterPresentation(context) {
  const objective = requireEncounterObjective(context.state);
  return {
    type: "physical-encounter",
    playerStatMarkers: objective.playerStatMarkers?.(context) || [],
  };
}

function renderActive(context, definition, systemId) {
  const state = context.state;
  const playerId = controlledParticipantId(state);
  const threat = requireEncounterObjective(state).renderThreat(context);
  const opponentThreatLevel = getEncounterScenario(state.scenarioId)
    .opponentThreatLevel?.(context) || null;
  const sortedActions = sortPlayerActions(getAvailableActionInstances(context, playerId));
  const actions = sortedActions;
  const actionCounts = actions.reduce((counts, { actionId }) => {
    counts.set(actionId, (counts.get(actionId) || 0) + 1);
    return counts;
  }, new Map());
  const actionOccurrences = new Map();
  const choicesByPurpose = new Map(
    ENCOUNTER_ACTION_PURPOSES.map(({ id }) => [id, []]),
  );
  for (const instance of actions) {
    const occurrence = actionOccurrences.get(instance.actionId) || 0;
    actionOccurrences.set(instance.actionId, occurrence + 1);
    const suffix = actionCounts.get(instance.actionId) > 1 ? `:${occurrence + 1}` : "";
    choicesByPurpose.get(getActionPurpose(context, instance)).push(playerChoice(
      context,
      definition,
      systemId,
      instance,
      `encounter-action:${instance.actionId}${suffix}`,
    ));
  }
  const instructions =  [];
  return {
    content: [
      {
        type: "paragraph",
        text: `Threat: ${threat}`,
      },
      ...(opponentThreatLevel ? [{
        type: "paragraph",
        text: `Opponent threat level: ${opponentThreatLevel}.`,
      }] : []),
      { type: "paragraph", text: renderIntent(context) },
      { type: "paragraph", text: renderSituationProse(context) },
      { type: "paragraph", text: renderObjectivePressure(context) },
      { type: "paragraph", parts: renderLastExchangeParts(context) },
      ...instructions,
    ],
    sections: ENCOUNTER_ACTION_PURPOSES
      .map(({ id, heading }) => ({
        id: `encounter-actions-${id}`,
        heading,
        choices: choicesByPurpose.get(id),
      }))
      .filter(({ choices }) => choices.length > 0),
    presentation: encounterPresentation(context),
  };
}

function renderTerminal(context, definition, systemId) {
  const objective = requireEncounterObjective(context.state);
  const finalExchangeParts = context.state.exchange > 0
    ? renderTerminalExchangeParts(context)
    : [];
  const skillReward = combatSkillRewardSummary(context.state);
  return {
    content: [
      ...(finalExchangeParts.length
        ? [{ type: "paragraph", parts: finalExchangeParts }]
        : []),
      ...objective.renderTerminal(context),
      ...(skillReward ? [{ type: "paragraph", text: skillReward }] : []),
      { type: "paragraph", text: renderSituationProse(context) },
    ],
    sections: [{
      id: "encounter-outcome",
      heading: "Encounter over",
      choices: [systemChoice(definition, systemId, {
        id: "encounter-action:finish",
        label: "Continue",
        command: { type: "finish" },
      })],
    }],
    presentation: encounterPresentation(context),
  };
}

export const PHYSICAL_ENCOUNTER_STORY_SYSTEM = Object.freeze({
  create({ game, config, instanceKey }) {
    validateConfig(config);
    const scenario = getEncounterScenario(config.scenario);
    const state = scenario.create({ game, config, instanceKey });
    if (state.phase === ENCOUNTER_PHASE.terminal) {
      settleEncounterConsequences(game, state, instanceKey);
    }
    validateEncounterState(state);
    const context = createCombatContext({ game, state, instanceKey });
    validateEncounterRuntime(context);
    return state;
  },

  validateState: validateEncounterState,

  render({ game, definition, systemId, instanceKey, config, state }) {
    validateConfig(config);
    const context = createCombatContext({ game, state, instanceKey });
    validateEncounterRuntime(context);
    return state.phase === ENCOUNTER_PHASE.active
      ? renderActive(context, definition, systemId)
      : renderTerminal(context, definition, systemId);
  },

  act({ game, definition, instanceKey, config, state, command }) {
    validateConfig(config);
    requireRecord(command, "command");
    if (command.type === "finish") {
      if (state.phase !== ENCOUNTER_PHASE.terminal) fail("an active encounter cannot be left");
      return getEncounterScenario(state.scenarioId).finish({
        game,
        config,
        definition,
        state,
        instanceKey,
      });
    }
    if (command.type !== "choose-action") {
      fail(`unknown command '${String(command.type)}'`);
    }
    if (state.phase !== ENCOUNTER_PHASE.active) fail("the encounter is already over");
    const playerAction = {
      actionId: command.actionId,
      actorId: command.actorId,
      targetId: command.targetId,
      parameters: command.parameters,
    };
    if (playerAction.actorId !== controlledParticipantId(state)) {
      fail("the player can only choose actions for the controlled participant");
    }
    const next = resolveEncounterExchange({
      game,
      state,
      instanceKey,
      playerAction,
    });
    if (next.phase === ENCOUNTER_PHASE.terminal) {
      settleEncounterConsequences(game, next, instanceKey);
    }
    return { state: next };
  },
});
