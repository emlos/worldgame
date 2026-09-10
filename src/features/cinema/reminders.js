import {
  failSave,
  requiredSaveField,
  saveArray,
  saveBoolean,
  saveDateMilliseconds,
  saveRecord,
  saveString,
} from "../../shared/util/saveValidation.js";
import { findCinemaScreening } from "./programme.js";

export const CINEMA_SCREENING_REMINDER_ID = "system:cinema-screening";
export const CINEMA_REMINDER_LEAD_MINUTES = 15;

const MINUTE_MS = 60_000;

function cinemaState(game) {
  const state = game.featureState.cinema;
  if (!state || !Array.isArray(state.screeningReminders)) {
    throw new Error("Cinema reminder state is unavailable");
  }
  return state;
}

function clock(date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function resolveReminder(game, reminder) {
  return findCinemaScreening(
    game.seed,
    reminder.screeningId,
    new Date(reminder.startsAt),
  );
}

function futureReminders(game, value) {
  const now = value instanceof Date ? value : new Date(value);
  const nowMs = now.getTime();
  return cinemaState(game).screeningReminders
    .map((reminder) => ({ reminder, screening: resolveReminder(game, reminder) }))
    .filter(({ reminder, screening }) => {
      if (!screening) return false;
      const startsMs = Date.parse(reminder.startsAt);
      return nowMs < startsMs;
    });
}

export function cinemaScreeningReminderText(game, date = game.now) {
  const future = futureReminders(game, date);
  if (!future.length) return null;
  const details = future.map(({ screening }) =>
    `${screening.movie.title} at ${clock(screening.startsAt)}, screen ${screening.screen}`);
  return `Cinema: ${details.join("; ")}.`;
}

function cinemaScreeningAlertText(game, date = game.now) {
  const nowMs = new Date(date).getTime();
  const due = futureReminders(game, date).filter(({ reminder }) =>
    nowMs >= Date.parse(reminder.startsAt) -
      CINEMA_REMINDER_LEAD_MINUTES * MINUTE_MS);
  if (!due.length) return null;
  const details = due.map(({ reminder, screening }) => {
    const minutes = Math.max(1, Math.ceil((Date.parse(reminder.startsAt) - nowMs) / MINUTE_MS));
    return `${screening.movie.title} starts at ${clock(screening.startsAt)} ` +
      `(in ${minutes} minute${minutes === 1 ? "" : "s"}), screen ${screening.screen}`;
  });
  return `[info]Cinema reminder: ${details.join("; ")}.[/info]`;
}

function removeAnnouncement(game) {
  game.dailyAnnouncements.items = game.dailyAnnouncements.items.filter(
    ({ id }) => id !== CINEMA_SCREENING_REMINDER_ID,
  );
}

function upsertAnnouncement(game, date) {
  const text = cinemaScreeningAlertText(game, date);
  if (text === null) {
    removeAnnouncement(game);
    return;
  }
  const item = {
    id: CINEMA_SCREENING_REMINDER_ID,
    tone: "info",
    text,
  };
  const index = game.dailyAnnouncements.items.findIndex(({ id }) => id === item.id);
  if (index === -1) game.dailyAnnouncements.items.push(item);
  else game.dailyAnnouncements.items[index] = item;
}

export function createCinemaState() {
  return { screeningReminders: [] };
}

export function validateCinemaStateSave(
  data,
  { path = "save.featureState.cinema", gameTime, seed } = {},
) {
  const state = saveRecord(data, path);
  const reminders = saveArray(
    requiredSaveField(state, "screeningReminders", path),
    `${path}.screeningReminders`,
  );
  const ids = new Set();
  reminders.forEach((reminderData, index) => {
    const reminderPath = `${path}.screeningReminders[${index}]`;
    const reminder = saveRecord(reminderData, reminderPath);
    const screeningId = saveString(
      requiredSaveField(reminder, "screeningId", reminderPath),
      `${reminderPath}.screeningId`,
      { nonEmpty: true },
    );
    if (ids.has(screeningId)) {
      failSave(`${reminderPath}.screeningId`, `duplicates screening '${screeningId}'`);
    }
    ids.add(screeningId);
    const startsAt = saveDateMilliseconds(
      requiredSaveField(reminder, "startsAt", reminderPath),
      `${reminderPath}.startsAt`,
    );
    if (startsAt <= gameTime) {
      failSave(`${reminderPath}.startsAt`, "must be after the game clock");
    }
    const screening = findCinemaScreening(seed, screeningId, new Date(startsAt));
    if (!screening || screening.startsAt.getTime() !== startsAt) {
      failSave(`${reminderPath}.screeningId`, "does not match the scheduled screening");
    }
    const notified = saveBoolean(
      requiredSaveField(reminder, "notified", reminderPath),
      `${reminderPath}.notified`,
    );
    const notificationDue =
      gameTime >= startsAt - CINEMA_REMINDER_LEAD_MINUTES * MINUTE_MS;
    if (notified !== notificationDue) {
      failSave(`${reminderPath}.notified`, "does not match the reminder time");
    }
  });
  return state;
}

export function hasCinemaScreeningReminder(game, screeningId) {
  return cinemaState(game).screeningReminders.some(
    (reminder) => reminder.screeningId === String(screeningId),
  );
}

export function addCinemaScreeningReminder(game, screening) {
  const state = cinemaState(game);
  if (hasCinemaScreeningReminder(game, screening.id)) return false;
  const startsAt = screening.startsAt.toISOString();
  const notified =
    game.now.getTime() >= screening.startsAt.getTime() -
      CINEMA_REMINDER_LEAD_MINUTES * MINUTE_MS;
  state.screeningReminders.push({
    screeningId: screening.id,
    startsAt,
    notified,
  });
  state.screeningReminders.sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt) ||
    left.screeningId.localeCompare(right.screeningId));
  if (notified) upsertAnnouncement(game, game.now);
  return true;
}

export function updateCinemaScreeningReminders(game, { to }) {
  const state = cinemaState(game);
  const nowMs = to.getTime();
  let newlyDue = false;
  state.screeningReminders = state.screeningReminders.filter((reminder) => {
    const startsMs = Date.parse(reminder.startsAt);
    if (startsMs <= nowMs) return false;
    if (
      !reminder.notified &&
      nowMs >= startsMs - CINEMA_REMINDER_LEAD_MINUTES * MINUTE_MS
    ) {
      reminder.notified = true;
      newlyDue = true;
    }
    return true;
  });

  const existingAnnouncement = game.dailyAnnouncements.items.some(
    ({ id }) => id === CINEMA_SCREENING_REMINDER_ID,
  );
  if (newlyDue || existingAnnouncement) upsertAnnouncement(game, to);
}

export const CINEMA_AUTOMATIC_REMINDERS = Object.freeze([
  Object.freeze({
    id: CINEMA_SCREENING_REMINDER_ID,
    group: "today",
    priority: 50,
    tone: "info",
    text: cinemaScreeningReminderText,
  }),
]);
