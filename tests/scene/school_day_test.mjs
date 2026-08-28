import { Game } from "../../src/classes/game/game.js";
import { performChoice } from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import { WG_BUNDLE } from "../../src/generated/wg/scenes.js";
import {
  getSchoolDayPlan,
  getSchoolDayState,
  SCHOOL_PHASE,
} from "../../src/data/player/schedule.js";

const START = new Date("2026-09-01T07:00:00.000Z");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function choices(scene) {
  return scene.sections.flatMap((section) => section.choices);
}

function choice(game, id) {
  const scene = buildScene(game);
  const selected = choices(scene).find((candidate) => candidate.id === id);
  if (!selected) throw new Error(`Missing school choice '${id}'`);
  return { scene, selected };
}

function perform(game, id) {
  const current = choice(game, id);
  return performChoice(game, {
    sceneId: current.scene.id,
    choiceId: current.selected.id,
  });
}

const game = new Game({
  seed: 117,
  startDate: START,
  playerOptions: { startPlaceId: null },
});
const classSequenceIds = [
  "school.class.english",
  "school.class.math",
  "school.class.history",
  "school.class.science",
  "school.class.art",
  "school.class.physical-education",
];
check(
  "every class is authored as a three-passage named sequence",
  classSequenceIds.every(
    (id) =>
      WG_BUNDLE.sequences[id]?.passages
        .map((passage) => passage.id)
        .join(",") === "segment-1,segment-2,segment-3",
  ),
);
const highSchool = [...game.world.locations.values()]
  .flatMap((location) =>
    location.places.map((place) => ({ location, place })),
  )
  .find(({ place }) => place.key === "high_school");

check("the generated world contains a high school", Boolean(highSchool));
check(
  "the game begins on the first day of the fall semester",
  getSchoolDayPlan(game).school.semester?.name === "Fall" &&
    getSchoolDayPlan(game).school.semester?.start === "09-01" &&
    game.now.toISOString() === START.toISOString(),
);
check(
  "high school is open from 07:00 until 17:00",
  !highSchool.place.isOpen(new Date("2026-09-01T06:59:00.000Z")) &&
    highSchool.place.isOpen(new Date("2026-09-01T07:00:00.000Z")) &&
    highSchool.place.isOpen(new Date("2026-09-01T16:59:00.000Z")) &&
    !highSchool.place.isOpen(new Date("2026-09-01T17:00:00.000Z")),
);

game.currentLocationId = highSchool.location.id;
game.setCurrentPlace({ placeId: highSchool.place.id });

let state = getSchoolDayState(game);
let scene = buildScene(game);
const activitiesSection = scene.sections.find(
  (section) => section.id === "choices:activities",
);
const currentActivitiesSection = scene.sections.find(
  (section) => section.id === "choices:current-activities",
);
const firstClassWait = choices(scene).find(
  (candidate) => candidate.id === "wait-for-first-class",
);
check(
  "the school hub separates rooms from current activities",
  activitiesSection?.heading === "Activities" &&
    activitiesSection.choices.some(
      (candidate) => candidate.id === "math-classroom",
    ) &&
    currentActivitiesSection?.heading === "Current Activities" &&
    currentActivitiesSection.choices.some(
      (candidate) => candidate.id === "wait-for-first-class",
    ) &&
    !currentActivitiesSection.choices.some(
      (candidate) => candidate.id === "math-classroom",
    ),
);
check(
  "the pre-school hub waits exactly until the first class",
  state.phase === SCHOOL_PHASE.beforeSchool &&
    state.nextBoundaryAt === "2026-09-01T09:00:00.000Z" &&
    firstClassWait?.durationMinutes === 120,
);
check(
  "NPC presence does not create a generic greeting",
  !choices(scene).some((candidate) => candidate.id.startsWith("greet:")),
);

perform(game, "wait-for-first-class");
state = getSchoolDayState(game);
scene = buildScene(game);
const taylor = game.npcs.get("taylor");
check(
  "waiting reaches English while the player remains in the school hub",
  game.now.toISOString() === "2026-09-01T09:00:00.000Z" &&
    state.phase === SCHOOL_PHASE.class &&
    state.subjectId === "english" &&
    state.segment === 1 &&
    game.currentStory?.type !== "sequence" &&
    game.getNPCsAtCurrentPosition().includes(taylor),
);
check(
  "rooms remain available when class is scheduled but the player is not attending",
  scene.sections
    .find((section) => section.id === "choices:activities")
    ?.choices.some((candidate) => candidate.id === "cafeteria-room") &&
    scene.sections
      .find((section) => section.id === "choices:current-activities")
      ?.choices.some((candidate) => candidate.id === "attend-english") &&
    !choices(scene).some((candidate) => candidate.id === "english-1-study"),
);

perform(game, "cafeteria-room");
check(
  "skipping the immediate class prompt keeps the general school menu available",
  game.now.toISOString() === "2026-09-01T09:01:00.000Z" &&
    getSchoolDayState(game).phase === SCHOOL_PHASE.class &&
    choice(game, "attend-english").selected.durationMinutes === 0 &&
    Boolean(
      buildScene(game).sections.find(
        (section) => section.id === "choices:activities",
      ),
    ),
);

perform(game, "attend-english");
scene = buildScene(game);
check(
  "attending class enters its first named sequence passage and hides school rooms",
  game.currentStory?.type === "sequence" &&
    game.currentStory.id === "school.class.english" &&
    game.currentStory.passageId === "segment-1" &&
    !scene.sections.some((section) => section.id === "choices:activities") &&
    ["english-1-taylor", "english-1-study"].every((id) =>
      choices(scene).some((candidate) => candidate.id === id),
    ) &&
    choice(game, "english-1-taylor").selected.durationMinutes === 14,
);

const relationshipBefore = game.player.getRelationship("taylor").score;
perform(game, "english-1-taylor");
check(
  "the first class passage reaches the next timetable boundary",
  game.now.toISOString() === "2026-09-01T09:15:00.000Z" &&
    game.currentStory?.passageId === "segment-2" &&
    game.player.getSubjectGrade("english") === 50 &&
    game.player.getSubjectRecord("english").attendedSegments === 1 &&
    Math.abs(
      game.player.getRelationship("taylor").score - relationshipBefore - 0.003,
    ) < 1e-12,
);

perform(game, "english-2-study");
check(
  "the second class passage records studying and advances by name",
  game.now.toISOString() === "2026-09-01T09:30:00.000Z" &&
    game.currentStory?.passageId === "segment-3" &&
    game.player.getSubjectGrade("english") === 51 &&
    game.player.getSubjectRecord("english").attendedSegments === 2,
);

perform(game, "english-3-study");
state = getSchoolDayState(game);
const breakChoice = choice(game, "break-cafeteria").selected;
check(
  "the final passage exits class and restores the school hub for break",
  state.phase === SCHOOL_PHASE.break &&
    game.currentStory === null &&
    Boolean(
      buildScene(game).sections.find(
        (section) => section.id === "choices:activities",
      ),
    ) &&
    state.nextBoundaryAt === "2026-09-01T10:00:00.000Z" &&
    breakChoice.durationMinutes === 15,
);
perform(game, "break-cafeteria");
check(
  "the break advances directly to Mathematics",
  game.now.toISOString() === "2026-09-01T10:00:00.000Z" &&
    getSchoolDayState(game).subjectId === "math",
);

game.jumpToDate(new Date("2026-09-01T12:00:00.000Z"));
state = getSchoolDayState(game);
const lunchChoice = choice(game, "lunch-cafeteria").selected;
check(
  "lunch offers the cafeteria and waits until afternoon classes",
  state.phase === SCHOOL_PHASE.lunch &&
    lunchChoice.durationMinutes === 60 &&
    choice(game, "lunch-wait").selected.durationMinutes === 60,
);
perform(game, "lunch-cafeteria");
check(
  "lunch advances directly to Science",
  game.now.toISOString() === "2026-09-01T13:00:00.000Z" &&
    getSchoolDayState(game).subjectId === "science",
);

game.jumpToDate(new Date("2026-09-01T15:45:00.000Z"));
state = getSchoolDayState(game);
const closingChoice = choice(game, "after-school-wait").selected;
check(
  "after-school waiting targets the 17:00 closing time",
  state.phase === SCHOOL_PHASE.afterSchool &&
    state.nextBoundaryAt === "2026-09-01T17:00:00.000Z" &&
    closingChoice.durationMinutes === 75,
);
const closingResult = perform(game, "after-school-wait");
check(
  "school closing automatically ushers the player outside",
  game.now.toISOString() === "2026-09-01T17:00:00.000Z" &&
    game.currentPlaceId === null &&
    game.currentStory === null &&
    closingResult.includes("ushers you outside"),
);

const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
check(
  "school grades and attendance survive save and load",
  restored.player.getSubjectGrade("english") === 52 &&
    restored.player.getSubjectRecord("english").attendedSegments === 3,
);

if (failures.length) {
  console.error("\nSchool day failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All school day tests passed.");
}
