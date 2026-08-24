/** Format YYYY-MM-DD string helper. */
export const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Pad a number to 2 digits ("7" -> "07"). */
export const pad2 = (n) => String(n).padStart(2, "0");

/** Format hour/minute into "HH:MM". */
export const formatHHMM = (hour, minute) => `${pad2(hour)}:${pad2(minute)}`;

/** Format a Date into "HH:MM" using UTC fields. */
export const formatHHMMUTC = (date) => formatHHMM(date.getUTCHours(), date.getUTCMinutes());

/** Format a Date into "YYYY-MM-DD" using UTC fields. */
export const ymdFromUTCDate = (date) => ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());

/** Normalize a Date to UTC midnight (00:00:00.000). */
export const utcMidnight = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

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
