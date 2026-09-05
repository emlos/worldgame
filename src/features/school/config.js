export const HIGH_SCHOOL_PLACE_KEY = "high_school";

export const SCHOOL_SEMESTERS = Object.freeze([
  Object.freeze({ name: "Fall", start: "09-01", end: "12-15" }),
  Object.freeze({ name: "Spring", start: "01-10", end: "05-20" }),
]);

export const SCHOOL_TIMETABLE = Object.freeze([
  Object.freeze({ id: "english", kind: "class", subjectId: "english", start: "09:00", end: "09:45", segments: 3 }),
  Object.freeze({ id: "math", kind: "class", subjectId: "math", start: "10:00", end: "10:45", segments: 3 }),
  Object.freeze({ id: "history", kind: "class", subjectId: "history", start: "11:00", end: "11:45", segments: 3 }),
  Object.freeze({ id: "lunch", kind: "lunch", start: "11:45", end: "13:00" }),
  Object.freeze({ id: "science", kind: "class", subjectId: "science", start: "13:00", end: "13:45", segments: 3 }),
  Object.freeze({ id: "art", kind: "class", subjectId: "art", start: "14:00", end: "14:45", segments: 3 }),
  Object.freeze({ id: "physical_education", kind: "class", subjectId: "physical_education", start: "15:00", end: "15:45", segments: 3 }),
]);
