import { keyedRandom01 } from "../../shared/util/random.js";
import { CINEMA_MOVIES } from "./movies.js";

export const CINEMA_PLACE_KEY = "cinema";
export const CINEMA_TICKET_PRICE = 10;
export const CINEMA_TRAILER_MINUTES = 15;
export const CINEMA_TICKET_SALES_LEAD_MINUTES = 15;
export const CINEMA_TICKET_SALES_LATE_MINUTES = 10;

const MINUTE_MS = 60_000;

const BASE_SCREENINGS = Object.freeze([
  Object.freeze({ hour: 12, minute: 30, movieIndex: 0, screen: 1 }),
  Object.freeze({ hour: 15, minute: 15, movieIndex: 1, screen: 1 }),
  Object.freeze({ hour: 18, minute: 0, movieIndex: 2, screen: 1 }),
  Object.freeze({ hour: 20, minute: 45, movieIndex: 3, screen: 1 }),
]);
const BUSY_DAYS = new Set([0, 3, 5, 6]);

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Cinema programme requires a valid date");
  return date;
}

function utcDateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function getCinemaWeekKey(value) {
  const date = validDate(value);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return utcDateKey(date);
}

export function getCinemaProgramme(seed, value) {
  const weekKey = getCinemaWeekKey(value);
  return CINEMA_MOVIES
    .map((movie) => ({
      movie,
      order: keyedRandom01(seed, `cinema:${weekKey}:${movie.id}`),
    }))
    .sort((left, right) => left.order - right.order || left.movie.id.localeCompare(right.movie.id))
    .slice(0, 4)
    .map(({ movie }) => movie);
}

function screeningAt(date, hour, minute) {
  const at = validDate(date);
  at.setUTCHours(hour, minute, 0, 0);
  return at;
}

export function getCinemaScreenings(seed, value) {
  const date = validDate(value);
  const movies = getCinemaProgramme(seed, date);
  const definitions = [...BASE_SCREENINGS];
  if (BUSY_DAYS.has(date.getUTCDay())) {
    definitions.push({ hour: 18, minute: 0, movieIndex: 0, screen: 2 });
  }
  definitions.push({ hour: 20, minute: 45, movieIndex: 1, screen: 2 });

  return definitions
    .map((definition) => {
      const movie = movies[definition.movieIndex];
      const startsAt = screeningAt(date, definition.hour, definition.minute);
      return Object.freeze({
        id: `${utcDateKey(date)}:${definition.hour}:${definition.minute}:${definition.screen}:${movie.id}`,
        movie,
        screen: definition.screen,
        startsAt,
        endsAt: new Date(
          startsAt.getTime() +
            (movie.durationMinutes + CINEMA_TRAILER_MINUTES) * 60_000,
        ),
      });
    })
    .sort((left, right) => left.startsAt - right.startsAt || left.screen - right.screen);
}

export function findCinemaScreening(seed, screeningId, value) {
  return getCinemaScreenings(seed, value).find(({ id }) => id === screeningId) ?? null;
}

export function cinemaTicketsAreOnSale(screening, value) {
  const now = validDate(value).getTime();
  const startsAt = screening.startsAt.getTime();
  return now >= startsAt - CINEMA_TICKET_SALES_LEAD_MINUTES * MINUTE_MS &&
    now <= startsAt + CINEMA_TICKET_SALES_LATE_MINUTES * MINUTE_MS;
}

export function cinemaViewingMinutes(screening, value) {
  const now = validDate(value).getTime();
  return Math.max(0, Math.ceil((screening.endsAt.getTime() - now) / MINUTE_MS));
}
