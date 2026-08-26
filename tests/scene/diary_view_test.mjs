import { Game } from "../../src/classes/game/game.js";
import { buildPlayerDiaryView } from "../../src/classes/game/scene/diaryView.js";

const START = new Date("2026-08-24T08:00:00.000Z");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const game = new Game({
  seed: 117,
  startDate: START,
  playerOptions: { startPlaceId: null },
});
const before = JSON.stringify(game);
const summerBreak = buildPlayerDiaryView(game);
const schoolDay = buildPlayerDiaryView(game, {
  date: new Date("2026-09-02T08:00:00.000Z"),
});

check("diary view generation is pure", JSON.stringify(game) === before);
check(
  "dates between configured semesters show no school",
  !summerBreak.hasSchool && summerBreak.noSchoolReason === "out_of_term",
);
check("a normal workday contains school", schoolDay.hasSchool);
check("the active semester comes from school data", schoolDay.school.semester?.name === "Fall");
check(
  "school hours come from the first and last timetable periods",
  schoolDay.school.start === "08:15" && schoolDay.school.end === "15:00",
);
check(
  "all data-defined school periods are included in chronological order",
  equal(
    schoolDay.school.periods.map((period) => period.id),
    ["english", "math", "history", "lunch", "science", "art", "phys-ed"],
  ),
);
check(
  "data keys receive readable diary labels",
  schoolDay.school.periods.at(-1).label === "Phys Ed",
);

const weekend = buildPlayerDiaryView(game, {
  date: new Date("2026-09-05T12:00:00.000Z"),
});
check(
  "weekends show no school",
  !weekend.hasSchool && weekend.noSchoolReason === "day_off" && weekend.day.isWeekend,
);

const christmas = buildPlayerDiaryView(game, {
  date: new Date("2026-12-25T12:00:00.000Z"),
});
check(
  "day-off holidays show no school and retain their name",
  !christmas.hasSchool &&
    christmas.noSchoolReason === "day_off" &&
    christmas.day.holidays.includes("Christmas Day"),
);

const disabled = buildPlayerDiaryView(game, {
  date: new Date("2026-09-02T08:00:00.000Z"),
  playerSchedule: { school: false },
});
check(
  "the player school flag can disable school on a workday",
  !disabled.hasSchool && disabled.noSchoolReason === "school_disabled",
);

const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
check(
  "save/load preserves the diary view",
  equal(
    buildPlayerDiaryView(restored, {
      date: new Date("2026-09-02T08:00:00.000Z"),
    }),
    schoolDay,
  ),
);

if (failures.length) {
  console.error("\nDiary view failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All diary view tests passed.");
}
