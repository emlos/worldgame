import { SCENE_ACTION_TYPE } from "../../game/scene/actions.js";
import { createChoice } from "../../game/scene/choiceContract.js";
import {
  actionDurationSeconds,
  actionLabel,
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
  ALLEY_MUGGING_SCENARIO_ID,
  ENCOUNTER_PHASE,
  validateEncounterState,
} from "./state.js";

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
  if (config.scenario !== ALLEY_MUGGING_SCENARIO_ID || !getEncounterScenario(config.scenario)) {
    fail(`unknown scenario '${String(config.scenario)}'`);
  }
  if (typeof config.aggressor !== "string" || !config.aggressor) {
    fail("config requires an aggressor actor alias");
  }
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
  const sortedActions = sortPlayerActions(getAvailableActionInstances(context, "player"));
  const actions = sortedActions.slice(0, 7);
  const guard = sortedActions.find(({ actionId }) => actionId === "cover-and-brace");
  if (guard && !actions.includes(guard)) actions.splice(actions.length - 1, 1, guard);
  const actionCounts = actions.reduce((counts, { actionId }) => {
    counts.set(actionId, (counts.get(actionId) || 0) + 1);
    return counts;
  }, new Map());
  const actionOccurrences = new Map();
  const instructions = state.exchange === 0
    ? [{
      type: "paragraph",
      text: "Choose one response for this exchange. Faster actions resolve first; each choice timer shows the complete exchange time.",
    }]
    : [];
  return {
    content: [
      {
        type: "paragraph",
        text: `Threat: The mugger is trying to take up to £${state.objective.amount}. Elapsed: ${clock(state.elapsedSeconds)}.`,
      },
      { type: "paragraph", text: `Next: ${renderIntent(context)}` },
      renderSituationTable(context),
      { type: "paragraph", text: renderObjectivePressure(context) },
      { type: "paragraph", text: renderLastExchange(context) },
      ...instructions,
    ],
    sections: [{
      id: "encounter-actions",
      heading: definition.choiceHeading,
      choices: actions.map((instance) => {
        const occurrence = actionOccurrences.get(instance.actionId) || 0;
        actionOccurrences.set(instance.actionId, occurrence + 1);
        const suffix = actionCounts.get(instance.actionId) > 1 ? `:${occurrence + 1}` : "";
        return playerChoice(
          context,
          definition,
          systemId,
          instance,
          `encounter-action:${instance.actionId}${suffix}`,
        );
      }),
    }],
  };
}

function renderTerminal(context, definition, systemId) {
  return {
    content: [
      { type: "paragraph", text: outcomeText(context.state) },
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
      return { target: definition.finalTarget };
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
    if (playerAction.actorId !== "player") fail("the player can only choose player actions");
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
