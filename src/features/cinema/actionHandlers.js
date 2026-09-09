import {
  CHOICE_ERROR_CODE,
  actionResult,
  failChoice,
  runChoiceAction,
} from "../../game/scene/choiceRuntime.js";
import { CINEMA_ACTION_TYPE } from "./sceneDecorators.js";
import {
  CINEMA_PLACE_KEY,
  CINEMA_TICKET_PRICE,
  CINEMA_TRAILER_MINUTES,
  findCinemaScreening,
  minutesUntilScreening,
} from "./programme.js";

export function performWatchMovie(game, choice, minutes) {
  if (game.currentPlace?.key !== CINEMA_PLACE_KEY) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "A cinema ticket can only be used at the cinema");
  }
  const screening = findCinemaScreening(game.seed, choice.action.screeningId, game.now);
  if (!screening || screening.startsAt < game.now) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "That screening is no longer available");
  }
  const expectedMinutes =
    minutesUntilScreening(screening, game.now) +
    CINEMA_TRAILER_MINUTES +
    screening.movie.durationMinutes;
  if (minutes !== expectedMinutes) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "The selected screening has an invalid duration");
  }
  if (game.player.money < CINEMA_TICKET_PRICE) {
    failChoice(CHOICE_ERROR_CODE.disabledChoice, `The player needs £${CINEMA_TICKET_PRICE} for a ticket`);
  }

  runChoiceAction(game, {
    label: `Watch ${screening.movie.title}`,
    minutes,
    energyFree: true,
    apply(currentGame) {
      currentGame.player.adjustMoney(-CINEMA_TICKET_PRICE);
    },
  });
  return actionResult({
    paragraphs: [`You watch ${screening.movie.title}, staying through the credits before returning to the foyer.`],
  });
}

export const CINEMA_ACTION_HANDLERS = Object.freeze({
  [CINEMA_ACTION_TYPE.watch]: performWatchMovie,
});
