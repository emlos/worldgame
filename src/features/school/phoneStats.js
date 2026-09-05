import { SCHOOL_SUBJECTS, SUBJECT_ACHIEVEMENT_MAX } from "./education.js";

export function buildSchoolPhoneStats(game) {
  return {
    id: "school-grades",
    label: "School grades",
    entries: Object.entries(SCHOOL_SUBJECTS).map(([id, definition]) => {
      const subject = game.player.getSubjectRecord(id);
      return {
        id,
        kind: "grade",
        label: `${definition.label} · ${subject.attendedSegments} segments attended`,
        value: subject.achievement,
        min: 0,
        max: SUBJECT_ACHIEVEMENT_MAX,
        valueLabel: subject.grade === "A"
          ? `A · mastery ${subject.progress}/99`
          : `${subject.grade} · ${subject.progress}/100`,
      };
    }),
  };
}
