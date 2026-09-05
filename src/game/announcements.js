import {
  failSave,
  requiredSaveField,
  requireSameSaveValue,
  saveArray,
  saveRecord,
  saveString,
} from "../shared/util/saveValidation.js";
import { collectReminders, isKnownReminderItem } from "./reminders.js";
import { DEFAULT_FEATURE_CATALOG } from "../features/index.js";

const ANNOUNCEMENT_TONES = new Set(["info", "warning"]);

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

export function validateDailyAnnouncementsSave(
  value,
  { path = "save.dailyAnnouncements", gameTime, features = DEFAULT_FEATURE_CATALOG },
) {
  const batch = saveRecord(value, path);
  const day = saveString(requiredSaveField(batch, "day", path), `${path}.day`, {
    nonEmpty: true,
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    failSave(`${path}.day`, "must be a UTC date in YYYY-MM-DD form");
  }
  requireSameSaveValue(
    day,
    new Date(gameTime).toISOString().slice(0, 10),
    `${path}.day`,
    "the current game day",
  );

  const ids = new Set();
  saveArray(requiredSaveField(batch, "items", path), `${path}.items`).forEach(
    (itemData, index) => {
      const itemPath = `${path}.items[${index}]`;
      const item = saveRecord(itemData, itemPath);
      const id = saveString(requiredSaveField(item, "id", itemPath), `${itemPath}.id`, {
        nonEmpty: true,
      });
      if (ids.has(id)) failSave(`${itemPath}.id`, `duplicates announcement '${id}'`);
      if (!isKnownReminderItem(id, features)) failSave(`${itemPath}.id`, `unknown reminder '${id}'`);
      ids.add(id);
      const tone = saveString(
        requiredSaveField(item, "tone", itemPath),
        `${itemPath}.tone`,
        { nonEmpty: true },
      );
      if (!ANNOUNCEMENT_TONES.has(tone)) {
        failSave(`${itemPath}.tone`, "must be 'info' or 'warning'");
      }
      saveString(requiredSaveField(item, "text", itemPath), `${itemPath}.text`, {
        nonEmpty: true,
      });
    },
  );
  return batch;
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
