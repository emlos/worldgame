import { Season, seasonForDate } from "../data/season.js";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const DAYLIGHT_BY_SEASON = Object.freeze({
  [Season.WINTER]: Object.freeze({ sunriseMinutes: 8 * 60, sunsetMinutes: 16 * 60 }),
  [Season.SPRING]: Object.freeze({ sunriseMinutes: 6 * 60, sunsetMinutes: 19 * 60 }),
  [Season.SUMMER]: Object.freeze({ sunriseMinutes: 5 * 60, sunsetMinutes: 21 * 60 }),
  [Season.AUTUMN]: Object.freeze({ sunriseMinutes: 7 * 60, sunsetMinutes: 18 * 60 }),
});

function validDate(value, label = "daylight date") {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`Invalid ${label}: ${String(value)}`);
  }
  return date;
}

function utcDayStart(date, dayOffset = 0) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) +
      dayOffset * DAY_MS,
  );
}

/** Return the absolute sunrise and sunset instants for one UTC calendar date. */
export function getDaylightWindow(value) {
  const date = validDate(value);
  const dayStart = utcDayStart(date);
  const season = seasonForDate(dayStart);
  const definition = DAYLIGHT_BY_SEASON[season];

  return {
    season,
    sunrise: new Date(dayStart.getTime() + definition.sunriseMinutes * MINUTE_MS),
    sunset: new Date(dayStart.getTime() + definition.sunsetMinutes * MINUTE_MS),
  };
}

/**
 * Resolve day/night progress at an instant. Night spans use the actual adjacent
 * days, so crossing a seasonal boundary still produces one continuous period.
 */
export function getDaylightAt(value) {
  const now = validDate(value);
  const today = getDaylightWindow(now);
  let period;
  let startsAt;
  let endsAt;

  if (now >= today.sunrise && now < today.sunset) {
    period = "day";
    startsAt = today.sunrise;
    endsAt = today.sunset;
  } else if (now < today.sunrise) {
    period = "night";
    startsAt = getDaylightWindow(utcDayStart(now, -1)).sunset;
    endsAt = today.sunrise;
  } else {
    period = "night";
    startsAt = today.sunset;
    endsAt = getDaylightWindow(utcDayStart(now, 1)).sunrise;
  }

  return {
    season: today.season,
    period,
    progress: (now.getTime() - startsAt.getTime()) /
      (endsAt.getTime() - startsAt.getTime()),
    startsAt: new Date(startsAt.getTime()),
    endsAt: new Date(endsAt.getTime()),
    sunrise: new Date(today.sunrise.getTime()),
    sunset: new Date(today.sunset.getTime()),
    nextTransitionAt: new Date(endsAt.getTime()),
  };
}
