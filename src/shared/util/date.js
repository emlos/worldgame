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
 * Parse "HH:MM" (24h) into minutes since midnight.
 * - Allows "24:00" (returns 1440).
 * - Defaults to UTC-style "numeric parsing" (invalid numbers become 0) unless you pass a `defaultValue`.
 *
 * Options:
 * - defaultValue: returned when input is empty/invalid (default: null)
 * - nullOnEmpty: if true, empty input returns null (overrides defaultValue)
 * - clamp: clamp hour/minute into [0..24]/[0..59] (default: true)
 */
export const parseTimeToMinutes = (
  str,
  { defaultValue = null, nullOnEmpty = false, clamp = true } = {}
) => {
  if (str == null || str === "") return nullOnEmpty ? null : defaultValue;

  const [hStr, mStr] = String(str).split(":");
  let h = parseInt(hStr, 10);
  let m = parseInt(mStr ?? "0", 10);

  // If a part is missing/invalid, treat it as 0 (matches existing game behavior).
  if (!Number.isFinite(h)) h = 0;
  if (!Number.isFinite(m)) m = 0;

  if (h === 24 && m === 0) return MINUTES_PER_DAY;

  if (clamp) {
    h = Math.max(0, Math.min(24, h));
    m = Math.max(0, Math.min(59, m));
  }

  const out = h * 60 + m;
  return Number.isFinite(out) ? out : defaultValue;
};
