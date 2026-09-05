import { collectReminders } from "./reminders.js";

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

/** Snapshot strings without consuming the underlying persistent reminders. */
export function collectDailyAnnouncements(game, date = game.now) {
  const at = asValidDate(date);
  return {
    day: announcementDayKey(at),
    items: collectReminders(game, at).map(({ id, tone, text }) => ({ id, tone, text })),
  };
}

export function emptyDailyAnnouncements(date) {
  return { day: announcementDayKey(date), items: [] };
}

/** Dismiss the visible batch without changing its source reminders. */
export function dismissDailyAnnouncements(game) {
  const dismissed = game.dailyAnnouncements.items.length;
  if (dismissed > 0) {
    game.dailyAnnouncements = emptyDailyAnnouncements(game.now);
  }
  return dismissed;
}
