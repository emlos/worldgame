import { getSchoolDayPlan } from "../../data/player/schedule.js";

export const ANNOUNCEMENT_FLAG_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "vega-station",
    flag: "announcement_vega_station",
    priority: 200,
    tone: "info",
    text: "Vega expects you at the station at [warning]12:00[/warning] today.",
  }),
  Object.freeze({
    id: "school-project-last-day",
    flag: "announcement_school_project_last_day",
    priority: 210,
    tone: "warning",
    text: "Today is the last day to present your school project!",
  }),
]);

function asValidDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`Invalid announcement date: ${String(value)}`);
  }
  return date;
}

/** Stable UTC calendar key used by the game clock and save data. */
export function announcementDayKey(value) {
  return asValidDate(value).toISOString().slice(0, 10);
}

function buildSchoolAnnouncement(game, date) {
  const schoolDay = getSchoolDayPlan(game, { date });
  if (!schoolDay.hasSchool) return null;

  return {
    id: "school-day",
    priority: 100,
    tone: "info",
    text:
      "Today is a school day. Classes start at " +
      `[warning]${schoolDay.school.start}[/warning].`,
  };
}

/**
 * Snapshot every announcement that applies to one in-game day.
 *
 * Automatic providers derive notices from authoritative state. Authored
 * announcement flags remain set until story effects explicitly unset them,
 * allowing reminders to repeat on later days when desired.
 */
export function collectDailyAnnouncements(game, date = game?.now) {
  const at = asValidDate(date);
  const candidates = [];
  const ids = new Set();

  const add = (announcement) => {
    if (!announcement || ids.has(announcement.id)) return;
    ids.add(announcement.id);
    candidates.push(announcement);
  };

  add(buildSchoolAnnouncement(game, at));

  for (const definition of ANNOUNCEMENT_FLAG_DEFINITIONS) {
    if (!game.hasFlag(definition.flag)) continue;
    add({
      id: definition.id,
      priority: definition.priority,
      tone: definition.tone,
      text: definition.text,
    });
  }

  candidates.sort(
    (left, right) =>
      left.priority - right.priority || left.id.localeCompare(right.id),
  );

  return {
    day: announcementDayKey(at),
    items: candidates.map(({ id, tone, text }) => ({ id, tone, text })),
  };
}

export function emptyDailyAnnouncements(date) {
  return { day: announcementDayKey(date), items: [] };
}
