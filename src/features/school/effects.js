import { SCHOOL_TIMETABLE } from "./config.js";

const SCHOOL_DAY_ATTENDANCE_PREFIX = "school.attendance";
const FIRST_SCHOOL_DAY = "2026-09-01";

const CLASS_SEGMENTS = Object.freeze(Object.fromEntries(
  SCHOOL_TIMETABLE
    .filter((period) => period.kind === "class")
    .map((period) => [period.subjectId, period.segments]),
));

function attendanceFlag(subjectId, segment) {
  return `${SCHOOL_DAY_ATTENDANCE_PREFIX}.${subjectId}.${segment}`;
}

function attendedSegmentsToday(game, subjectId) {
  const required = CLASS_SEGMENTS[subjectId] || 0;
  let attended = 0;
  for (let segment = 1; segment <= required; segment += 1) {
    if (game.hasDailyFlag(attendanceFlag(subjectId, segment))) attended += 1;
  }
  return attended;
}

function recordSchoolDayAttendance(game, subjectId, amount) {
  const required = CLASS_SEGMENTS[subjectId];
  if (!required) return;

  const before = attendedSegmentsToday(game, subjectId);
  const after = Math.min(required, before + amount);
  for (let segment = before + 1; segment <= after; segment += 1) {
    game.setDailyFlag(attendanceFlag(subjectId, segment));
  }

  const completedEveryClass = Object.entries(CLASS_SEGMENTS)
    .every(([id, count]) => attendedSegmentsToday(game, id) >= count);
  if (!completedEveryClass) return;

  game.setFlag("journal.completed_school_day");
  if (game.now.toISOString().slice(0, 10) === FIRST_SCHOOL_DAY) {
    game.setFlag("journal.completed_school_first_day");
  }
}

export const SCHOOL_WG_EFFECT_HANDLERS = Object.freeze({
  grade(game, effect) {
    game.player.adjustSubjectAchievement(effect.id, effect.amount);
  },
  attendance(game, effect) {
    game.player.recordSubjectAttendance(effect.id, effect.amount);
    recordSchoolDayAttendance(game, effect.id, effect.amount);
  },
});
