export const Season = Object.freeze({
  WINTER: "winter",
  SPRING: "spring",
  SUMMER: "summer",
  AUTUMN: "autumn",
});

export function seasonForMonth(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Season month must be an integer from 1 to 12: ${String(month)}`);
  }
  if (month === 12 || month <= 2) return Season.WINTER;
  if (month <= 5) return Season.SPRING;
  if (month <= 8) return Season.SUMMER;
  return Season.AUTUMN;
}

export function seasonForDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`Invalid season date: ${String(value)}`);
  }
  return seasonForMonth(date.getUTCMonth() + 1);
}
