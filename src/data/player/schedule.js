import { SCHOOL_SUBJECTS } from "./education.js";
import { DayKind } from "../world/calendar.js";
import { PLACE_REGISTRY } from "../world/place.js";
import { parseTimeToMinutes } from "../../shared/util/date.js";

export const SCHEDULE = {
  school: true,
};

export const SCHOOL_PHASE = Object.freeze({
  closed: "closed",
  noSchool: "no_school",
  beforeSchool: "before_school",
  class: "class",
  break: "break",
  lunch: "lunch",
  afterSchool: "after_school",
});

const MS_PER_MINUTE = 60_000;

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
  const definition = PLACE_REGISTRY.find(
    (place) => place.key === "high_school" && place.unlocked === true,
  );
  return definition
    ? { name: definition.label, props: definition.props }
    : null;
}

function schoolFromWorld(game) {
  for (const location of game?.world?.locations?.values?.() || []) {
    const school = (location.places || []).find(
      (place) => place.key === "high_school" && place.unlocked === true,
    );
    if (school) return { school, location };
  }
  return { school: defaultHighSchool(), location: null };
}

function schoolPeriods(school) {
  const timetable = school?.props?.timetable;
  if (!Array.isArray(timetable)) return [];

  return timetable
    .filter(
      (period) =>
        period &&
        typeof period.id === "string" &&
        validTime(period.start) &&
        validTime(period.end),
    )
    .map((period) => {
      const kind = period.kind === "lunch" ? "lunch" : "class";
      const subject = period.subjectId == null
        ? null
        : SCHOOL_SUBJECTS[String(period.subjectId)] || null;
      return {
        id: String(period.id),
        kind,
        subjectId: subject ? String(period.subjectId) : null,
        label: subject?.label || labelFromKey(period.id),
        start: period.start,
        end: period.end,
        segments:
          kind === "class" && Number.isInteger(period.segments) && period.segments > 0
            ? period.segments
            : null,
      };
    })
    .sort(
      (left, right) =>
        left.start.localeCompare(right.start) ||
        left.end.localeCompare(right.end) ||
        left.id.localeCompare(right.id),
    );
}

function dateAtUtcMinute(date, minute) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ) + minute * MS_PER_MINUTE,
  );
}

function isoOrNull(value) {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : null;
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
  const resolvedSchool = schoolFromWorld(game);
  const school = resolvedSchool.school;
  const periods = schoolPeriods(school);
  const semester = currentSemester(school, schoolDate);

  let noSchoolReason = null;
  if (!schoolEnabled) noSchoolReason = "school_disabled";
  else if (dayInfo.kind === DayKind.DAY_OFF) noSchoolReason = "day_off";
  else if (semester.configured && !semester.current) noSchoolReason = "out_of_term";
  else if (!periods.some((period) => period.kind === "class")) {
    noSchoolReason = "timetable_unavailable";
  }

  const classPeriods = periods.filter((period) => period.kind === "class");

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
      placeId: school?.id == null ? null : String(school.id),
      locationId:
        resolvedSchool.location?.id == null
          ? null
          : String(resolvedSchool.location.id),
      name: school?.name || "High School",
      districtName: resolvedSchool.location?.name || "Unknown district",
      semester: semester.current,
      start: classPeriods[0]?.start || null,
      end: classPeriods.at(-1)?.end || null,
      periods,
    },
  };
}

/** Derive the semantic school phase used by authored school scenes. */
export function getSchoolDayState(
  game,
  { date = game?.now, schoolEnabled = SCHEDULE.school } = {},
) {
  const at = asValidDate(date);
  const plan = getSchoolDayPlan(game, { date: at, schoolEnabled });
  const resolved = schoolFromWorld(game);
  const school = resolved.school;
  const periods = plan.school.periods.map((period) => ({
    ...period,
    startMinute: parseTimeToMinutes(period.start),
    endMinute: parseTimeToMinutes(period.end),
  }));
  const classPeriods = periods.filter((period) => period.kind === "class");
  const minute = at.getUTCHours() * 60 + at.getUTCMinutes();
  const atSchool =
    String(game?.currentLocationId) === String(plan.school.locationId) &&
    String(game?.currentPlaceId) === String(plan.school.placeId);
  const isOpen = typeof school?.isOpen === "function" ? school.isOpen(at) : true;
  const closesAt = typeof school?.getClosingTime === "function"
    ? school.getClosingTime(at)
    : null;

  let phase = SCHOOL_PHASE.closed;
  let period = null;
  let segment = null;
  let nextBoundary = null;

  if (isOpen) {
    if (!plan.hasSchool) {
      phase = SCHOOL_PHASE.noSchool;
      nextBoundary = closesAt;
    } else {
      period = periods.find(
        (candidate) => minute >= candidate.startMinute && minute < candidate.endMinute,
      ) || null;
      const firstClass = classPeriods[0];
      const lastClass = classPeriods.at(-1);

      if (period?.kind === "class") {
        phase = SCHOOL_PHASE.class;
        const duration = period.endMinute - period.startMinute;
        const segmentCount = period.segments || 1;
        const segmentMinutes = duration / segmentCount;
        segment = Math.min(
          segmentCount,
          Math.floor((minute - period.startMinute) / segmentMinutes) + 1,
        );
        nextBoundary = dateAtUtcMinute(
          at,
          period.startMinute + segment * segmentMinutes,
        );
      } else if (period?.kind === "lunch") {
        phase = SCHOOL_PHASE.lunch;
        const nextClass = classPeriods.find((candidate) => candidate.startMinute > minute);
        nextBoundary = nextClass
          ? dateAtUtcMinute(at, nextClass.startMinute)
          : closesAt;
      } else if (firstClass && minute < firstClass.startMinute) {
        phase = SCHOOL_PHASE.beforeSchool;
        nextBoundary = dateAtUtcMinute(at, firstClass.startMinute);
      } else if (lastClass && minute >= lastClass.endMinute) {
        phase = SCHOOL_PHASE.afterSchool;
        nextBoundary = closesAt;
      } else {
        phase = SCHOOL_PHASE.break;
        const nextClass = classPeriods.find((candidate) => candidate.startMinute > minute);
        nextBoundary = nextClass
          ? dateAtUtcMinute(at, nextClass.startMinute)
          : closesAt;
      }
    }
  }

  const minutesUntilNextBoundary = nextBoundary
    ? (nextBoundary.getTime() - at.getTime()) / MS_PER_MINUTE
    : null;
  const periodStartsAt = period
    ? dateAtUtcMinute(at, period.startMinute)
    : null;
  const periodEndsAt = period
    ? dateAtUtcMinute(at, period.endMinute)
    : null;
  const minutesIntoPeriod = periodStartsAt
    ? (at.getTime() - periodStartsAt.getTime()) / MS_PER_MINUTE
    : null;
  const nextClassPeriod = plan.hasSchool
    ? classPeriods.find((candidate) => candidate.startMinute > minute) || null
    : null;
  const nextClassStartsAt = nextClassPeriod
    ? dateAtUtcMinute(at, nextClassPeriod.startMinute)
    : null;
  const nextClassEndsAt = nextClassPeriod
    ? dateAtUtcMinute(at, nextClassPeriod.endMinute)
    : null;
  const minutesUntilNextClass = nextClassStartsAt
    ? (nextClassStartsAt.getTime() - at.getTime()) / MS_PER_MINUTE
    : null;

  return {
    isSchoolDay: plan.hasSchool,
    noSchoolReason: plan.noSchoolReason,
    atSchool,
    phase,
    periodId: period?.id ?? null,
    periodLabel: period?.label ?? null,
    subjectId: period?.subjectId ?? null,
    currentClass:
      phase === SCHOOL_PHASE.class ? period?.subjectId ?? null : null,
    nextClass: nextClassPeriod?.subjectId ?? null,
    nextClassPeriodId: nextClassPeriod?.id ?? null,
    nextClassLabel: nextClassPeriod?.label ?? null,
    nextClassStartsAt: isoOrNull(nextClassStartsAt),
    nextClassEndsAt: isoOrNull(nextClassEndsAt),
    minutesUntilNextClass,
    segment,
    segmentCount: period?.segments ?? null,
    periodStartsAt: isoOrNull(periodStartsAt),
    periodEndsAt: isoOrNull(periodEndsAt),
    minutesIntoPeriod,
    nextBoundaryAt: isoOrNull(nextBoundary),
    minutesUntilNextBoundary,
    closesAt: isoOrNull(closesAt),
    school: plan.school,
  };
}

const defaultPeriods = schoolPeriods(defaultHighSchool()).filter(
  (period) => period.kind === "class",
);

export const SCHOOL_DAY_START = defaultPeriods[0]?.start ?? null;
export const SCHOOL_DAY_END = defaultPeriods.at(-1)?.end ?? null;

// Future obligations such as work and appointments can join this module once
// the player schedule becomes save-backed state.
