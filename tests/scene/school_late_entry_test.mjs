import { Game } from "../../src/classes/game/game.js";
import { performChoice } from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import { createWGRuntimeContext } from "../../src/classes/game/scene/wg/runtimeContext.js";
import {
  enterWGTarget,
  WGRuntimeError,
} from "../../src/classes/game/scene/wg/storyRuntime.js";

const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS: ${label}`);
    return;
  }
  console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`);
  failures.push(label);
}

function choices(scene) {
  return scene.sections.flatMap((section) => section.choices);
}

function findChoice(game, id) {
  const scene = buildScene(game);
  return {
    scene,
    choice: choices(scene).find((candidate) => candidate.id === id),
  };
}

function perform(game, id) {
  const current = findChoice(game, id);
  if (!current.choice) throw new Error(`Missing school choice '${id}'`);
  return performChoice(game, {
    sceneId: current.scene.id,
    choiceId: current.choice.id,
  });
}

function gameAtSchool(iso) {
  const game = new Game({
    seed: 541,
    startDate: new Date(iso),
    playerOptions: { startPlaceId: null },
    npcTemplates: [],
  });
  const school = [...game.world.locations.values()]
    .flatMap((location) =>
      location.places.map((place) => ({ location, place })),
    )
    .find(({ place }) => place.key === "high_school");
  if (!school) throw new Error("Generated world has no high school");
  game.currentLocationId = school.location.id;
  game.setCurrentPlace({ placeId: school.place.id });
  return game;
}

const entryCases = [
  ["2026-09-01T09:00:00.000Z", 1, 0, 15],
  ["2026-09-01T09:14:00.000Z", 1, 14, 1],
  ["2026-09-01T09:15:00.000Z", 2, 15, 15],
  ["2026-09-01T09:29:00.000Z", 2, 29, 1],
  ["2026-09-01T09:30:00.000Z", 3, 30, 15],
  ["2026-09-01T09:44:00.000Z", 3, 44, 1],
];

for (const [arrivedAt, segment, minutesLate, remainingMinutes] of entryCases) {
  const game = gameAtSchool(arrivedAt);
  const attendance = findChoice(game, "attend-english");
  check(
    `English remains attendable at ${arrivedAt.slice(11, 16)}`,
    attendance.choice?.durationMinutes === 0,
  );
  perform(game, "attend-english");
  const frame = game.currentStory;
  const activity = findChoice(game, `english-${segment}-study`).choice;
  check(
    `arrival at ${arrivedAt.slice(11, 16)} opens class segment ${segment}`,
    frame?.type === "sequence" &&
      frame.id === "school.class.english" &&
      frame.passageId === `segment-${segment}` &&
      frame.schoolClass?.periodId === "english" &&
      frame.schoolClass?.subjectId === "english" &&
      frame.schoolClass?.scheduledAt === "2026-09-01T09:00:00.000Z" &&
      frame.schoolClass?.arrivedAt === arrivedAt &&
      frame.schoolClass?.minutesLate === minutesLate &&
      frame.schoolClass?.startingSegment === segment &&
      activity?.durationMinutes === remainingMinutes,
    JSON.stringify(frame),
  );
}

const continuing = gameAtSchool("2026-09-01T09:15:00.000Z");
perform(continuing, "attend-english");
const arrivalSnapshot = JSON.stringify(continuing.currentStory.schoolClass);
perform(continuing, "english-2-study");
check(
  "local class transitions preserve the original arrival snapshot",
  continuing.currentStory?.passageId === "segment-3" &&
    JSON.stringify(continuing.currentStory.schoolClass) === arrivalSnapshot &&
    createWGRuntimeContext(continuing).school.arrival.minutesLate === 15,
);

const restored = Game.fromJSON(JSON.parse(JSON.stringify(continuing)));
check(
  "active class passage and arrival snapshot survive save/load",
  restored.currentStory?.passageId === "segment-3" &&
    JSON.stringify(restored.currentStory.schoolClass) === arrivalSnapshot &&
    findChoice(restored, "english-3-study").choice?.durationMinutes === 15,
);

const ended = gameAtSchool("2026-09-01T09:45:00.000Z");
check(
  "attendance disappears when English class has ended",
  !findChoice(ended, "attend-english").choice,
);

const wrongSubject = gameAtSchool("2026-09-01T10:00:00.000Z");
let wrongSubjectError = null;
try {
  enterWGTarget(wrongSubject, "school.class.english");
} catch (error) {
  wrongSubjectError = error;
}
check(
  "school class sequences reject entry during another subject",
  wrongSubjectError instanceof WGRuntimeError &&
    wrongSubjectError.message.includes("'math' is scheduled") &&
    wrongSubject.currentStory === null,
);

if (failures.length) {
  console.error("\nSchool late-entry failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All school late-entry tests passed.");
}
