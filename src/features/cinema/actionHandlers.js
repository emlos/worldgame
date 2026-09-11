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
  cinemaTicketsAreOnSale,
  cinemaViewingMinutes,
  findCinemaScreening,
} from "./programme.js";
import { addCinemaScreeningReminder } from "./reminders.js";

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

function caroTicketComment(caro, movie) {
  const title = movie.title;
  const subject = caro.pronouns.subject;
  if (movie.genre === "Horror" || movie.genre === "Supernatural") {
    return `Caro tears your ticket. "${title}," ${subject} says. "If somebody screams behind you, check whether it's coming from the film before you panic."`;
  }
  if (movie.genre === "Romance" || movie.genre === "Romantic comedy") {
    return `Caro tears your ticket. "${title}. Bold choice," ${subject} says. "Try not to judge your real relationships by anything resolved in under two hours."`;
  }
  if (movie.genre === "Comedy") {
    return `Caro tears your ticket. "${title}," ${subject} says. "I can usually tell how funny it is by how much popcorn gets dropped. I'll review the floor later."`;
  }
  if (movie.genre === "Documentary" || movie.genre === "Historical") {
    return `Caro tears your ticket. "${title}. Educational," ${subject} says. "If anyone asks, this absolutely counts as studying."`;
  }
  return `Caro tears your ticket and reads the title. "${title}," ${subject} says. "Tell me whether it earns the dramatic poster on your way out."`;
}

function screeningClock(date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function performSetScreeningReminder(game, choice, minutes) {
  if (minutes !== 0) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "Setting a cinema reminder cannot advance time");
  }
  if (game.currentPlace?.key !== CINEMA_PLACE_KEY) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "A screening reminder can only be set at the cinema");
  }
  const screening = findCinemaScreening(game.seed, choice.action.screeningId, game.now);
  if (!screening || screening.startsAt <= game.now) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "That screening has already started");
  }

  runChoiceAction(game, {
    label: `Set reminder for ${screening.movie.title}`,
    apply(currentGame) {
      if (!addCinemaScreeningReminder(currentGame, screening)) {
        failChoice(CHOICE_ERROR_CODE.disabledChoice, "That screening already has a reminder");
      }
    },
  });
  return actionResult({
    notice: `Reminder set for ${screening.movie.title} at ${screeningClock(screening.startsAt)}.`,
  });
}

export function performWatchMovie(game, choice, minutes) {
  if (game.currentPlace?.key !== CINEMA_PLACE_KEY) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "A cinema ticket can only be used at the cinema");
  }
  const screening = findCinemaScreening(game.seed, choice.action.screeningId, game.now);
  if (!screening || !cinemaTicketsAreOnSale(screening, game.now)) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "Tickets are not on sale for that screening");
  }
  const expectedMinutes = cinemaViewingMinutes(screening, game.now);
  if (minutes !== expectedMinutes) {
    failChoice(CHOICE_ERROR_CODE.invalidAction, "The selected screening has an invalid duration");
  }
  if (game.player.money < CINEMA_TICKET_PRICE) {
    failChoice(CHOICE_ERROR_CODE.disabledChoice, `The player needs £${CINEMA_TICKET_PRICE} for a ticket`);
  }

  const caro = game.npcs.get("caro");
  const attendantComment = caroIsWorkingHere(game) && playerHasMetCaro(game)
    ? caroTicketComment(caro, screening.movie)
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
  [CINEMA_ACTION_TYPE.remind]: performSetScreeningReminder,
  [CINEMA_ACTION_TYPE.watch]: performWatchMovie,
});
