import { DayKind } from "../world/calendar.js";
import { PLACE_REGISTRY } from "../world/place.js";

export const SCHEDULE = {
  school: true,
};

function asValidDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`Invalid school schedule date: ${String(value)}`);
  }
  return date;
}

function labelFromKey(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function validTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function monthDayNumber(value) {
  const match = /^(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const resolved = new Date(Date.UTC(2000, month - 1, day));
  if (resolved.getUTCMonth() !== month - 1 || resolved.getUTCDate() !== day) return null;
  return month * 100 + day;
}

function defaultHighSchool() {
  const definition = PLACE_REGISTRY.find((place) => place.key === "high_school");
  return definition
    ? { name: definition.label, props: definition.props }
    : null;
}

function schoolFromWorld(game) {
  for (const location of game?.world?.locations?.values?.() || []) {
    const school = (location.places || []).find((place) => place.key === "high_school");
    if (school) return school;
  }
  return defaultHighSchool();
}

function schoolPeriods(school) {
  const timetable = school?.props?.schedule;
  if (!timetable || typeof timetable !== "object") return [];

  return Object.entries(timetable)
    .filter(([, period]) => validTime(period?.start) && validTime(period?.end))
    .map(([id, period]) => ({
      id,
      label: labelFromKey(id),
      start: period.start,
      end: period.end,
    }))
    .sort(
      (left, right) =>
        left.start.localeCompare(right.start) ||
        left.end.localeCompare(right.end) ||
        left.id.localeCompare(right.id),
    );
}

function currentSemester(school, date) {
  const definitions = Array.isArray(school?.props?.semesters)
    ? school.props.semesters
    : [];
  const semesters = definitions
    .map((semester) => ({
      name: String(semester?.name || "Semester"),
      start: semester?.start,
      end: semester?.end,
      startNumber: monthDayNumber(semester?.start),
      endNumber: monthDayNumber(semester?.end),
    }))
    .filter(
      (semester) => semester.startNumber !== null && semester.endNumber !== null,
    );

  if (!semesters.length) return { configured: false, current: null };

  const today = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const current = semesters.find((semester) =>
    semester.startNumber <= semester.endNumber
      ? today >= semester.startNumber && today <= semester.endNumber
      : today >= semester.startNumber || today <= semester.endNumber,
  );

  return {
    configured: true,
    current: current
      ? { name: current.name, start: current.start, end: current.end }
      : null,
  };
}

/** Resolve the shared school timetable and whether a date is a school day. */
export function getSchoolDayPlan(
  game,
  { date = game?.now, schoolEnabled = SCHEDULE.school } = {},
) {
  if (!game?.world || typeof game.world.getDayInfo !== "function") {
    throw new TypeError("School schedule requires a game with calendar data");
  }

  const schoolDate = asValidDate(date);
  const dayInfo = game.world.getDayInfo(schoolDate);
  const school = schoolFromWorld(game);
  const periods = schoolPeriods(school);
  const semester = currentSemester(school, schoolDate);

  let noSchoolReason = null;
  if (!schoolEnabled) noSchoolReason = "school_disabled";
  else if (dayInfo.kind === DayKind.DAY_OFF) noSchoolReason = "day_off";
  else if (semester.configured && !semester.current) noSchoolReason = "out_of_term";
  else if (!periods.length) noSchoolReason = "timetable_unavailable";

  return {
    date: schoolDate.toISOString(),
    hasSchool: noSchoolReason === null,
    noSchoolReason,
    day: {
      kind: dayInfo.kind,
      isWeekend: dayInfo.isWeekend,
      holidays: [...dayInfo.holidays, ...dayInfo.specials].map((entry) => entry.name),
    },
    school: {
      name: school?.name || "High School",
      semester: semester.current,
      start: periods[0]?.start || null,
      end: periods.at(-1)?.end || null,
      periods,
    },
  };
}

const defaultPeriods = schoolPeriods(defaultHighSchool());

export const SCHOOL_DAY_START = defaultPeriods[0]?.start ?? null;
export const SCHOOL_DAY_END = defaultPeriods.at(-1)?.end ?? null;

// Future obligations such as work and appointments can join this module once
// the player schedule becomes save-backed state.
