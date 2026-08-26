import { Game } from "../../src/classes/game/game.js";
import {
  CHOICE_ERROR_CODE,
  performChoice,
} from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";

const START = new Date("2026-08-24T08:00:00.000Z");
const DAY_OFF_START = new Date("2026-08-29T08:00:00.000Z");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function choiceOfType(scene, actionType) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.action.type === actionType && choice.enabled);
}

function captureError(callback) {
  try {
    callback();
    return null;
  } catch (error) {
    return error;
  }
}

const invalidGame = new Game({
  seed: 117,
  startDate: START,
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
const invalidScene = buildScene(invalidGame);
const invalidBefore = JSON.stringify(invalidGame);
for (const [label, request] of [
  ["non-object requests", null],
  ["requests without scene ids", { choiceId: "loiter:15" }],
  ["requests without choice ids", { sceneId: invalidScene.id }],
]) {
  const error = captureError(() => performChoice(invalidGame, request));
  check(label, error?.code === CHOICE_ERROR_CODE.invalidRequest);
}
check(
  "invalid requests leave gameplay state unchanged",
  JSON.stringify(invalidGame) === invalidBefore,
);

const canonicalGame = new Game({
  seed: 118,
  startDate: START,
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
const canonicalScene = buildScene(canonicalGame);
const displayedLoiter = choiceOfType(canonicalScene, "loiter");
displayedLoiter.durationMinutes = 999;
displayedLoiter.action = {
  type: "travel",
  targetLocationId: [...canonicalGame.location.neighbors.keys()][0],
};
const canonicalStart = canonicalGame.now.getTime();
const canonicalLocation = canonicalGame.currentLocationId;
performChoice(canonicalGame, {
  sceneId: canonicalScene.id,
  choiceId: displayedLoiter.id,
  durationMinutes: 777,
  action: { type: "leave" },
});
check(
  "execution ignores tampered displayed choice data",
  canonicalGame.now.getTime() === canonicalStart + 15 * 60_000 &&
    canonicalGame.currentLocationId === canonicalLocation,
);
check(
  "execution ignores forged request action and duration fields",
  canonicalGame.log.at(-1)?.label === "Loiter",
);

const staleGame = new Game({
  seed: 119,
  startDate: START,
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
const staleScene = buildScene(staleGame);
const staleChoice = choiceOfType(staleScene, "loiter");
staleGame.advanceMinutes(1);
const staleBefore = JSON.stringify(staleGame);
const staleError = captureError(() =>
  performChoice(staleGame, {
    sceneId: staleScene.id,
    choiceId: staleChoice.id,
  }),
);
check("old scene ids are rejected", staleError?.code === CHOICE_ERROR_CODE.staleScene);
check(
  "stale choices leave gameplay state unchanged",
  JSON.stringify(staleGame) === staleBefore,
);

const presenceGame = new Game({
  seed: 120,
  startDate: START,
  playerOptions: { startPlaceId: null },
});
const taylor = presenceGame.npcs.get("taylor");
taylor.setLocationAndPlace(presenceGame.currentLocationId, null);
const presenceScene = buildScene(presenceGame);
const greetChoice = presenceScene.sections
  .flatMap((section) => section.choices)
  .find((choice) => choice.action.type === "greet" && choice.action.npcId === taylor.id);
taylor.setLocationAndPlace(
  [...presenceGame.world.locations.keys()].find(
    (locationId) => locationId !== presenceGame.currentLocationId,
  ),
  null,
);
const presenceBefore = JSON.stringify(presenceGame);
const presenceError = captureError(() =>
  performChoice(presenceGame, {
    sceneId: presenceScene.id,
    choiceId: greetChoice.id,
  }),
);
check(
  "choices removed from a same-id canonical scene are rejected",
  presenceError?.code === CHOICE_ERROR_CODE.unavailableChoice,
);
check(
  "canonically unavailable choices leave gameplay state unchanged",
  JSON.stringify(presenceGame) === presenceBefore,
);

const greetGame = new Game({
  seed: 121,
  startDate: DAY_OFF_START,
  playerOptions: { startPlaceId: null },
});
const greetNpc = greetGame.npcs.get("taylor");
greetNpc.brain.relocateTemporarily(greetGame, {
  locationId: greetGame.currentLocationId,
  stayMinutes: 30,
});
const greetScene = buildScene(greetGame);
const authoritativeGreet = greetScene.sections
  .flatMap((section) => section.choices)
  .find(
    (choice) =>
      choice.action.type === "greet" && choice.action.npcId === greetNpc.id,
  );
const relationshipBefore = greetGame.player.getRelationship(greetNpc.id).score;
performChoice(greetGame, {
  sceneId: greetScene.id,
  choiceId: authoritativeGreet.id,
});
check(
  "an available canonical greeting applies its declared relationship effect",
  greetGame.player.getRelationship(greetNpc.id).score === relationshipBefore + 0.02,
);

if (failures.length) {
  console.error("\nChoice authority failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All choice authority tests passed.");
}
