
// --------------------------
// Calendar & Holidays
// --------------------------

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

/** Add a YYYY-MM-DD string helper. */
export const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Build holiday/special calendar for a given year.
 * Ensures: each month has 1–2 real‑world special days; includes fictional day‑off holidays.
 */
export function buildYearCalendar(year, rnd) {
  const map = new Map(); // dateStr -> { holidays: [], specials: [], dayOff: boolean }
  const add = (m, d, item, { special = false, dayOff = false } = {}) => {
    const key = ymd(year, m, d);
    if (!map.has(key)) map.set(key, { holidays: [], specials: [], dayOff: false });
    const v = map.get(key);
    (special ? v.specials : v.holidays).push(item);
    v.dayOff = v.dayOff || dayOff;
  };

  // Weekends handled separately in getDayInfo

  // Fixed real-world style dates (region-agnostic, descriptive labels)
  add(1, 1, "New Year's Day", { dayOff: true });
  add(2, 2, "Groundhog Day", { special: true });
  add(2, 14, "Valentine's Day", { special: true });
  add(3, 17, "St. Patrick's Day", { special: true });
  add(4, 1, "April Fools' Day", { special: true });
  // Easter (movable, special but often day off in some regions; here mark special only)
  const eas = easterDate(year);
  add(eas.month, eas.day, "Easter", { special: true });
  add(5, 1, "May Day", { dayOff: true });
  // Pride: mark the whole June as special (not day off)
  for (let d = 1; d <= 30; d++) add(6, d, "Pride Month", { special: true });
  add(6, 24, "Midsummer", { special: true });
  add(10, 31, "Halloween", { special: true });
  add(11, 11, "Remembrance Day", { special: true });
  add(12, 24, "Christmas Eve", { dayOff: true });
  add(12, 25, "Christmas Day", { dayOff: true });

  // Additional cultural observances (approximated)
  // NOTE: For simplicity we include approximate placeholders for Eid and Yom Kippur.
  // You can replace these with precise calendar conversions later.
  const eidDay = 20 + (year % 10); // ~ late spring/summer, drifts by year
  add(7, clamp(eidDay, 1, 30), "Eid (observance)", { special: true });
  const ykDay = 10 + ((year * 3) % 10); // ~ early autumn approximation
  add(9, clamp(ykDay, 1, 30), "Yom Kippur (observance)", { special: true });

  // Ensure 1–2 specials per month minimum
  const monthDays = [31, 29, 31, 30, 31, 30, 30, 31, 30, 31, 30, 31]; // generous Feb for simplicity
  for (let m = 1; m <= 12; m++) {
    const has = [...map.keys()]
      .filter((k) => k.startsWith(`${year}-${String(m).padStart(2, "0")}-`))
      .map((k) => map.get(k))
      .some((v) => v.specials.length + v.holidays.length >= 1);
    if (!has) {
      const d = randInt(5, Math.min(25, monthDays[m - 1]), rnd);
      add(m, d, "Community Day", { special: true });
    }
  }

  // Fictional day‑off holidays (2–4 per year)
  const fictionals = ["Founders' Day", "Independence Day", "Unity Day", "Memorial of Heroes"];
  const count = randInt(2, 4, rnd);
  for (let i = 0; i < count; i++) {
    const m = randInt(1, 12, rnd);
    const d = randInt(1, monthDays[m - 1], rnd);
    add(m, d, pick(fictionals, rnd), { dayOff: true });
  }

  return map;
}