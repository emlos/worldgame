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

const CARO_CINEMA_OBLIGATION_ID = "caro_part_time_cinema";

function caroIsWorkingHere(game) {
  const caro = game.npcs.get("caro");
  if (!caro || !game.getNPCsAtCurrentPosition().includes(caro)) return false;
  return caro.brain?.getScheduleStatus?.(game.now).obligationId ===
    CARO_CINEMA_OBLIGATION_ID;
}

function playerHasMetCaro(game) {
  const caro = game.npcs.get("caro");
  if (!caro) return false;
  return game.player.getRelationshipProfile(
    caro.id,
    caro.relationshipProfile,
  ).met;
}

function caroTicketComment(movie) {
  const title = movie.title;
  if (movie.genre === "Horror" || movie.genre === "Supernatural") {
    return `Caro tears your ticket. "${title}," she says. "If somebody screams behind you, check whether it's coming from the film before you panic."`;
  }
  if (movie.genre === "Romance" || movie.genre === "Romantic comedy") {
    return `Caro tears your ticket. "${title}. Bold choice," she says. "Try not to judge your real relationships by anything resolved in under two hours."`;
  }
  if (movie.genre === "Comedy") {
    return `Caro tears your ticket. "${title}," she says. "I can usually tell how funny it is by how much popcorn gets dropped. I'll review the floor later."`;
  }
  if (movie.genre === "Documentary" || movie.genre === "Historical") {
    return `Caro tears your ticket. "${title}. Educational," she says. "If anyone asks, this absolutely counts as studying."`;
  }
  return `Caro tears your ticket and reads the title. "${title}. Tell me whether it earns the dramatic poster on your way out."`;
}

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

  const attendantComment = caroIsWorkingHere(game) && playerHasMetCaro(game)
    ? caroTicketComment(screening.movie)
    : null;

  runChoiceAction(game, {
    label: `Watch ${screening.movie.title}`,
    minutes,
    energyFree: true,
    apply(currentGame) {
      currentGame.player.adjustMoney(-CINEMA_TICKET_PRICE);
    },
  });
  return actionResult({
    paragraphs: [
      ...(attendantComment ? [attendantComment] : []),
      `You watch ${screening.movie.title}, staying through the credits before returning to the foyer.`,
    ],
  });
}

export const CINEMA_ACTION_HANDLERS = Object.freeze({
  [CINEMA_ACTION_TYPE.watch]: performWatchMovie,
});
