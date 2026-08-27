import { clamp, finiteNumber } from "../../shared/util/util.js";

export const SUBJECT_GRADE_MIN = 0;
export const SUBJECT_GRADE_MAX = 100;
export const SUBJECT_GRADE_INITIAL = 50;

export const SCHOOL_SUBJECTS = Object.freeze({
  english: Object.freeze({ label: "English" }),
  math: Object.freeze({ label: "Mathematics" }),
  history: Object.freeze({ label: "History" }),
  science: Object.freeze({ label: "Science" }),
  art: Object.freeze({ label: "Art" }),
  physical_education: Object.freeze({ label: "Physical Education" }),
});

export function initialPlayerEducation() {
  return {
    subjects: Object.fromEntries(
      Object.keys(SCHOOL_SUBJECTS).map((id) => [
        id,
        { grade: SUBJECT_GRADE_INITIAL, attendedSegments: 0 },
      ]),
    ),
  };
}

export function normalizeSubjectGrade(value, label = "Subject grade") {
  return clamp(
    finiteNumber(value, label),
    SUBJECT_GRADE_MIN,
    SUBJECT_GRADE_MAX,
  );
}

export function requireSchoolSubject(id) {
  const key = String(id);
  const definition = SCHOOL_SUBJECTS[key];
  if (!definition) throw new Error(`Unknown school subject '${key}'`);
  return { id: key, definition };
}
