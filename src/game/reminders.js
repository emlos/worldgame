import { WG_BUNDLE } from "../story/wg/generated/scenes.js";
import { getSchoolDayPlan } from "../characters/player/schedule.js";

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

/** Built-in reminders are declared and activated by their authoritative systems. */
export const AUTOMATIC_REMINDERS = Object.freeze([
  Object.freeze({
    id: "system:school-day",
    group: "today",
    priority: 100,
    tone: "info",
    text(game, date) {
      const schoolDay = getSchoolDayPlan(game, { date });
      if (!schoolDay.hasSchool) return null;
      return "[warning]Today is a school day. Classes start at " +
        `${schoolDay.school.start}.[/warning]`;
    },
  }),
]);

export function isKnownReminderItem(id) {
  return typeof id === "string" && (
    AUTOMATIC_REMINDERS.some((definition) => definition.id === id) ||
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
  for (const definition of AUTOMATIC_REMINDERS) {
    const text = definition.text(game, date);
    if (text === null) continue;
    items.push({ id: definition.id, text, tone: definition.tone, priority: definition.priority, group: definition.group });
  }
  return items.sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
