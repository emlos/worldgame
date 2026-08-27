import { getSchoolDayPlan } from "../../../data/player/schedule.js";

/** Build persistent alerts that must appear in every kind of current scene. */
export function buildGlobalSceneAlerts(game) {
  const schoolDay = getSchoolDayPlan(game);
  if (!schoolDay.hasSchool) return [];

  return [
    {
      id: "school-day",
      tone: "warning",
      text: `Today is a school day. Classes start at ${schoolDay.school.start}.`,
    },
  ];
}
