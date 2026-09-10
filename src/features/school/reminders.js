import { getSchoolDayPlan } from "./timetable.js";

export const SCHOOL_DAY_REMINDER_ID = "system:school-day";

export function schoolDayReminderText(game, date = game?.now) {
  const schoolDay = getSchoolDayPlan(game, { date });
  if (schoolDay.hasSchool) {
    return "[warning]Today is a school day. Classes start at " +
      `${schoolDay.school.start}.[/warning]`;
  }

  const tomorrow = new Date(schoolDay.date);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowSchoolDay = getSchoolDayPlan(game, { date: tomorrow });
  if (schoolDay.school.semester || !tomorrowSchoolDay.hasSchool) return null;

  return "[info]School starts tomorrow. Classes begin at " +
    `${tomorrowSchoolDay.school.start}.[/info]`;
}

export const SCHOOL_AUTOMATIC_REMINDERS = Object.freeze([
  Object.freeze({
    id: SCHOOL_DAY_REMINDER_ID,
    group: "today",
    priority: 100,
    tone: "info",
    text(game, date) {
      return schoolDayReminderText(game, date);
    },
  }),
]);
