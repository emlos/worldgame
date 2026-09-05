import { DAY_KEYS } from "./time.js";

export function emptySchedule() {
  return {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };
}

export function hoursEveryDay(from, to) {
  const schedule = emptySchedule();
  for (const day of Object.keys(schedule)) schedule[day].push({ from, to });
  return schedule;
}

export function hoursAllDay() {
  return hoursEveryDay("00:00", "24:00");
}

export function hoursWeekdays({
  from = "08:00",
  to = "16:00",
  saturday,
  sunday,
} = {}) {
  const schedule = emptySchedule();
  for (const day of DAY_KEYS.slice(1, 6)) schedule[day].push({ from, to });
  if (saturday?.from && saturday?.to) {
    schedule.sat.push({ from: saturday.from, to: saturday.to });
  }
  if (sunday?.from && sunday?.to) {
    schedule.sun.push({ from: sunday.from, to: sunday.to });
  }
  return schedule;
}
