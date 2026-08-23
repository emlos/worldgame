import { ymd } from "../../../shared/util/date.js";
import { makeRNG } from "../../../shared/util/random.js";

import {
  DayKind,
  HOLIDAY_REGISTRY,
  RANDOM_HOLIDAYS,
  MONTH_DAYS,
} from "../../../data/world/calendar.js";
import { MS_PER_DAY } from "../../../data/world/time.js";



function asValidDate(value, label = "calendar date") {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`Invalid ${label}: ${String(value)}`);
  }
  return date;
}

function asValidYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError(`Invalid calendar year: ${String(value)}`);
  }
  return year;
}

function isLeap(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return MONTH_DAYS[month - 1] ?? 0;
}

function isValidMonthDay(month, day, { recurring = false } = {}) {
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12
  ) {
    return false;
  }
  const maxDay = recurring ? MONTH_DAYS[month - 1] : daysInMonth(2000, month);
  return day >= 1 && day <= maxDay;
}

function utcMidnightMs(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function cloneEntries(entries) {
  return entries.map((entry) => ({ ...entry }));
}

/**
 * Deterministic calendar with pure queries for any supported year.
 *
 * `year` records the world's committed calendar year. Queries do not mutate it;
 * their derived year maps are cached and can safely be discarded on save/load.
 */
export class Calendar {
  constructor({ year, rnd = null }) {
    this.rnd = rnd ?? makeRNG();
    this.randomHolidayAssignments = new Map();
    this._yearMaps = new Map();

    this._initRandomHolidays();
    this.setYear(year);
  }

  /** Pick stable, valid recurring dates for the world's fictional holidays. */
  _initRandomHolidays() {
    const used = new Set();

    for (const definition of RANDOM_HOLIDAYS) {
      let month;
      let day;
      let key;
      do {
        ({ month, day } = randomRecurringMonthDay(this.rnd));
        key = `${month}-${day}`;
      } while (used.has(key));

      used.add(key);
      this.randomHolidayAssignments.set(definition.name, { month, day });
    }
  }

  /** Set the world's committed year without invalidating query history. */
  setYear(value) {
    const year = asValidYear(value);
    this.year = year;
    this._mapForYear(year);
    return year;
  }

  /** Return holiday and day-off information for the supplied absolute date. */
  getDayInfo(value) {
    const date = asValidDate(value);
    const year = asValidYear(date.getUTCFullYear());
    const key = ymd(year, date.getUTCMonth() + 1, date.getUTCDate());
    const stored = this._mapForYear(year).get(key);
    const holidays = stored ? cloneEntries(stored.holidays) : [];
    const specials = stored ? cloneEntries(stored.specials) : [];
    const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const dayOff = !!stored?.dayOff || isWeekend;

    return {
      holidays,
      specials,
      dayOff,
      isWeekend,
      kind: dayOff ? DayKind.DAY_OFF : DayKind.WORKDAY,
    };
  }

  /** Return whole UTC days until the next occurrence, including the current date. */
  daysUntil(name, value) {
    const target = String(name ?? "")
      .trim()
      .toLowerCase();
    if (!target) return undefined;

    const fromDate = asValidDate(value, "calendar start date");
    const fromYear = asValidYear(fromDate.getUTCFullYear());
    const fromMidnight = utcMidnightMs(
      fromYear,
      fromDate.getUTCMonth() + 1,
      fromDate.getUTCDate(),
    );
    let best = Infinity;

    // Every registry and fictional holiday recurs annually, so the next
    // occurrence must be in the current or immediately following year.
    for (const year of [fromYear, fromYear + 1]) {
      if (year > 9999) continue;

      for (const [key, info] of this._mapForYear(year)) {
        const allEntries = [...info.holidays, ...info.specials];
        if (!allEntries.some((entry) => entry.name.toLowerCase() === target))
          continue;

        const [, monthText, dayText] = key.split("-");
        const candidate = utcMidnightMs(
          year,
          Number(monthText),
          Number(dayText),
        );
        const difference = Math.round((candidate - fromMidnight) / MS_PER_DAY);
        if (difference >= 0 && difference < best) best = difference;
      }
    }

    return Number.isFinite(best) ? best : undefined;
  }

  _mapForYear(value) {
    const year = asValidYear(value);
    let map = this._yearMaps.get(year);
    if (!map) {
      map = this._buildYear(year);
      this._yearMaps.set(year, map);
    }
    return map;
  }

  _buildYear(year) {
    const map = new Map();
    const add = (month, day, definition) => {
      if (day < 1 || day > daysInMonth(year, month)) {
        throw new RangeError(
          `Holiday '${definition.name}' resolved to invalid date ${ymd(year, month, day)}`,
        );
      }

      const key = ymd(year, month, day);
      let info = map.get(key);
      if (!info) {
        info = { holidays: [], specials: [], dayOff: false };
        map.set(key, info);
      }

      const entry = { name: definition.name, category: definition.category };
      (definition.special ? info.specials : info.holidays).push(entry);
      if (definition.dayOff) info.dayOff = true;
    };

    for (const definition of HOLIDAY_REGISTRY) {
      for (const { month, day } of definition.resolveDates(year)) {
        add(Number(month), Number(day), definition);
      }
    }

    for (const definition of RANDOM_HOLIDAYS) {
      const assigned = this.randomHolidayAssignments.get(definition.name);
      if (assigned) add(assigned.month, assigned.day, definition);
    }

    return map;
  }

  toJSON() {
    return {
      year: this.year,
      randomHolidayAssignments: [
        ...this.randomHolidayAssignments.entries(),
      ].map(([name, value]) => [name, { ...value }]),
    };
  }

  static fromJSON(data, { rnd = null } = {}) {
    if (!data || typeof data !== "object") {
      throw new TypeError("Calendar.fromJSON expects a calendar save object");
    }
    if (!Array.isArray(data.randomHolidayAssignments)) {
      throw new TypeError(
        "Calendar save is missing random holiday assignments",
      );
    }

    const expectedNames = new Set(
      RANDOM_HOLIDAYS.map((definition) => definition.name),
    );
    const assignments = new Map();
    for (const entry of data.randomHolidayAssignments) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new TypeError("Invalid random holiday assignment");
      }

      const name = String(entry[0]);
      const month = Number(entry[1]?.month);
      const day = Number(entry[1]?.day);
      if (
        !expectedNames.has(name) ||
        assignments.has(name) ||
        !isValidMonthDay(month, day, { recurring: true })
      ) {
        throw new TypeError(`Invalid random holiday assignment for '${name}'`);
      }
      assignments.set(name, { month, day });
    }

    if (assignments.size !== expectedNames.size) {
      throw new TypeError(
        "Calendar save has incomplete random holiday assignments",
      );
    }

    const calendar = Object.create(Calendar.prototype);
    calendar.rnd = rnd ?? makeRNG();
    calendar.randomHolidayAssignments = assignments;
    calendar._yearMaps = new Map();
    calendar.setYear(data.year);
    return calendar;
  }
}

/** Pick a recurring month/day that exists in every Gregorian year. */
function randomRecurringMonthDay(rnd) {
  const month = Math.floor(rnd() * 12) + 1;
  const day = Math.floor(rnd() * MONTH_DAYS[month - 1]) + 1;
  return { month, day };
}
