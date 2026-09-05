import { WG_BUNDLE } from "../story/wg/generated/scenes.js";
import { DEFAULT_FEATURE_CATALOG } from "../features/index.js";
import {
  failSave,
  requiredSaveField,
  saveUniqueStrings,
} from "../shared/util/saveValidation.js";

// Authored content is immutable; only its active IDs belong in a save.
const definitions = Object.freeze(Object.fromEntries(
  Object.entries(WG_BUNDLE.reminders).map(([id, definition]) => [
    id, Object.freeze({ tone: "info", priority: 0, ...definition }),
  ]),
));

export function getAuthoredReminder(id) {
  return typeof id === "string" && Object.hasOwn(definitions, id) ? definitions[id] : null;
}

export function authoredReminderId(id) {
  return `authored:${id}`;
}

export function validateRemindersSave(
  save,
  { path = "save", features = DEFAULT_FEATURE_CATALOG } = {},
) {
  const remindersPath = `${path}.reminders`;
  const reminders = saveUniqueStrings(
    requiredSaveField(save, "reminders", path),
    remindersPath,
    { nonEmpty: true },
  );
  for (const id of reminders) {
    if (!getAuthoredReminder(id)) {
      failSave(remindersPath, `unknown authored reminder '${id}'`);
    }
  }
  return reminders;
}

/** Activate authored content once; automatic reminders cannot be manually added. */
export function addReminder(game, id) {
  if (!getAuthoredReminder(id)) {
    throw new Error(`Unknown authored reminder '${String(id)}'`);
  }
  game.reminders.add(id);
}

/** Also remove pending text if a story effect resolves this reminder. */
export function clearReminder(game, id) {
  if (!getAuthoredReminder(id)) {
    throw new Error(`Unknown authored reminder '${String(id)}'`);
  }
  game.reminders.delete(id);
  const itemId = authoredReminderId(id);
  game.dailyAnnouncements.items = game.dailyAnnouncements.items.filter(
    (item) => item.id !== itemId,
  );
}

export function isKnownReminderItem(id, features = DEFAULT_FEATURE_CATALOG) {
  return typeof id === "string" && (
    features.automaticReminders.some((definition) => definition.id === id) ||
    (id.startsWith("authored:") && getAuthoredReminder(id.slice("authored:".length)) !== null)
  );
}

/** Pure, current reminder view shared by the phone and midnight announcements. */
export function collectReminders(game, date = game.now) {
  const items = [];
  for (const id of game.reminders) {
    const definition = getAuthoredReminder(id);
    if (!definition) throw new Error(`Unknown reminder '${String(id)}'`);
    items.push({
      id: authoredReminderId(id),
      text: definition.text,
      tone: definition.tone,
      priority: definition.priority,
      group: "todo",
    });
  }
  for (const definition of game.features.automaticReminders) {
    const text = definition.text(game, date);
    if (text === null) continue;
    items.push({ id: definition.id, text, tone: definition.tone, priority: definition.priority, group: definition.group });
  }
  return items.sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
