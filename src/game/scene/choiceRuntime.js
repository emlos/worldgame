import {
  finalizeWGInterruptCheckpoint,
  resolveWGInterruptCheckpoint,
} from "../../story/wg/runtime/interrupts.js";

export const CHOICE_ERROR_CODE = Object.freeze({
  invalidRequest: "invalid-request",
  staleScene: "stale-scene",
  unavailableChoice: "unavailable-choice",
  disabledChoice: "disabled-choice",
  invalidAction: "invalid-action",
  unsupportedAction: "unsupported-action",
});

export class ChoiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ChoiceError";
    this.code = code;
  }
}

export function failChoice(code, message) {
  throw new ChoiceError(code, message);
}

export function actionResult({ notice = "", paragraphs = [] } = {}) {
  return { notice, paragraphs };
}

export function runChoiceAction(game, options) {
  const deferForScene = Boolean(game.currentStory);
  return game.runAction({
    ...options,
    interrupt(currentGame, stage, timeChange) {
      if (stage === "before-after") {
        const interrupted = resolveWGInterruptCheckpoint(currentGame, {
          deferForScene,
        });
        return Boolean(timeChange?.ejectedFrom) || interrupted;
      }
      finalizeWGInterruptCheckpoint(currentGame);
      return false;
    },
  });
}
