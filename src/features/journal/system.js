import { createChoice } from "../../game/scene/choiceContract.js";
import { SCENE_ACTION_TYPE } from "../../game/scene/actions.js";
import {
  chooseJournalOptionWithinAction,
  dismissJournalDraftWithinAction,
  startJournalDraftWithinAction,
} from "../../game/journal/runtime.js";
import { buildJournalWritingView } from "../../game/journal/view.js";

const STATE_VERSION = 1;
const TUTORIAL_FLAG = "diary.tutorial";

function fail(message) {
  throw new Error(`Diary system: ${message}`);
}

function validateState(state) {
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state) ||
    state.version !== STATE_VERSION ||
    Object.keys(state).length !== 1
  ) {
    fail("state is invalid");
  }
}

function systemChoice(definition, systemId, { id, label, command, disabledReason = null }) {
  return createChoice({
    id,
    label,
    enabled: disabledReason === null,
    disabledReason,
    action: {
      type: SCENE_ACTION_TYPE.wgSystem,
      sceneId: definition.id,
      systemId,
      command,
    },
  });
}

function writingChoices(definition, systemId, view) {
  if (view.mode === "topics") {
    return view.topics.map((topic) => systemChoice(definition, systemId, {
      id: `journal-topic:${topic.definitionId}`,
      label: `...${topic.label}`,
      command: { type: "start", definitionId: topic.definitionId },
    }));
  }
  return view.choices.map((choice) => systemChoice(definition, systemId, {
    id: `journal-option:${choice.id}`,
    label: choice.label,
    disabledReason: choice.disabledReason,
    command: {
      type: "choose",
      ...view.token,
      choiceId: choice.id,
    },
  }));
}

function actionChoices(definition, systemId, view) {
  const choices = [];
  if (view.mode === "draft") {
    choices.push(systemChoice(definition, systemId, {
      id: "journal-dismiss",
      label: "actually, this doesn't seem worth writing about (dismiss permanently)",
      command: { type: "dismiss" },
    }));
  }
  choices.push(systemChoice(definition, systemId, {
    id: "journal-exit",
    label: "Put the diary away",
    command: { type: "exit" },
  }));
  return choices;
}

export const JOURNAL_STORY_SYSTEM = Object.freeze({
  create() {
    return { version: STATE_VERSION };
  },

  validateState,

  render({ game, definition, systemId, state }) {
    validateState(state);
    const view = buildJournalWritingView(game);
    const content = [
      {
        type: "paragraph",
        text: "You sit at the cleared table, pull your diary closer, and turn to a fresh page.",
      },
    ];
    if (!game.hasFlag(TUTORIAL_FLAG)) {
      content.push({
        type: "paragraph",
        text: "[info]You can write in your diary to record your thoughts and feelings about the various events that happen.\nYou can also read past entries from the Diary menu. Writing in your diary does not advance time.[/info]",
      });
    }

    return {
      content,
      sections: [
        {
          id: "journal-writing",
          heading: null,
          choices: writingChoices(definition, systemId, view),
        },
        {
          id: "journal-actions",
          heading: null,
          choices: actionChoices(definition, systemId, view),
        },
      ],
      presentation: {
        type: "journal-writing",
        date: game.now.toISOString(),
        mode: view.mode,
        intro: view.mode === "draft"
          ? "how do you want to put it?"
          : "you think about all the things that happened recently...",
        entries: view.pageEntries,
        draft: view.draft,
      },
    };
  },

  act({ game, definition, state, command }) {
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      fail("command must be an object");
    }
    if (command.type === "start") {
      startJournalDraftWithinAction(game, command.definitionId);
      return { state };
    }
    if (command.type === "choose") {
      chooseJournalOptionWithinAction(game, command);
      return { state };
    }
    if (command.type === "dismiss") {
      dismissJournalDraftWithinAction(game);
      return { state };
    }
    if (command.type === "exit") {
      return {
        target: definition.finalTarget,
        effects: [{ op: "set", path: ["flags", "diary", "tutorial"] }],
      };
    }
    fail(`unknown command '${String(command.type)}'`);
  },
});
