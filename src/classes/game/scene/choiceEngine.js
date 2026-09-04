import { SCENE_ACTION_TYPE } from "../../../data/scene/actions.js";
import { SCENE_TEXT } from "../../../content/scene/genericText.js";
import { buildScene } from "./sceneEngine.js";
import {
  advanceWGScene,
  applyWGEffects,
  enterWGTarget,
  exitWGStory,
  getWGScene,
  resolveActiveWGStory,
  suspendWGContinuation,
} from "./wg/storyRuntime.js";
import { materializeWGResponse } from "./wg/sceneMaterializer.js";
import {
  resolveWGAutomaticScene,
  resolveWGPoolScene,
  WG_AUTO_TRIGGER,
} from "./wg/sceneExposure.js";
import {
  calculateSkillCheckChance,
  getPlayerSkillCheckValue,
  getSkillCheckTargetDefinition,
} from "../../../data/scene/skillChecks.js";
import { keyedRandom01 } from "../../../shared/util/random.js";
import { actWGSystem } from "./wg/storySystemRegistry.js";
import {
  getBusFare,
  getCurrentBusStop,
  resolveBusTravelOption,
} from "../busTransit.js";
import {
  finalizeWGInterruptCheckpoint,
  resolveWGInterruptCheckpoint,
} from "./wg/interrupts.js";

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

function actionResult({ notice = "", paragraphs = [] } = {}) {
  return { notice, paragraphs };
}

function runChoiceAction(game, options) {
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

function selectWGResponse(
  game,
  responses,
  { revision, sceneId, choiceId, variant },
) {
  if (!Array.isArray(responses) || !responses.length) return [];
  const key = [
    "wg-response-v1",
    revision,
    sceneId,
    choiceId,
    variant || "direct",
  ].join(":");
  const index = Math.floor(keyedRandom01(game.seed, key) * responses.length);
  return materializeWGResponse(game, responses[index]);
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

  runChoiceAction(game, {
    label: SCENE_TEXT.travelLog(destination.name),
    minutes,
    energyFree: choice.energyFree,
    resting: choice.resting,
    apply(currentGame) {
      currentGame.moveTo(targetLocationId);
    },
    after(currentGame) {
      resolveWGAutomaticScene(currentGame, WG_AUTO_TRIGGER.enterLocation);
    },
  });
  return actionResult();
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

  runChoiceAction(game, {
    label: SCENE_TEXT.enterLog(place.name),
    minutes,
    energyFree: choice.energyFree,
    resting: choice.resting,
    apply(currentGame) {
      currentGame.setCurrentPlace({ placeId: place.id });
    },
    after(currentGame) {
      resolveWGAutomaticScene(currentGame, WG_AUTO_TRIGGER.enterPlace);
    },
  });
  return actionResult();
}

function performLeave(game, choice, minutes, scene) {
  const place = game.currentPlace;
  if (!place) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "Leaving is unavailable while the player is already outside",
    );
  }

  const revision = game.actionRevision;
  let responseParagraphs = [];
  runChoiceAction(game, {
    label: SCENE_TEXT.leaveLog(place.name),
    minutes,
    energyFree: choice.energyFree,
    resting: choice.resting,
    apply(currentGame) {
      if (choice.action.effects) {
        applyWGEffects(currentGame, choice.action.effects);
      }
      currentGame.setCurrentPlace();
      if (choice.action.exitStory && currentGame.currentStory) {
        exitWGStory(currentGame);
      }
    },
    after(currentGame) {
      responseParagraphs = selectWGResponse(
        currentGame,
        choice.action.responses,
        {
          revision,
          sceneId: scene.id,
          choiceId: choice.id,
          variant: choice.action.responseVariant,
        },
      );
    },
  });
  return actionResult({ paragraphs: responseParagraphs });
}

function performLoiter(game, choice, minutes) {
  requireOutdoors(game, "Loitering");
  runChoiceAction(game, {
    label: SCENE_TEXT.loiterLog,
    minutes,
    energyFree: choice.energyFree,
    resting: choice.resting,
  });
  return actionResult();
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

  runChoiceAction(game, {
    label: `Take the bus to ${destination.location.name}`,
    minutes,
    apply(currentGame) {
      currentGame.player.adjustMoney(-fare);
      currentGame.moveTo(String(destination.location.id));
      currentGame.setCurrentPlace({ placeId: destination.place.id });
    },
    after(currentGame) {
      resolveWGAutomaticScene(currentGame, WG_AUTO_TRIGGER.enterPlace);
    },
  });
  return actionResult();
}

function enterWGOutcome(game, outcome, eventPool, choiceId, sourceSceneId = null) {
  const selected = eventPool
    ? resolveWGPoolScene(game, eventPool.id, eventPool.chance)
    : null;
  if (!selected) {
    enterWGTarget(game, outcome.target, {
      sceneId: outcome.sceneId || null,
    });
    return null;
  }

  suspendWGContinuation(game, outcome, {
    poolId: eventPool.id,
    eventSceneId: selected.id,
    choiceId,
    sourceSceneId,
  });
  enterWGTarget(game, selected.id);
  return selected;
}

function performWG(game, choice, minutes, scene) {
  const revision = game.actionRevision;
  let responseParagraphs = [];
  const result = runChoiceAction(game, {
    label: choice.label,
    minutes,
    energyFree: choice.energyFree,
    resting: choice.resting,
    apply(currentGame) {
      applyWGEffects(currentGame, choice.action.effects || []);
    },
    after(currentGame) {
      enterWGOutcome(
        currentGame,
        choice.action,
        choice.action.eventPool,
        choice.id,
        scene.wgStoryId,
      );
      resolveActiveWGStory(currentGame);
      responseParagraphs = selectWGResponse(
        currentGame,
        choice.action.responses,
        {
          revision,
          sceneId: scene.id,
          choiceId: choice.id,
        },
      );
    },
  });
  if (result.timeChange?.ejectedFrom) {
    return actionResult({
      notice: `${result.timeChange.ejectedFrom.name} has closed. A member of staff ushers you outside.`,
    });
  }
  return actionResult({ paragraphs: responseParagraphs });
}

function performWGNext(game, choice, minutes) {
  if (minutes !== 0) {
    fail(CHOICE_ERROR_CODE.invalidAction, "Scene navigation cannot advance time");
  }
  runChoiceAction(game, {
    label: "",
    after(currentGame) {
      advanceWGScene(currentGame, choice.action);
      resolveActiveWGStory(currentGame);
    },
  });
  return actionResult();
}

function performWGSystem(game, choice, minutes) {
  const action = choice.action;
  const frame = game.currentStory;
  const definition = getWGScene(action.sceneId);
  if (
    frame?.id !== action.sceneId ||
    !frame.system ||
    frame.system.id !== action.systemId ||
    definition?.system?.id !== action.systemId
  ) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "WG system action no longer matches the active scene",
    );
  }

  let notice = "";
  let paragraphs = [];
  let outcomeTarget = null;
  runChoiceAction(game, {
    label: choice.label,
    minutes,
    energyFree: choice.energyFree,
    resting: choice.resting,
    apply(currentGame) {
      const currentFrame = currentGame.currentStory;
      const outcome = actWGSystem(
        currentGame,
        definition,
        currentFrame,
        action.command,
      );
      applyWGEffects(currentGame, outcome.effects);
      notice = outcome.notice;
      paragraphs = outcome.paragraphs;
      if (outcome.target !== null) {
        outcomeTarget = outcome.target;
        return;
      }
      currentFrame.system.state = outcome.state;
      currentFrame.system.revision += 1;
      currentGame.storyRevision += 1;
    },
    after(currentGame) {
      if (outcomeTarget !== null) enterWGTarget(currentGame, outcomeTarget);
      resolveActiveWGStory(currentGame);
    },
  });
  return actionResult({ notice, paragraphs });
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
  const definition = getSkillCheckTargetDefinition(
    check.targetType,
    check.targetId,
  );
  if (!definition) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "Unknown skill-check target '" +
        String(check.targetType) +
        "." +
        String(check.targetId) +
        "'",
    );
  }

  let chance;
  try {
    chance = calculateSkillCheckChance(
      getPlayerSkillCheckValue(game.player, check.targetType, check.targetId),
      check.difficultyId,
      definition,
    );
  } catch (error) {
    fail(CHOICE_ERROR_CODE.invalidAction, error.message);
  }

  const revision = game.actionRevision;
  const roll = keyedRandom01(
    game.seed,
    [
      "skill-check-v1",
      revision,
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
        resting: outcome.resting,
        action: {
          type: SCENE_ACTION_TYPE.leave,
          effects: outcome.effects,
          responses: outcome.responses,
          responseVariant: result,
          exitStory: true,
        },
      },
      minutes,
      scene,
    );
  }

  let responseParagraphs = [];
  runChoiceAction(game, {
    label: choice.label,
    minutes,
    energyFree: outcome.energyFree,
    resting: outcome.resting,
    apply(currentGame) {
      applyWGEffects(currentGame, outcome.effects || []);
    },
    after(currentGame) {
      enterWGOutcome(
        currentGame,
        outcome,
        choice.action.eventPool,
        choice.id,
        scene.wgStoryId,
      );
      resolveActiveWGStory(currentGame);
      responseParagraphs = selectWGResponse(currentGame, outcome.responses, {
        revision,
        sceneId: scene.id,
        choiceId: choice.id,
        variant: result,
      });
    },
  });
  return actionResult({ paragraphs: responseParagraphs });
}

const ACTION_HANDLERS = Object.freeze({
  [SCENE_ACTION_TYPE.travel]: performTravel,
  [SCENE_ACTION_TYPE.busTravel]: performBusTravel,
  [SCENE_ACTION_TYPE.enter]: performEnter,
  [SCENE_ACTION_TYPE.leave]: performLeave,
  [SCENE_ACTION_TYPE.loiter]: performLoiter,
  [SCENE_ACTION_TYPE.wg]: performWG,
  [SCENE_ACTION_TYPE.wgNext]: performWGNext,
  [SCENE_ACTION_TYPE.wgSystem]: performWGSystem,
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
