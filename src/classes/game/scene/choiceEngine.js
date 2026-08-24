import { SCENE_ACTION_TYPE } from "../../../data/scene/actions.js";
import { buildScene } from "./sceneEngine.js";

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
    label: `Travel to ${destination.name}`,
    minutes,
    apply(currentGame) {
      currentGame.moveTo(targetLocationId);
    },
  });
  return `You arrive in ${destination.name}.`;
}

function performEnter(game, choice, minutes) {
  requireOutdoors(game, "Entering a place");

  const place = game.location?.places.find(
    (candidate) => String(candidate.id) === String(choice.action.placeId),
  );
  if (!place) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      `Place '${choice.action.placeId}' is not available at this location`,
    );
  }

  game.runAction({
    label: `Enter ${place.name}`,
    minutes,
    apply(currentGame) {
      currentGame.setCurrentPlace({ placeId: place.id });
    },
  });
  return `You enter ${place.name}.`;
}

function performLeave(game, _choice, minutes) {
  const place = game.currentPlace;
  if (!place) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      "Leaving is unavailable while the player is already outside",
    );
  }

  game.runAction({
    label: `Leave ${place.name}`,
    minutes,
    apply(currentGame) {
      currentGame.setCurrentPlace();
    },
  });
  return `You step outside ${place.name}.`;
}

function performLoiter(game, _choice, minutes) {
  requireOutdoors(game, "Loitering");
  game.runAction({ label: "Loiter", minutes });
  return "You spend a little while watching the area around you.";
}

function performGreet(game, choice, minutes) {
  const npc = game.npcs.get(String(choice.action.npcId));
  const present = npc && game.getNPCsAtCurrentPosition().includes(npc);
  if (!present) {
    fail(
      CHOICE_ERROR_CODE.invalidAction,
      `NPC '${choice.action.npcId}' is no longer at the player's position`,
    );
  }

  game.runAction({
    label: `Greet ${npc.name}`,
    minutes,
    apply(currentGame) {
      currentGame.player.bumpRelationship(npc.id, 0.02);
    },
  });
  return `You say hello to ${npc.meta?.shortName || npc.name}.`;
}

const ACTION_HANDLERS = Object.freeze({
  [SCENE_ACTION_TYPE.travel]: performTravel,
  [SCENE_ACTION_TYPE.enter]: performEnter,
  [SCENE_ACTION_TYPE.leave]: performLeave,
  [SCENE_ACTION_TYPE.loiter]: performLoiter,
  [SCENE_ACTION_TYPE.greet]: performGreet,
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

  return handler(game, choice, choiceMinutes(choice));
}
