import { clamp } from "../../shared/modules.js";

export const DayKind = { WORKDAY: "workday", DAY_OFF: "day off" };

export const HolidayCategory = {
  RELIGIOUS: "religious",
  CIVIC: "civic",
  COMMUNITY: "community",
};

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

/**
 * Static, non-random holidays & observances.
 * Each entry describes how to get its date(s) for a given year.
 */
export const HOLIDAY_REGISTRY = [
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

export const RANDOM_HOLIDAYS = [
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
