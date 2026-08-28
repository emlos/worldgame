import { Game } from "../../src/classes/game/game.js";
import {
  CHOICE_ERROR_CODE,
  performChoice,
} from "../../src/classes/game/scene/choiceEngine.js";
import { buildSceneStatus } from "../../src/classes/game/scene/sceneContext.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import {
  LOCATION_DESCRIPTIONS,
  SCENE_TEXT,
} from "../../src/content/scene/genericText.js";

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

function choiceOfType(scene, actionType) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find(
      (choice) => choice.action.type === actionType && choice.enabled,
    );
}

const sceneGame = new Game({
  seed: 117,
  startDate: START,
  playerOptions: { startPlaceId: null },
});
const sceneBefore = JSON.stringify(sceneGame);
const firstScene = buildScene(sceneGame);
const repeatedScene = buildScene(sceneGame);

check(
  "scene generation remains pure after extraction",
  JSON.stringify(sceneGame) === sceneBefore,
);
check(
  "identical state produces an identical scene",
  equal(firstScene, repeatedScene),
);
check(
  "location prose comes from the scene content module",
  LOCATION_DESCRIPTIONS.includes(firstScene.paragraphs[1]),
);
check(
  "scene status comes from the read-only context module",
  equal(firstScene.status, buildSceneStatus(sceneGame)),
);
const choiceIds = firstScene.sections.flatMap((section) =>
  section.choices.map((choice) => choice.id),
);
check(
  "generated scene choice ids are unique",
  new Set(choiceIds).size === choiceIds.length,
);

const taylor = sceneGame.npcs.get("taylor");
const vega = sceneGame.npcs.get("officer_vega");
const localPlace = sceneGame.location.places[0];
taylor.setLocationAndPlace(sceneGame.currentLocationId, null);
vega.setLocationAndPlace(sceneGame.currentLocationId, localPlace.id);
check(
  "outdoor position query includes only outdoor NPCs in the current location",
  equal(
    sceneGame.getNPCsAtCurrentPosition().map((npc) => npc.id),
    [taylor.id],
  ),
);
sceneGame.setCurrentPlace({ placeId: localPlace.id });
check(
  "indoor position query includes only NPCs in the exact place",
  equal(
    sceneGame.getNPCsAtCurrentPosition().map((npc) => npc.id),
    [vega.id],
  ),
);
const placeScene = buildScene(sceneGame);
check("entering a place produces a place scene", placeScene.kind === "place");
check(
  "place prose and activities come from the authored WG hub",
  placeScene.id.includes("place.") &&
    placeScene.paragraphs.some((paragraph) => paragraph.includes(localPlace.name)) &&
    placeScene.sections.some((section) => section.heading === "Activities"),
);

const choiceGame = new Game({
  seed: 118,
  startDate: START,
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
let choiceScene = buildScene(choiceGame);
const unknownBefore = JSON.stringify(choiceGame);
let unknownError = null;
try {
  performChoice(choiceGame, {
    sceneId: choiceScene.id,
    choiceId: "missing-choice",
  });
} catch (error) {
  unknownError = error;
}
check(
  "choice execution moved to its own module",
  typeof performChoice === "function",
);
check(
  "unknown choices are rejected",
  unknownError?.code === CHOICE_ERROR_CODE.unavailableChoice,
);
check(
  "unknown choices leave game state unchanged",
  JSON.stringify(choiceGame) === unknownBefore,
);

const loiterChoice = choiceOfType(choiceScene, "loiter");
const loiterStart = choiceGame.now.getTime();
const loiterResult = performChoice(choiceGame, {
  sceneId: choiceScene.id,
  choiceId: loiterChoice.id,
});
check(
  "loiter choice still advances its configured time",
  choiceGame.now.getTime() ===
    loiterStart + loiterChoice.durationMinutes * 60_000,
);
check(
  "loiter choice still returns its result prose",
  loiterResult.notice === SCENE_TEXT.loiterResult &&
    loiterResult.paragraphs.length === 0,
);

choiceScene = buildScene(choiceGame);
const enterChoice = choiceOfType(choiceScene, "enter");
const enterStart = choiceGame.now.getTime();
const enterResult = performChoice(choiceGame, {
  sceneId: choiceScene.id,
  choiceId: enterChoice.id,
});
check(
  "enter choice sets the selected place",
  choiceGame.currentPlaceId === enterChoice.action.placeId,
);
check(
  "enter choice advances its configured time",
  choiceGame.now.getTime() ===
    enterStart + enterChoice.durationMinutes * 60_000,
);
check(
  "enter choice returns result prose",
  enterResult.notice.startsWith("You enter ") &&
    enterResult.paragraphs.length === 0,
);

choiceScene = buildScene(choiceGame);
const leaveChoice = choiceOfType(choiceScene, "leave");
const leaveStart = choiceGame.now.getTime();
const leaveResult = performChoice(choiceGame, {
  sceneId: choiceScene.id,
  choiceId: leaveChoice.id,
});
check(
  "leave choice returns the player outdoors",
  choiceGame.currentPlaceId === null,
);
check(
  "leave choice advances its configured time",
  choiceGame.now.getTime() ===
    leaveStart + leaveChoice.durationMinutes * 60_000,
);
check(
  "leave choice returns result prose",
  leaveResult.notice.startsWith("You step outside ") &&
    leaveResult.paragraphs.length === 0,
);

choiceScene = buildScene(choiceGame);
const travelChoice = choiceOfType(choiceScene, "travel");
const travelStart = choiceGame.now.getTime();
const travelResult = performChoice(choiceGame, {
  sceneId: choiceScene.id,
  choiceId: travelChoice.id,
});
check(
  "travel choice moves to its selected neighboring location",
  String(choiceGame.currentLocationId) ===
    String(travelChoice.action.targetLocationId),
);
check(
  "travel choice advances its configured time",
  choiceGame.now.getTime() ===
    travelStart + travelChoice.durationMinutes * 60_000,
);
check(
  "travel choice returns result prose",
  travelResult.notice.startsWith("You arrive in ") &&
    travelResult.paragraphs.length === 0,
);

if (failures.length) {
  console.error("\nScene engine extraction failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All scene engine extraction tests passed.");
}
