import { getSchoolDayPlan } from "./timetable.js";

export const SCHOOL_AUTOMATIC_REMINDERS = Object.freeze([
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
