import { getSubjectRecord, SCHOOL_SUBJECTS } from "./education.js";
import { getSchoolDayState } from "./timetable.js";

export function createSchoolWGContext(game) {
  const school = getSchoolDayState(game);
  school.education = Object.fromEntries(
    Object.keys(SCHOOL_SUBJECTS).map((id) => [id, getSubjectRecord(game, id)]),
  );
  const activeContinuation = game.storyContinuations.at(-1) || null;
  const behavior = game.currentStory?.behavior ?? activeContinuation?.behavior;
  if (behavior?.id === "school.class") {
    school.arrival = { ...behavior.state };
  }
  return school;
}
