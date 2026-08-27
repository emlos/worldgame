import { SCENE_ACTION_TYPE } from "../../../data/scene/actions.js";
import { SCENE_TEXT } from "../../../content/scene/genericText.js";
import { buildScene } from "./sceneEngine.js";
import {
  advanceWGSequence,
  applyWGEffects,
  exitWGStory,
  followWGChoice,
  followWGOutcome,
} from "./wg/storyRuntime.js";
import {
  resolveWGAutomaticEntry,
  WG_AUTO_TRIGGER,
} from "./wg/entryResolver.js";
import { calculateSkillCheckChance } from "../../../data/scene/skillChecks.js";
import { SKILLS } from "../../../data/player/stats.js";
import { keyedRandom01 } from "../../../shared/util/random.js";
import {
  getBusFare,
  getCurrentBusStop,
  resolveBusTravelOption,
} from "../busTransit.js";

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

function fail(code, message) {
  throw new ChoiceError(code, message);
}

function validateRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    fail(CHOICE_ERROR_CODE.invalidRequest, "Choice request must be an object");
  }

  const { sceneId, choiceId } = request;
  if (typeof sceneId !== "string" || !sceneId) {
    fail(CHOICE_ERROR_CODE.invalidRequest, "Choice request requires a sceneId");
  }
  if (typeof choiceId !== "string" || !choiceId) {
    fail(
      CHOICE_ERROR_CODE.invalidRequest,
      "Choice request requires a choiceId",
    );
  }

  return { sceneId, choiceId };
}

function findChoice(scene, choiceId) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.id === choiceId);
}

function choiceMinutes(choice) {
  const minutes = Number(choice.durationMinutes ?? 0);
  if (!Number.isFinite(minutes) || minutes < 0) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      `Choice '${choice.id}' has an invalid duration`,
    );
  }
  return minutes;
}

function requireOutdoors(game, actionLabel) {
  if (game.currentPlaceId != null) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      `${actionLabel} is unavailable while the player is inside a place`,
    );
  }
}

function performTravel(game, choice, minutes) {
  requireOutdoors(game, "Travel");

  const targetLocationId = String(choice.action.targetLocationId);
  const destination = game.world.getLocation(targetLocationId);
  const edge = game.location?.neighbors.get(targetLocationId);
  if (!destination || !edge) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      `Location '${targetLocationId}' is not directly reachable from here`,
    );
  }

  game.runAction({
    label: SCENE_TEXT.travelLog(destination.name),
    minutes,
    energyFree: choice.energyFree,
    apply(currentGame) {
      currentGame.moveTo(targetLocationId);
    },
    after(currentGame) {
      resolveWGAutomaticEntry(currentGame, WG_AUTO_TRIGGER.enterLocation);
    },
  });
  return SCENE_TEXT.travelResult(destination.name);
}

function performEnter(game, choice, minutes) {
  const access = game.getPlaceAccess(choice.action.placeId, {
    at: new Date(game.now.getTime() + minutes * 60_000),
  });
  if (!access.allowed) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      SCENE_TEXT.placeAccess(access, game.currentPlace?.name),
    );
  }
  const place = access.place;

  game.runAction({
    label: SCENE_TEXT.enterLog(place.name),
    minutes,
    energyFree: choice.energyFree,
    apply(currentGame) {
      currentGame.setCurrentPlace({ placeId: place.id });
    },
    after(currentGame) {
      resolveWGAutomaticEntry(currentGame, WG_AUTO_TRIGGER.enterPlace);
    },
  });
  return SCENE_TEXT.enterResult(place.name);
}

function performLeave(game, choice, minutes) {
  const place = game.currentPlace;
  if (!place) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "Leaving is unavailable while the player is already outside",
    );
  }

  game.runAction({
    label: SCENE_TEXT.leaveLog(place.name),
    minutes,
    energyFree: choice.energyFree,
    apply(currentGame) {
      if (choice.action.effects) {
        applyWGEffects(currentGame, choice.action.effects);
      }
      currentGame.setCurrentPlace();
      if (choice.action.exitStory && currentGame.currentStory) {
        exitWGStory(currentGame);
      }
    },
  });
  return SCENE_TEXT.leaveResult(place.name);
}

function performLoiter(game, choice, minutes) {
  requireOutdoors(game, "Loitering");
  game.runAction({
    label: SCENE_TEXT.loiterLog,
    minutes,
    energyFree: choice.energyFree,
  });
  return SCENE_TEXT.loiterResult;
}

function performBusTravel(game, choice, minutes) {
  const source = getCurrentBusStop(game);
  if (!source) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "Bus travel is unavailable unless the player is at a bus stop",
    );
  }

  const destination = resolveBusTravelOption(game, choice.action.targetPlaceId);
  if (!destination) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      `Bus stop '${String(choice.action.targetPlaceId)}' is not a valid destination`,
    );
  }
  if (minutes !== destination.travelMinutes) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "The selected bus journey has an invalid travel time",
    );
  }

  const fare = getBusFare(source);
  if (game.player.money < fare) {
    fail(
      CHOICE_ERROR_CODE.disabledChoice,
      `The player needs £${fare.toFixed(2)} for a bus ticket`,
    );
  }

  game.runAction({
    label: `Take the bus to ${destination.location.name}`,
    minutes,
    apply(currentGame) {
      currentGame.player.adjustMoney(-fare);
      currentGame.moveTo(String(destination.location.id));
      currentGame.setCurrentPlace({ placeId: destination.place.id });
    },
    after(currentGame) {
      resolveWGAutomaticEntry(currentGame, WG_AUTO_TRIGGER.enterPlace);
    },
  });
  return `You arrive at ${destination.place.name} in ${destination.location.name}.`;
}

function performWG(game, choice, minutes) {
  const result = game.runAction({
    label: choice.label,
    minutes,
    energyFree: choice.energyFree,
    apply(currentGame) {
      followWGChoice(currentGame, choice);
    },
  });
  if (result.timeChange?.ejectedFrom) {
    return `${result.timeChange.ejectedFrom.name} has closed. A member of staff ushers you outside.`;
  }
  return "Continue.";
}

function performWGNext(game, choice, minutes) {
  if (minutes !== 0) {
    fail(CHOICE_ERROR_CODE.invalidAction, "Sequence navigation cannot advance time");
  }
  advanceWGSequence(game, choice.action);
  return "Continue.";
}

function outcomeMinutes(choice, outcome, result) {
  const minutes = Number(outcome?.durationMinutes ?? 0);
  if (!Number.isFinite(minutes) || minutes < 0) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "Choice '" + choice.id + "' has an invalid " + result + " duration",
    );
  }
  return minutes;
}

function performSkillCheck(game, choice, _minutes, scene) {
  const check = choice.action.check;
  const definition = SKILLS[check.skillId];
  if (!definition) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "Unknown player skill '" + String(check.skillId) + "'",
    );
  }

  let chance;
  try {
    chance = calculateSkillCheckChance(
      game.player.getSkillValue(check.skillId),
      check.difficultyId,
      definition,
    );
  } catch (error) {
    fail(CHOICE_ERROR_CODE.invalidAction, error.message);
  }

  const roll = keyedRandom01(
    game.seed,
    [
      "skill-check-v1",
      game.actionRevision,
      scene.id,
      choice.id,
    ].join(":"),
  );
  const result = roll < chance ? "success" : "failure";
  const outcome = choice.action.outcomes?.[result];
  if (!outcome) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "Choice '" + choice.id + "' has no " + result + " outcome",
    );
  }
  const minutes = outcomeMinutes(choice, outcome, result);

  if (outcome.target === "@leave-place") {
    return performLeave(
      game,
      {
        ...choice,
        energyFree: outcome.energyFree,
        action: {
          type: SCENE_ACTION_TYPE.leave,
          effects: outcome.effects,
          exitStory: true,
        },
      },
      minutes,
    );
  }

  game.runAction({
    label: choice.label,
    minutes,
    energyFree: outcome.energyFree,
    apply(currentGame) {
      followWGOutcome(currentGame, outcome);
    },
  });
  return "Continue.";
}

const ACTION_HANDLERS = Object.freeze({
  [SCENE_ACTION_TYPE.travel]: performTravel,
  [SCENE_ACTION_TYPE.busTravel]: performBusTravel,
  [SCENE_ACTION_TYPE.enter]: performEnter,
  [SCENE_ACTION_TYPE.leave]: performLeave,
  [SCENE_ACTION_TYPE.loiter]: performLoiter,
  [SCENE_ACTION_TYPE.wg]: performWG,
  [SCENE_ACTION_TYPE.wgNext]: performWGNext,
  [SCENE_ACTION_TYPE.skillCheck]: performSkillCheck,
});

export function performChoice(game, request) {
  const { sceneId, choiceId } = validateRequest(request);
  const scene = buildScene(game);

  if (scene.id !== sceneId) {
    fail(
      CHOICE_ERROR_CODE.staleScene,
      "This scene is no longer current; choose from the refreshed scene",
    );
  }

  const choice = findChoice(scene, choiceId);
  if (!choice) {
    fail(
      CHOICE_ERROR_CODE.unavailableChoice,
      `Choice '${choiceId}' is not available in the current scene`,
    );
  }

  if (!choice.enabled) {
    fail(
      CHOICE_ERROR_CODE.disabledChoice,
      choice.disabledReason || `Choice '${choiceId}' is currently disabled`,
    );
  }

  const actionType = choice.action?.type;
  const handler = ACTION_HANDLERS[actionType];
  if (!handler) {
    fail(
      CHOICE_ERROR_CODE.unsupportedAction,
      `Unsupported choice action: ${String(actionType)}`,
    );
  }

  return handler(game, choice, choiceMinutes(choice), scene);
}
