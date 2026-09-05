import { SUBJECT_ACHIEVEMENT_MAX, SCHOOL_SUBJECTS } from "./education.js";

const gradeDefinitions = Object.freeze(
  Object.fromEntries(
    Object.entries(SCHOOL_SUBJECTS).map(([id, subject]) => [
      id,
      Object.freeze({
        label: `${subject.label} Grade`,
        min: 0,
        max: 10,
      }),
    ]),
  ),
);

export const SCHOOL_SKILL_CHECK_TARGETS = Object.freeze({
  grade: Object.freeze({
    definitions: gradeDefinitions,
    value(player, id) {
      return (player.getSubjectAchievement(id) / SUBJECT_ACHIEVEMENT_MAX) * 10;
    },
  }),
});
