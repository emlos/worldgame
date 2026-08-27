/** Format YYYY-MM-DD string helper. */
export const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Pad a number to 2 digits ("7" -> "07"). */
export const pad2 = (n) => String(n).padStart(2, "0");

/** Format hour/minute into "HH:MM". */
export const formatHHMM = (hour, minute) => `${pad2(hour)}:${pad2(minute)}`;

/** Return a defensive Date copy, or null when the value is not a valid instant. */
export function asDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value) : null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Format a Date into "HH:MM" using UTC fields. */
export const formatHHMMUTC = (date) => formatHHMM(date.getUTCHours(), date.getUTCMinutes());

/** Format a Date into "YYYY-MM-DD" using UTC fields. */
export const ymdFromUTCDate = (date) => ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());

/** Normalize a Date to UTC midnight (00:00:00.000), with an optional day offset. */
export function utcDayStart(value, dayOffset = 0) {
  const date = asDate(value);
  if (!date) return null;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + dayOffset),
  );
}

export const utcMidnight = (date) => utcDayStart(date);

/** Return a new Date a finite number of minutes from the supplied instant. */
export function addMinutes(value, minutes) {
  const date = asDate(value);
  const amount = Number(minutes);
  if (!date || !Number.isFinite(amount)) return null;
  return new Date(date.getTime() + amount * 60 * 1000);
}

/** Return a defensive copy of the earliest valid Date, or null when none are valid. */
export function minDate(...values) {
  let earliest = null;
  for (const value of values) {
    if (value == null) continue;
    const date = asDate(value);
    if (date && (!earliest || date < earliest)) earliest = date;
  }
  return earliest;
}

/** Calculate completed UTC years since a birth timestamp. */
export function ageAtDate(birthValue, atValue) {
  const birthDate = asDate(birthValue);
  const at = asDate(atValue);
  if (!birthDate || !at) throw new TypeError("Age calculation requires valid dates");

  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const anniversary = new Date(birthDate);
  anniversary.setUTCFullYear(at.getUTCFullYear());
  if (at < anniversary) age -= 1;
  return Math.max(0, age);
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Parse a strict "HH:MM" (24h) value into minutes since midnight.
 * "24:00" is allowed and returns 1440; no other 24-hour value is valid.
 * Empty input can use a caller-provided default, but malformed non-empty input
 * always throws so authored schedules cannot silently move to another time.
 */
export const parseTimeToMinutes = (
  value,
  { defaultValue = null, nullOnEmpty = false } = {}
) => {
  if (value == null || value === "") return nullOnEmpty ? null : defaultValue;

  const text = String(value);
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) {
    throw new TypeError(`Invalid time ${JSON.stringify(value)}; expected HH:MM`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) {
    throw new RangeError(`Invalid time ${JSON.stringify(value)}; expected 00:00 through 24:00`);
  }

  return hour === 24 ? MINUTES_PER_DAY : hour * 60 + minute;
};
