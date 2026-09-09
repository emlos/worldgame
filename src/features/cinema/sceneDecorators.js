import { createChoice } from "../../game/scene/choiceContract.js";
import {
  CINEMA_PLACE_KEY,
  CINEMA_TICKET_PRICE,
  CINEMA_TRAILER_MINUTES,
  getCinemaScreenings,
  minutesUntilScreening,
} from "./programme.js";

export const CINEMA_ACTION_TYPE = Object.freeze({ watch: "cinema.watch" });

function clock(date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function screeningTable(screenings) {
  return {
    type: "table",
    caption: "Today's screenings",
    columns: ["Time", "Film", "Genre", "Runtime", "Screen"],
    rows: screenings.map(({ startsAt, movie, screen }) => [
      clock(startsAt),
      movie.title,
      movie.genre,
      `${movie.durationMinutes} min`,
      String(screen),
    ]),
  };
}

function decorateCinemaHub({ game, scene }) {
  const screenings = getCinemaScreenings(game.seed, game.now);
  const upcoming = screenings.filter(({ startsAt }) => startsAt >= game.now);
  const canAfford = game.player.money >= CINEMA_TICKET_PRICE;
  const choices = upcoming.map((screening) => createChoice({
    id: `cinema-watch:${screening.id}`,
    icon: "🎟️",
    label: `${clock(screening.startsAt)} - ${screening.movie.title}`,
    durationMinutes:
      minutesUntilScreening(screening, game.now) +
      CINEMA_TRAILER_MINUTES +
      screening.movie.durationMinutes,
    energyFree: true,
    costs: [{
      type: "money",
      amount: CINEMA_TICKET_PRICE,
      label: `£${CINEMA_TICKET_PRICE} ticket`,
      currency: "GBP",
    }],
    enabled: canAfford,
    disabledReason: canAfford ? null : `You need £${CINEMA_TICKET_PRICE} for a ticket.`,
    action: {
      type: CINEMA_ACTION_TYPE.watch,
      screeningId: screening.id,
    },
  }));
  const content = [screeningTable(screenings), ...scene.content];
  if (!upcoming.length) {
    content.push({ type: "paragraph", text: "The box office has stopped selling tickets for today." });
  }
  const navigationIndex = scene.sections.findIndex(({ id }) => id === "navigation");
  const screeningsSection = {
    id: "screenings",
    heading: "Tickets - £10",
    choices,
  };
  const sections = [...scene.sections];
  sections.splice(navigationIndex < 0 ? sections.length : navigationIndex, 0, screeningsSection);
  return { ...scene, content, sections };
}

export const CINEMA_SCENE_DECORATORS = Object.freeze([
  Object.freeze({
    id: "hub-programme",
    applies: ({ game, scene }) =>
      scene.kind === "place" && game.currentPlace?.key === CINEMA_PLACE_KEY,
    decorate: decorateCinemaHub,
  }),
]);
