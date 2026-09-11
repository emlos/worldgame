import { SCENE_ACTION_TYPE } from "../../game/scene/actions.js";
import { createChoice } from "../../game/scene/choiceContract.js";

export const ENCOUNTER_PHYSICAL_SYSTEM_ID = "encounter.physical";

const STATE_VERSION = 1;
const ALLEY_MUGGING_SCENARIO_ID = "alley-mugging";

const SCREEN_SAMPLES = Object.freeze([
  Object.freeze({
    id: "at-reach",
    elapsedSeconds: 0,
    intentSeconds: 2,
    intent: "feints a step toward you, looking for an opening to grab your arm",
    playerPosition: "Standing at arm's reach; path behind you open",
    attackerPosition: "Standing; blocking the alley mouth",
    playerCondition: "Unhurt; both hands free",
    attackerCondition: "Alert; both hands free",
    pressure: "You still have room to move before the struggle closes in.",
    lastExchange: "The mugger steps into your path and demands your money.",
    actions: Object.freeze([
      Object.freeze({ id: "keep-space", label: "Step back and keep space", seconds: 2 }),
      Object.freeze({ id: "shove", label: "Shove them away", seconds: 3 }),
      Object.freeze({ id: "strike-face", label: "Strike at their face", seconds: 2 }),
      Object.freeze({ id: "guard", label: "Raise your guard", seconds: 1 }),
    ]),
  }),
  Object.freeze({
    id: "wrist-held-at-wall",
    elapsedSeconds: 12,
    intentSeconds: 3,
    intent: "shifts their weight, preparing to force your free arm against the wall",
    playerPosition: "Standing with your back to the wall; right wrist held; left arm free",
    attackerPosition: "At clinch range; left hand controlling your right wrist",
    playerCondition: "Head sore; both legs planted",
    attackerCondition: "Left forearm bruised; grip unsteady",
    pressure: "The wall takes away your retreat, but your free limbs can still disrupt the hold.",
    lastExchange:
      "You drove an elbow into the arm around your wrist. Their grip slipped, but closed again before you could pull free.",
    actions: Object.freeze([
      Object.freeze({
        id: "strike-holding-arm",
        label: "Strike the arm gripping your wrist",
        seconds: 2,
      }),
      Object.freeze({ id: "wrench-free", label: "Wrench your wrist free", seconds: 3 }),
      Object.freeze({ id: "shove-from-wall", label: "Shove off the wall", seconds: 3 }),
      Object.freeze({ id: "knee-strike", label: "Drive a knee into them", seconds: 2 }),
      Object.freeze({ id: "headbutt", label: "Try to headbutt them", seconds: 2 }),
    ]),
  }),
  Object.freeze({
    id: "grounded",
    elapsedSeconds: 24,
    intentSeconds: 4,
    intent: "leans across you and reaches toward your pocket",
    playerPosition: "On your back; left forearm pinned; right arm and both legs free",
    attackerPosition: "Kneeling beside you; one hand committed to the pin",
    playerCondition: "Wind knocked out of you; legs still steady",
    attackerCondition: "Breathing hard; attention fixed on your pocket",
    pressure: "The attacker has control, but reaching for your money will occupy their free hand.",
    lastExchange:
      "The mugger hooked your balance out from under you and followed you to the ground.",
    actions: Object.freeze([
      Object.freeze({
        id: "strike-pinning-arm",
        label: "Strike the arm pinning you",
        seconds: 2,
      }),
      Object.freeze({ id: "turn-side", label: "Twist onto your side", seconds: 2 }),
      Object.freeze({ id: "buck-off", label: "Try to buck them off", seconds: 3 }),
      Object.freeze({ id: "kick-free", label: "Kick yourself clear", seconds: 2 }),
      Object.freeze({ id: "protect-pocket", label: "Protect your pocket", seconds: 1 }),
    ]),
  }),
]);

const SAMPLE_BY_ID = new Map(SCREEN_SAMPLES.map((sample) => [sample.id, sample]));

function fail(message) {
  throw new Error(`Physical encounter: ${message}`);
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function getSample(sampleId) {
  const sample = SAMPLE_BY_ID.get(String(sampleId));
  if (!sample) fail(`unknown screen sample '${String(sampleId)}'`);
  return sample;
}

function getAggressor(game, config) {
  const alias = String(config.aggressor || "");
  if (!alias) fail("config requires an aggressor actor alias");
  const actor = game.currentStory?.actors?.[alias];
  if (!actor) fail(`scene actor '${alias}' is unavailable`);
  return actor;
}

function validateConfig(config) {
  requireRecord(config, "config");
  if (config.scenario !== ALLEY_MUGGING_SCENARIO_ID) {
    fail(`unknown scenario '${String(config.scenario)}'`);
  }
  if (typeof config.aggressor !== "string" || !config.aggressor) {
    fail("config requires an aggressor actor alias");
  }
}

function validateState(state) {
  requireRecord(state, "state");
  if (state.version !== STATE_VERSION) fail("state has an invalid version");
  if (state.scenarioId !== ALLEY_MUGGING_SCENARIO_ID) {
    fail("state has an invalid scenario");
  }
  const sample = getSample(state.sampleId);
  if (state.lastPreviewActionId !== null) {
    if (typeof state.lastPreviewActionId !== "string") {
      fail("state preview action must be a string or null");
    }
    if (!sample.actions.some((action) => action.id === state.lastPreviewActionId)) {
      fail(`preview action '${state.lastPreviewActionId}' is unavailable in this sample`);
    }
  }
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function systemChoice(definition, systemId, input) {
  return createChoice({
    id: input.id,
    label: input.label,
    durationMinutes: (input.seconds || 0) / 60,
    energyFree: true,
    action: {
      type: SCENE_ACTION_TYPE.wgSystem,
      sceneId: definition.id,
      systemId,
      command: input.command,
    },
  });
}

function previewActionChoice(definition, systemId, action) {
  return systemChoice(definition, systemId, {
    id: `encounter-preview:${action.id}`,
    label: action.label,
    seconds: action.seconds,
    command: { type: "preview-action", actionId: action.id },
  });
}

function previewSelectionText(state, sample) {
  if (state.lastPreviewActionId === null) return [];
  const action = sample.actions.find(({ id }) => id === state.lastPreviewActionId);
  return [{
    type: "paragraph",
    text: `Preview only: “${action.label}” was selected. Milestone 0 does not resolve combat actions.`,
  }];
}

export const PHYSICAL_ENCOUNTER_STORY_SYSTEM = Object.freeze({
  create({ game, config }) {
    validateConfig(config);
    getAggressor(game, config);
    return {
      version: STATE_VERSION,
      scenarioId: ALLEY_MUGGING_SCENARIO_ID,
      sampleId: SCREEN_SAMPLES[0].id,
      lastPreviewActionId: null,
    };
  },

  validateState,

  render({ game, definition, systemId, config, state }) {
    validateConfig(config);
    const aggressor = getAggressor(game, config);
    const sample = getSample(state.sampleId);
    const subject = capitalize(aggressor.pronouns?.subject || "they");

    return {
      content: [
        {
          type: "paragraph",
          text: `Threat: The mugger is trying to get at your money. Elapsed: ${clock(sample.elapsedSeconds)}.`,
        },
        {
          type: "paragraph",
          text: `Next: ${subject} ${sample.intent}. ${sample.intentSeconds} seconds.`,
        },
        {
          type: "table",
          caption: "Current situation",
          columns: ["State", "You", aggressor.title],
          rows: [
            ["Position", sample.playerPosition, sample.attackerPosition],
            ["Condition", sample.playerCondition, sample.attackerCondition],
          ],
        },
        { type: "paragraph", text: sample.pressure },
        { type: "paragraph", text: sample.lastExchange },
        ...previewSelectionText(state, sample),
      ],
      sections: [
        {
          id: "encounter-actions",
          heading: definition.choiceHeading,
          choices: sample.actions.map((action) =>
            previewActionChoice(definition, systemId, action),
          ),
        },
        {
          id: "screen-spike-controls",
          heading: "Screen preview",
          choices: [
            systemChoice(definition, systemId, {
              id: "encounter-preview:next-sample",
              label: "Show the next sample state",
              command: { type: "next-sample" },
            }),
            systemChoice(definition, systemId, {
              id: "encounter-preview:finish",
              label: "Leave the encounter preview",
              command: { type: "finish" },
            }),
          ],
        },
      ],
    };
  },

  act({ definition, state, command }) {
    requireRecord(command, "command");
    const sample = getSample(state.sampleId);

    if (command.type === "finish") {
      return { target: definition.finalTarget };
    }

    if (command.type === "next-sample") {
      const index = SCREEN_SAMPLES.findIndex(({ id }) => id === sample.id);
      return {
        state: {
          ...state,
          sampleId: SCREEN_SAMPLES[(index + 1) % SCREEN_SAMPLES.length].id,
          lastPreviewActionId: null,
        },
      };
    }

    if (command.type === "preview-action") {
      if (!sample.actions.some(({ id }) => id === command.actionId)) {
        fail(`action '${String(command.actionId)}' is unavailable in this sample`);
      }
      return {
        state: { ...state, lastPreviewActionId: command.actionId },
        notice: "Screen preview only; no combat state or body condition was changed.",
      };
    }

    fail(`unknown command '${String(command.type)}'`);
  },
});
