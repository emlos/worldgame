import { SCENE_ACTION_TYPE } from "../../game/scene/actions.js";
import { createChoice } from "../../game/scene/choiceContract.js";
import { getSchoolWeekSchedule } from "./timetable.js";

const STATE_VERSION = 1;

function periodCell(period) { 
  return period ? `${period.label}` : "";
}

function timetableTable() {
  const schedule = getSchoolWeekSchedule();
  const maximumLessons = Math.max(
    ...schedule.map((day) =>
      day.periods.filter((period) => period.kind === "class").length,
    ),
  );
  const columns = [
    "Day",
    ...Array.from({ length: Math.min(3, maximumLessons) }, (_, index) =>
      `Lesson ${index + 1}`,
    ),
    "Lunch",
    ...Array.from({ length: Math.max(0, maximumLessons - 3) }, (_, index) =>
      `Lesson ${index + 4}`,
    ),
    "Last bell",
  ];

  return {
    type: "table",
    columns,
    rows: schedule.map((day) => {
      const classes = day.periods.filter((period) => period.kind === "class");
      return [
        day.label,
        ...Array.from({ length: Math.min(3, maximumLessons) }, (_, index) =>
          periodCell(classes[index]),
        ),
        "",
        ...Array.from({ length: Math.max(0, maximumLessons - 3) }, (_, index) =>
          periodCell(classes[index + 3]),
        ),
        day.end ?? "",
      ];
    }),
  };
}

export const SCHOOL_TIMETABLE_STORY_SYSTEM = Object.freeze({
  create() {
    return { version: STATE_VERSION };
  },

  validateState(state) {
    if (!state || state.version !== STATE_VERSION) {
      throw new Error("School timetable state has an invalid version");
    }
  },

  render({ definition, systemId }) {
    return {
      content: [
        {
          type: "paragraph",
          text: "A weekly timetable is pinned neatly to the student council noticeboard. Classes run for 45 minutes. Lunch is 11:45-12:30; ordinary breaks last 15 minutes.",
        },
        timetableTable(),
      ],
      sections: [
        {
          id: "choices",
          heading: definition.choiceHeading,
          choices: [
            createChoice({
              id: "timetable-finish",
              label: "Return",
              action: {
                type: SCENE_ACTION_TYPE.wgSystem,
                sceneId: definition.id,
                systemId,
                command: { type: "finish" },
              },
            }),
          ],
        },
      ],
    };
  },

  act({ definition, command }) {
    if (command?.type !== "finish") {
      throw new Error(`Unknown school timetable command '${String(command?.type)}'`);
    }
    return { target: definition.finalTarget };
  },
});
