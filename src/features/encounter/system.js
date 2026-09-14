import { SCENE_ACTION_TYPE } from "../../game/scene/actions.js";
import { createChoice } from "../../game/scene/choiceContract.js";
import {
  ENCOUNTER_ACTION_PURPOSES,
  actionDurationSeconds,
  actionLabel,
  getActionPurpose,
  getAvailableActionInstances,
  sortPlayerActions,
} from "./availability.js";
import { createCombatContext } from "./combatants.js";
import {
  outcomeText,
  renderIntent,
  renderLastExchange,
  renderObjectivePressure,
  renderSituationTable,
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
    energyFree: true,
    action: {
      type: SCENE_ACTION_TYPE.wgSystem,
      sceneId: definition.id,
      systemId,
      command,
    },
  });
}

function playerChoice(context, definition, systemId, instance, id) {
  const actionSeconds = actionDurationSeconds(instance);
  const exchangeSeconds = encounterExchangeDurationSeconds(context.state, instance);
  const label = exchangeSeconds === actionSeconds
    ? actionLabel(context, instance)
    : `${actionLabel(context, instance)} — acts in ${actionSeconds} sec`;
  return systemChoice(definition, systemId, {
    id,
    label,
    seconds: exchangeSeconds,
    command: { type: "choose-action", ...instance },
  });
}

function renderActive(context, definition, systemId) {
  const state = context.state;
  const playerId = controlledParticipantId(state);
  const threat = requireEncounterObjective(state).renderThreat(context);
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
  const instructions = state.exchange === 0
    ? [{
      type: "paragraph",
      text: "Choose one response for this exchange. Actions are grouped by immediate purpose. Faster actions resolve first; each choice timer shows the complete exchange time.",
    }]
    : [];
  return {
    content: [
      {
        type: "paragraph",
        text: `Threat: ${threat} Elapsed: ${clock(state.elapsedSeconds)}.`,
      },
      { type: "paragraph", text: `Next: ${renderIntent(context)}` },
      renderSituationTable(context),
      { type: "paragraph", text: renderObjectivePressure(context) },
      { type: "paragraph", text: renderLastExchange(context) },
      ...instructions,
    ],
    sections: ENCOUNTER_ACTION_PURPOSES
      .map(({ id, heading }) => ({
        id: `encounter-actions-${id}`,
        heading,
        choices: choicesByPurpose.get(id),
      }))
      .filter(({ choices }) => choices.length > 0),
  };
}

function renderTerminal(context, definition, systemId) {
  return {
    content: [
      { type: "paragraph", text: outcomeText(context) },
      renderSituationTable(context),
      { type: "paragraph", text: renderLastExchange(context) },
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
  };
}

export const PHYSICAL_ENCOUNTER_STORY_SYSTEM = Object.freeze({
  create({ game, config, instanceKey }) {
    validateConfig(config);
    const scenario = getEncounterScenario(config.scenario);
    const state = scenario.create({ game, config, instanceKey });
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
    return {
      state: resolveEncounterExchange({
        game,
        state,
        instanceKey,
        playerAction,
      }),
    };
  },
});
