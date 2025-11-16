import { clamp } from "../../../shared/modules.js";
import { MS_PER_DAY } from "../module.js";

/**
 * Calendar: builds & holds holiday/special info for a given year.
 */
export class Calendar {
  constructor({ year, rnd }) {
    this.rnd = rnd || Math.random;
    this.map = new Map();
    this.randomHolidayAssignments = new Map();

    // one-time, per-calendar-instance random placements
    this._initRandomHolidays();

    this.setYear(year);
  }

  /** Pick stable random dates for RANDOM_HOLIDAYS (per Calendar instance). */
  _initRandomHolidays() {
    const used = new Set(); // avoid duplicates among random holidays themselves

    for (const def of RANDOM_HOLIDAYS) {
      let month, day, key;
      do {
        ({ month, day } = randomMonthDay(this.rnd));
        key = `${month}-${day}`;
      } while (used.has(key));
      used.add(key);
      this.randomHolidayAssignments.set(def.name, { month, day });
    }
  }

  /** Explicitly set the calendar year and rebuild if it changed. */
  setYear(year) {
    if (this.year === year) return;
    this.year = year;
    this._buildYear();
  }

  /** Internal builder for the current year. */
  _buildYear() {
    const year = this.year;
    this.map.clear();

    const add = (m, d, holidayDef) => {
      const { name, category, special = false, dayOff = false } = holidayDef;
      const key = ymd(year, m, d);

      if (!this.map.has(key)) {
        this.map.set(key, { holidays: [], specials: [], dayOff: false });
      }

      const v = this.map.get(key);
      const entry = { name, category };

      if (special) {
        v.specials.push(entry);
      } else {
        v.holidays.push(entry);
      }

      if (dayOff) v.dayOff = true;
    };

    // From registry
    for (const def of HOLIDAY_REGISTRY) {
      const dates = def.resolveDates(year);
      for (const { month, day } of dates) {
        add(month, day, def);
      }
    }

    // Randoms: use stable assignments
    for (const def of RANDOM_HOLIDAYS) {
      const assigned = this.randomHolidayAssignments.get(def.name);
      if (!assigned) continue;
      add(assigned.month, assigned.day, def);
    }
  }

  /**
   * Get info for a specific Date.
   */
  getDayInfo(date) {
    const y = date.getFullYear();
    const key = ymd(y, date.getMonth() + 1, date.getDate());
    const info = this.map.get(key) || {
      holidays: [],
      specials: [],
      dayOff: false,
    };

    const dow = date.getDay(); // 0=Sunday
    const isWeekend = dow === 0 || dow === 6;
    const dayOff = info.dayOff || isWeekend;

    return {
      ...info,
      isWeekend,
      dayOff,
      kind: dayOff ? DayKind.DAY_OFF : DayKind.WORKDAY,
    };
  }

  daysUntil(name, fromDate) {
    const target = name.toLowerCase();
    const fromYear = fromDate.getFullYear();

    if (fromYear !== this.year) {
      return undefined;
    }

    const fromMidnight = new Date(fromYear, fromDate.getMonth(), fromDate.getDate());

    let best = Infinity;

    for (const [key, info] of this.map.entries()) {
      const allNames = [...info.holidays, ...info.specials].map((h) => (typeof h === "string" ? h : h.name));

      const matches = allNames.some((n) => n.toLowerCase() === target);
      if (!matches) continue;

      const [yStr, mStr, dStr] = key.split("-");
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10) - 1;
      const d = parseInt(dStr, 10);

      if (y !== fromYear) continue;

      const targetDate = new Date(y, m, d);
      const diffDays = Math.round((targetDate - fromMidnight) / MS_PER_DAY);

      if (diffDays >= 0 && diffDays < best) best = diffDays;
    }

    return Number.isFinite(best) ? best : undefined;
  }
}

export const DayKind = { WORKDAY: "workday", DAY_OFF: "day off" };

export const HolidayCategory = {
  RELIGIOUS: "religious",
  CIVIC: "civic",
  COMMUNITY: "community",
};

/** Gregorian leap year check */
const isLeap = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

/** Compute Gregorian Easter for a given year (Anonymous Gregorian algorithm). */
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Format YYYY-MM-DD string helper. */
export const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Random YYYY-MM-DD string helper for a given year & RNG. */
function randomYmd(year, rnd) {
  const monthDays = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const month = Math.floor(rnd() * 12) + 1; // 1–12
  const day = Math.floor(rnd() * monthDays[month - 1]) + 1; // 1–days in month

  return ymd(year, month, day);
}

/** Helper: pick a random (month, day) pair, independent of target year. */
function randomMonthDay(rnd) {
  const dateStr = randomYmd(2000, rnd); // year here doesn’t matter
  const [, mStr, dStr] = dateStr.split("-");
  return { month: Number(mStr), day: Number(dStr) };
}

/**
 * Static, non-random holidays & observances.
 * Each entry describes how to get its date(s) for a given year.
 */
const HOLIDAY_REGISTRY = [
  {
    name: "New Year's Day",
    category: HolidayCategory.CIVIC,
    dayOff: true,
    special: false,
    resolveDates: (year) => [{ month: 1, day: 1 }],
  },
  {
    name: "Groundhog Day",
    category: HolidayCategory.COMMUNITY,
    dayOff: false,
    special: true,
    resolveDates: (year) => [{ month: 2, day: 2 }],
  },
  {
    name: "Valentine's Day",
    category: HolidayCategory.COMMUNITY,
    dayOff: false,
    special: true,
    resolveDates: (year) => [{ month: 2, day: 14 }],
  },
  {
    name: "St. Patrick's Day",
    category: HolidayCategory.RELIGIOUS,
    dayOff: false,
    special: true,
    resolveDates: (year) => [{ month: 3, day: 17 }],
  },
  {
    name: "April Fools' Day",
    category: HolidayCategory.COMMUNITY,
    dayOff: false,
    special: true,
    resolveDates: (year) => [{ month: 4, day: 1 }],
  },
  {
    name: "Midsummer",
    category: HolidayCategory.COMMUNITY,
    dayOff: false,
    special: true,
    resolveDates: (year) => [{ month: 6, day: 24 }],
  },
  {
    name: "Halloween",
    category: HolidayCategory.COMMUNITY,
    dayOff: false,
    special: true,
    resolveDates: (year) => [{ month: 10, day: 31 }],
  },
  {
    name: "Remembrance Day",
    category: HolidayCategory.CIVIC,
    dayOff: false,
    special: true,
    resolveDates: (year) => [{ month: 11, day: 11 }],
  },
  {
    name: "Festivus",
    category: HolidayCategory.COMMUNITY,
    dayOff: false,
    special: true,
    resolveDates: (year) => [{ month: 12, day: 23 }],
  },
  {
    name: "Christmas Eve",
    category: HolidayCategory.RELIGIOUS,
    dayOff: true,
    special: false,
    resolveDates: (year) => [{ month: 12, day: 24 }],
  },
  {
    name: "Christmas Day",
    category: HolidayCategory.RELIGIOUS,
    dayOff: true,
    special: false,
    resolveDates: (year) => [{ month: 12, day: 25 }],
  },
  {
    name: "Easter",
    category: HolidayCategory.RELIGIOUS,
    dayOff: true,
    special: false,
    resolveDates: (year) => [easterDate(year)],
  },
  {
    name: "May Day",
    category: HolidayCategory.CIVIC,
    dayOff: true,
    special: false,
    resolveDates: (year) => [{ month: 5, day: 1 }],
  },
  {
    // Eid ~ late spring/summer, drifts by year (your original approximation)
    name: "Eid (observance)",
    category: HolidayCategory.RELIGIOUS,
    dayOff: false,
    special: true,
    resolveDates: (year) => {
      const eidDay = 20 + (year % 10);
      return [{ month: 7, day: clamp(eidDay, 1, 30) }];
    },
  },
  {
    name: "Yom Kippur (observance)",
    category: HolidayCategory.RELIGIOUS,
    dayOff: false,
    special: true,
    resolveDates: (year) => {
      const ykDay = 10 + ((year * 3) % 10);
      return [{ month: 9, day: clamp(ykDay, 1, 30) }];
    },
  },
  {
    // Pride: whole June as special
    name: "Pride Month",
    category: HolidayCategory.COMMUNITY,
    dayOff: false,
    special: true,
    resolveDates: (year) => Array.from({ length: 30 }, (_, i) => ({ month: 6, day: i + 1 })),
  },
];

const RANDOM_HOLIDAYS = [
  // community specials
  {
    name: "Outer Space Day",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  { name: "Dog Day", category: HolidayCategory.COMMUNITY, special: true, dayOff: false },
  { name: "Cat Day", category: HolidayCategory.COMMUNITY, special: true, dayOff: false },
  {
    name: "Day of a Thousand Kites",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "Community Day",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "Lanternfall Night",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "International Pizza Day",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "Rivershine Regatta",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "Night of Broken Clocks",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "Mist Parade",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  { name: "Mender's Fair", category: HolidayCategory.COMMUNITY, special: true, dayOff: false },
  {
    name: "Festival of Unsold Things",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "Ember Eve",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "Day of Small Miracles",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "Make a friend Day",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },
  {
    name: "Day Of The Werewolf",
    category: HolidayCategory.COMMUNITY,
    special: true,
    dayOff: false,
  },

  // fictional day-off holidays (treat them as civic “national” days)
  {
    name: "Founders' Day",
    category: HolidayCategory.CIVIC,
    special: false,
    dayOff: true,
  },
  {
    name: "Independence Day",
    category: HolidayCategory.CIVIC,
    special: false,
    dayOff: true,
  },
  {
    name: "Unity Day",
    category: HolidayCategory.CIVIC,
    special: false,
    dayOff: true,
  },
  {
    name: "Memorial of Heroes",
    category: HolidayCategory.CIVIC,
    special: false,
    dayOff: true,
  },
  {
    name: "Rejuvenation Day",
    category: HolidayCategory.CIVIC,
    special: false,
    dayOff: true,
  },
  {
    name: "Day of Quiet Doors",
    category: HolidayCategory.CIVIC,
    special: false,
    dayOff: true,
  },
];
