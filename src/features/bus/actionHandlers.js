import {
  CHOICE_ERROR_CODE,
  actionResult,
  failChoice,
  runChoiceAction,
} from "../../game/scene/choiceRuntime.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../../story/wg/runtime/sceneExposure.js";
import { exitWGStory } from "../../story/wg/runtime/storyRuntime.js";
import { BUS_ACTION_TYPE } from "./sceneDecorators.js";
import {
  getBusFare,
  getCurrentBusStop,
  resolveBusTravelOption,
} from "./transit.js";

export function performBusTravel(game, choice, minutes) {
  const source = getCurrentBusStop(game);
  if (!source) {
    failChoice(
      CHOICE_ERROR_CODE.invalidAction,
      "Bus travel is unavailable unless the player is at a bus stop",
    );
  }
  const destination = resolveBusTravelOption(game, choice.action.targetPlaceId);
  if (!destination) {
    failChoice(
      CHOICE_ERROR_CODE.invalidAction,
      `Bus stop '${String(choice.action.targetPlaceId)}' is not a valid destination`,
    );
  }
  if (minutes !== destination.travelMinutes) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "The selected bus journey has an invalid travel time");
  }
  const fare = getBusFare(source);
  if (game.player.money < fare) {
    failChoice(
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
      exitWGStory(currentGame);
    },
    after(currentGame) {
      resolveWGAutomaticScene(currentGame, WG_AUTO_TRIGGER.enterPlace);
    },
  });
  return actionResult();
}

export const BUS_ACTION_HANDLERS = Object.freeze({
  [BUS_ACTION_TYPE.travel]: performBusTravel,
});
