import { clamp, finiteNumber } from "../../shared/util/util.js";

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

export function createSchoolState() {
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

function schoolState(game) {
  const state = game?.featureState?.school;
  if (!state) throw new Error("The school feature is not enabled for this game");
  return state;
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

export function getSubjectRecord(game, subjectId) {
  const { id } = requireSchoolSubject(subjectId);
  const record = schoolState(game).subjects[id];
  return {
    achievement: record.achievement,
    ...subjectGradeAndProgress(record.achievement),
    attendedSegments: record.attendedSegments,
  };
}

export function getSubjectAchievement(game, subjectId) {
  return getSubjectRecord(game, subjectId).achievement;
}

export function getSubjectGrade(game, subjectId) {
  return getSubjectRecord(game, subjectId).grade;
}

export function getSubjectProgress(game, subjectId) {
  return getSubjectRecord(game, subjectId).progress;
}

export function setSubjectGrade(game, subjectId, grade) {
  const { id } = requireSchoolSubject(subjectId);
  const record = schoolState(game).subjects[id];
  const normalizedGrade = normalizeSubjectGrade(
    grade,
    `Player subject '${id}' grade`,
  );
  const { progress } = subjectGradeAndProgress(record.achievement);
  record.achievement =
    subjectGradeIndex(normalizedGrade) * SUBJECT_GRADE_RANGE + progress;
  return normalizedGrade;
}

export function setSubjectProgress(game, subjectId, progress) {
  const { id } = requireSchoolSubject(subjectId);
  const record = schoolState(game).subjects[id];
  const normalizedProgress = normalizeSubjectProgress(
    progress,
    `Player subject '${id}' progress`,
  );
  const { grade } = subjectGradeAndProgress(record.achievement);
  record.achievement =
    subjectGradeIndex(grade) * SUBJECT_GRADE_RANGE + normalizedProgress;
  return normalizedProgress;
}

export function adjustSubjectAchievement(game, subjectId, delta) {
  const { id } = requireSchoolSubject(subjectId);
  const amount = finiteNumber(delta, `Player subject '${id}' achievement adjustment`);
  if (!Number.isInteger(amount)) {
    throw new RangeError("Subject achievement adjustments must be whole numbers");
  }

  const record = schoolState(game).subjects[id];
  const before = getSubjectRecord(game, id);
  record.achievement = clamp(
    record.achievement + amount,
    SUBJECT_ACHIEVEMENT_MIN,
    SUBJECT_ACHIEVEMENT_MAX,
  );
  const after = getSubjectRecord(game, id);
  return {
    before: {
      achievement: before.achievement,
      grade: before.grade,
      progress: before.progress,
    },
    after: {
      achievement: after.achievement,
      grade: after.grade,
      progress: after.progress,
    },
    appliedDelta: after.achievement - before.achievement,
    gradeDelta: subjectGradeIndex(after.grade) - subjectGradeIndex(before.grade),
  };
}

export function recordSubjectAttendance(game, subjectId, segments = 1) {
  const { id } = requireSchoolSubject(subjectId);
  const amount = finiteNumber(segments, `Player subject '${id}' attendance`);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError("Attendance segments must be a positive integer");
  }
  const record = schoolState(game).subjects[id];
  record.attendedSegments += amount;
  return record.attendedSegments;
}
