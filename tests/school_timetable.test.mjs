import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  getSchoolDayPlan,
  getSchoolDayState,
  getSchoolWeekSchedule,
} from "../src/features/school/timetable.js";

const EXPECTED_WEEK = {
  mon: ["english", "math", "science", "physical_education"],
  tue: ["math", "history", "science", "art", "physical_education"],
  wed: ["english", "math", "history", "science"],
  thu: ["english", "history", "art", "physical_education"],
  fri: ["english", "math", "science", "physical_education"],
};

function findSchool(game) {
  for (const location of game.world.locations.values()) {
    const place = (location.places || []).find((candidate) =>
      candidate.key === "high_school"
    );
    if (place) return { location, place };
  }
  throw new Error("The generated test world has no high school");
}

function placeAtSchool(game) {
  const { location, place } = findSchool(game);
  game.moveTo(String(location.id));
  game.setCurrentPlace({ placeId: String(place.id) });
}

function choose(game, label) {
  const scene = buildScene(game);
  const choice = scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.label === label);
  assert.ok(choice, `expected choice '${label}'`);
  performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

test("the weekly timetable derives periods and variable last bells", () => {
  const schedule = getSchoolWeekSchedule();
  assert.deepEqual(
    Object.fromEntries(schedule.map((day) => [
      day.dayKey,
      day.periods
        .filter((period) => period.kind === "class")
        .map((period) => period.subjectId),
    ])),
    EXPECTED_WEEK,
  );
  assert.deepEqual(
    Object.fromEntries(schedule.map((day) => [day.dayKey, day.end])),
    { mon: "13:15", tue: "14:15", wed: "13:15", thu: "13:15", fri: "13:15" },
  );
  for (const day of schedule) {
    const classes = day.periods.filter((period) => period.kind === "class");
    assert.ok(classes.every((period) => period.segments === 3));
    assert.ok(classes.every((period) =>
      Date.parse(`2000-01-01T${period.end}:00.000Z`) -
        Date.parse(`2000-01-01T${period.start}:00.000Z`) === 45 * 60_000
    ));
    const lunch = day.periods.find((period) => period.kind === "lunch");
    assert.deepEqual(
      { start: lunch.start, end: lunch.end },
      { start: "11:45", end: "12:30" },
    );
  }
});

test("school phases follow class segments, breaks, lunch, and the daily last bell", () => {
  const cases = [
    ["2026-09-03T09:00:00.000Z", "class", "english", 1],
    ["2026-09-03T09:15:00.000Z", "class", "english", 2],
    ["2026-09-03T09:45:00.000Z", "break", null, null],
    ["2026-09-03T10:00:00.000Z", "class", "history", 1],
    ["2026-09-03T11:00:00.000Z", "class", "art", 1],
    ["2026-09-03T11:45:00.000Z", "lunch", null, null],
    ["2026-09-03T12:30:00.000Z", "class", "physical_education", 1],
    ["2026-09-03T13:15:00.000Z", "after_school", null, null],
  ];

  for (const [at, phase, subjectId, segment] of cases) {
    const game = new Game({ seed: 551, startDate: new Date(at) });
    placeAtSchool(game);
    const state = getSchoolDayState(game);
    assert.equal(state.phase, phase, at);
    assert.equal(state.subjectId, subjectId, at);
    assert.equal(state.segment, segment, at);
  }
});

test("the current school plan selects only that weekday's classes", () => {
  const game = new Game({
    seed: 552,
    startDate: new Date("2026-09-01T08:00:00.000Z"),
  });
  const plan = getSchoolDayPlan(game);
  assert.equal(plan.school.start, "09:00");
  assert.equal(plan.school.end, "14:15");
  assert.deepEqual(
    plan.school.periods
      .filter((period) => period.kind === "class")
      .map((period) => period.subjectId),
    EXPECTED_WEEK.tue,
  );
});

test("Taylor's school obligation ends at each weekday's last bell", () => {
  const thursdayDuringSchool = new Game({
    seed: 554,
    startDate: new Date("2026-09-03T12:00:00.000Z"),
  });
  assert.equal(
    thursdayDuringSchool.npcs.get("taylor").brain.currentGoal?.ruleId,
    "school_thu",
  );

  const thursdayAfterSchool = new Game({
    seed: 554,
    startDate: new Date("2026-09-03T13:16:00.000Z"),
  });
  assert.notEqual(
    thursdayAfterSchool.npcs.get("taylor").brain.currentGoal?.ruleId,
    "school_thu",
  );

  const tuesdayDuringSchool = new Game({
    seed: 554,
    startDate: new Date("2026-09-01T13:30:00.000Z"),
  });
  assert.equal(
    tuesdayDuringSchool.npcs.get("taylor").brain.currentGoal?.ruleId,
    "school_tue",
  );
});

test("the student council office displays the generated timetable and returns", () => {
  const game = new Game({
    seed: 553,
    startDate: new Date("2026-09-03T12:00:00.000Z"),
  });
  game.setFlag("school_first_visit_seen");
  game.setFlag("journal.taylor_met");
  placeAtSchool(game);

  choose(game, "Visit the student council office");
  choose(game, "View the weekly timetable");

  const timetable = buildScene(game);
  const table = timetable.content.find((block) => block.type === "table");
  assert.ok(table);
  assert.equal(table.rows.length, 5);
  assert.equal(table.rows[0][4], "");
  assert.equal(table.rows[0][6], "");
  assert.match(table.rows[1].join(" "), /Tuesday.*Physical Education.*14:15/);

  choose(game, "Return");
  assert.equal(game.currentStory?.id, "place.high-school.student-council-room");
});
