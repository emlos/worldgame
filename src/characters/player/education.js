import { finiteNumber } from "../../shared/util/util.js";

export const SUBJECT_GRADES = Object.freeze(["D", "C", "B", "A"]);
export const SUBJECT_ACHIEVEMENT_MIN = 0;
export const SUBJECT_PROGRESS_MIN = 0;
export const SUBJECT_PROGRESS_MAX = 99;
export const SUBJECT_GRADE_RANGE = 100;
export const SUBJECT_ACHIEVEMENT_MAX =
  (SUBJECT_GRADES.length - 1) * SUBJECT_GRADE_RANGE +
  SUBJECT_PROGRESS_MAX;

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
        {
          achievement: SUBJECT_ACHIEVEMENT_MIN,
          attendedSegments: 0,
        },
      ]),
    ),
  };
}

export function normalizeSubjectGrade(value, label = "Subject grade") {
  const grade = String(value);
  if (!SUBJECT_GRADES.includes(grade)) {
    throw new RangeError(`${label} must be one of ${SUBJECT_GRADES.join(", ")}`);
  }
  return grade;
}

export function normalizeSubjectProgress(value, label = "Subject progress") {
  const progress = finiteNumber(value, label);
  if (
    !Number.isInteger(progress) ||
    progress < SUBJECT_PROGRESS_MIN ||
    progress > SUBJECT_PROGRESS_MAX
  ) {
    throw new RangeError(
      `${label} must be a whole number from ${SUBJECT_PROGRESS_MIN} through ${SUBJECT_PROGRESS_MAX}`,
    );
  }
  return progress;
}

export function normalizeSubjectAchievement(value, label = "Subject achievement") {
  const achievement = finiteNumber(value, label);
  if (
    !Number.isInteger(achievement) ||
    achievement < SUBJECT_ACHIEVEMENT_MIN ||
    achievement > SUBJECT_ACHIEVEMENT_MAX
  ) {
    throw new RangeError(
      `${label} must be a whole number from ${SUBJECT_ACHIEVEMENT_MIN} through ${SUBJECT_ACHIEVEMENT_MAX}`,
    );
  }
  return achievement;
}

export function subjectGradeIndex(grade) {
  return SUBJECT_GRADES.indexOf(normalizeSubjectGrade(grade));
}

export function subjectGradeAndProgress(achievement) {
  const points = normalizeSubjectAchievement(achievement);
  const gradeIndex = Math.floor(points / SUBJECT_GRADE_RANGE);
  return {
    grade: SUBJECT_GRADES[gradeIndex],
    progress: points % SUBJECT_GRADE_RANGE,
  };
}

export function requireSchoolSubject(id) {
  const key = String(id);
  const definition = SCHOOL_SUBJECTS[key];
  if (!definition) throw new Error(`Unknown school subject '${key}'`);
  return { id: key, definition };
}
