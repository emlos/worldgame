import { Game } from "../../src/classes/game/game.js";
import {
  getSchoolDayPlan,
  SCHEDULE,
  SCHOOL_DAY_END,
  SCHOOL_DAY_START,
} from "../../src/data/player/schedule.js";
import { NPC_REGISTRY } from "../../src/data/npc/npcs.js";

const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function makeGame(date) {
  return new Game({
    seed: 117,
    startDate: new Date(date),
    playerOptions: { startPlaceId: null },
  });
}

function placeKey(game, npc) {
  return game.world
    .getLocation(npc.locationId)
    ?.places.find((place) => place.id === npc.currentPlaceId)?.key;
}

function hasNoSchoolGoal(taylor) {
  return ["no_school_activity", "stay_home_no_school"].includes(
    taylor.brain.currentGoal?.ruleId,
  );
}

const taylorDefinition = NPC_REGISTRY.find((npc) => npc.id === "taylor");
const schoolRule = taylorDefinition.behavior.goals.find((goal) => goal.id === "school");
check(
  "Taylor's obligation uses the timetable's first and last periods",
  SCHOOL_DAY_START === "09:00" &&
    SCHOOL_DAY_END === "15:45" &&
    schoolRule.when.from === SCHOOL_DAY_START &&
    schoolRule.when.to === SCHOOL_DAY_END,
);
check("Taylor's obligation requires an actual school day", schoolRule.when.schoolDay === true);

const schoolGame = makeGame("2026-09-02T09:30:00.000Z");
const schoolTaylor = schoolGame.npcs.get("taylor");
const schoolPlan = getSchoolDayPlan(schoolGame);
check("an in-term workday is a shared school day", schoolPlan.hasSchool);
check(
  "Taylor attends school for the shared timetable window",
  schoolTaylor.brain.currentGoal?.ruleId === "school" &&
    schoolTaylor.brain.currentGoal?.windowStart === "2026-09-02T09:00:00.000Z" &&
    schoolTaylor.brain.currentGoal?.windowEnd === "2026-09-02T15:45:00.000Z" &&
    placeKey(schoolGame, schoolTaylor) === "high_school",
);

const summerGame = makeGame("2026-08-24T12:00:00.000Z");
const summerTaylor = summerGame.npcs.get("taylor");
check(
  "Taylor has no school obligation between semesters",
  getSchoolDayPlan(summerGame).noSchoolReason === "out_of_term" &&
    !summerTaylor.brain.isBusyWithObligation &&
    hasNoSchoolGoal(summerTaylor),
);

const schoolAfternoonGame = makeGame("2026-09-02T16:00:00.000Z");
const schoolAfternoonTaylor = schoolAfternoonGame.npcs.get("taylor");
check(
  "Taylor uses an after-school routine only after a real school day",
  ["after_school_activity", "go_home_after_school"].includes(
    schoolAfternoonTaylor.brain.currentGoal?.ruleId,
  ),
);

const summerAfternoonGame = makeGame("2026-08-24T16:00:00.000Z");
check(
  "a break afternoon still uses Taylor's no-school routine",
  hasNoSchoolGoal(summerAfternoonGame.npcs.get("taylor")),
);

const weekendGame = makeGame("2026-09-05T12:00:00.000Z");
const weekendTaylor = weekendGame.npcs.get("taylor");
check(
  "Taylor uses her no-school routine on weekends during term",
  getSchoolDayPlan(weekendGame).noSchoolReason === "day_off" &&
    !weekendTaylor.brain.isBusyWithObligation &&
    hasNoSchoolGoal(weekendTaylor),
);

const holidayGame = makeGame("2026-05-01T12:00:00.000Z");
const holidayTaylor = holidayGame.npcs.get("taylor");
check(
  "Taylor uses her no-school routine on an in-term holiday",
  getSchoolDayPlan(holidayGame).noSchoolReason === "day_off" &&
    !holidayTaylor.brain.isBusyWithObligation &&
    hasNoSchoolGoal(holidayTaylor),
);

const previousSchoolFlag = SCHEDULE.school;
try {
  SCHEDULE.school = false;
  const disabledGame = makeGame("2026-09-02T09:30:00.000Z");
  const disabledTaylor = disabledGame.npcs.get("taylor");
  check(
    "the global school switch also disables Taylor's obligation",
    getSchoolDayPlan(disabledGame).noSchoolReason === "school_disabled" &&
      !disabledTaylor.brain.isBusyWithObligation &&
      hasNoSchoolGoal(disabledTaylor),
  );
} finally {
  SCHEDULE.school = previousSchoolFlag;
}

const loadedSchoolGame = Game.fromJSON(JSON.parse(JSON.stringify(schoolGame)));
check(
  "Taylor's school-day condition survives save and load",
  loadedSchoolGame.npcs.get("taylor").brain.currentGoal?.ruleId === "school",
);

loadedSchoolGame.jumpToDate(new Date("2026-09-05T12:00:00.000Z"));
const resyncedTaylor = loadedSchoolGame.npcs.get("taylor");
check(
  "calendar resync replaces school with the no-school routine",
  !resyncedTaylor.brain.isBusyWithObligation && hasNoSchoolGoal(resyncedTaylor),
);

if (failures.length) {
  console.error("\nTaylor school schedule failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All Taylor school schedule tests passed.");
}
