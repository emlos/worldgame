export const HIGH_SCHOOL_PLACE_KEY = "high_school";

export const SCHOOL_SEMESTERS = Object.freeze([
  Object.freeze({ name: "Fall", start: "09-01", end: "12-15" }),
  Object.freeze({ name: "Spring", start: "01-10", end: "05-20" }),
]);

export const SCHOOL_DAY_START = "09:00";
export const SCHOOL_CLASS_MINUTES = 45;
export const SCHOOL_CLASS_SEGMENTS = 3;
export const SCHOOL_BREAK_MINUTES = 15;
export const SCHOOL_LUNCH_AFTER_LESSON = 3;
export const SCHOOL_LUNCH_MINUTES = 45;

export const SCHOOL_WEEKLY_CLASSES = Object.freeze([
  Object.freeze({
    dayKey: "mon",
    label: "Monday",
    dayOfWeek: 1,
    subjects: Object.freeze(["english", "math", "science", "physical_education"]),
  }),
  Object.freeze({
    dayKey: "tue",
    label: "Tuesday",
    dayOfWeek: 2,
    subjects: Object.freeze([
      "math",
      "history",
      "science",
      "art",
      "physical_education",
    ]),
  }),
  Object.freeze({
    dayKey: "wed",
    label: "Wednesday",
    dayOfWeek: 3,
    subjects: Object.freeze(["english", "math", "history", "science"]),
  }),
  Object.freeze({
    dayKey: "thu",
    label: "Thursday",
    dayOfWeek: 4,
    subjects: Object.freeze(["english", "history", "art", "physical_education"]),
  }),
  Object.freeze({
    dayKey: "fri",
    label: "Friday",
    dayOfWeek: 5,
    subjects: Object.freeze(["english", "math", "science", "physical_education"]),
  }),
]);
