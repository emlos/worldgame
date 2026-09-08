import { GOAL_TYPE, TARGET_TYPE } from "../../characters/npc/behavior.js";
import { PLACE_TAGS } from "../../world/data/place.js";
import { DayKind } from "../../world/data/calendar.js";
import { HIGH_SCHOOL_PLACE_KEY } from "./config.js";
import { getSchoolWeekSchedule } from "./timetable.js";

function taylorSchoolGoals() {
  return getSchoolWeekSchedule().flatMap((day) => [
    {
      id: `school_${day.dayKey}`,
      type: GOAL_TYPE.obligation,
      priority: 100,
      when: {
        schoolDay: true,
        daysOfWeek: [day.dayKey],
        from: day.start,
        to: day.end,
      },
      target: {
        type: TARGET_TYPE.placeKeys,
        candidates: [HIGH_SCHOOL_PLACE_KEY],
        nearest: true,
      },
    },
    {
      id: `after_school_activity_${day.dayKey}`,
      type: GOAL_TYPE.visit,
      priority: 30,
      weight: 70,
      when: {
        schoolDay: true,
        daysOfWeek: [day.dayKey],
        from: day.end,
        to: "22:00",
      },
      stayMinutes: { min: 20, max: 120 },
      targets: [
        {
          type: TARGET_TYPE.placeKeys,
          candidates: ["library", "mall"],
        },
        {
          type: TARGET_TYPE.placeCategory,
          candidates: [PLACE_TAGS.leisure],
        },
      ],
      disallowedTargets: [
        {
          type: TARGET_TYPE.placeCategory,
          candidates: [PLACE_TAGS.nightlife, PLACE_TAGS.luxury],
        },
      ],
      requireOpen: true,
    },
    {
      id: `go_home_after_school_${day.dayKey}`,
      type: GOAL_TYPE.home,
      priority: 30,
      weight: 30,
      when: {
        schoolDay: true,
        daysOfWeek: [day.dayKey],
        from: day.end,
        to: "22:00",
      },
    },
  ]);
}

export function addSchoolNPCDefinitions({ definition }) {
  let goals = [];
  if (definition?.id === "taylor") goals = taylorSchoolGoals();
  if (definition?.id === "caro") {
    goals = [{
      id: "caro_nurse_hours",
      type: GOAL_TYPE.obligation,
      priority: 100,
      when: {
        dayKinds: [DayKind.WORKDAY],
        from: "08:00",
        to: "16:00",
      },
      target: {
        type: TARGET_TYPE.placeKeys,
        candidates: [HIGH_SCHOOL_PLACE_KEY],
        nearest: true,
      },
    }];
  }
  if (!goals.length) return definition;
  return {
    ...definition,
    behavior: {
      ...definition.behavior,
      goals: [
        ...(definition.behavior?.goals ?? []),
        ...goals,
      ],
    },
  };
}
