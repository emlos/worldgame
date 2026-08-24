import { Game } from "../../src/classes/game/game.js";
import {
  CHOICE_ERROR_CODE,
  performChoice,
} from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";

const MINUTE = 60_000;
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function allPlaces(game) {
  return [...game.world.locations.values()].flatMap((location) =>
    location.places.map((place) => ({ location, place })),
  );
}

function enterChoice(scene, placeId) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.id === `enter:${placeId}`);
}

const closedGame = new Game({
  seed: 117,
  startDate: new Date("2026-08-24T03:00:00.000Z"),
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
const closedTarget = allPlaces(closedGame).find(
  ({ place }) => !place.isOpen(closedGame.now),
);
check("the generated world contains a closed test place", Boolean(closedTarget));

closedGame.moveTo(closedTarget.location.id);
const closedAccess = closedGame.getPlaceAccess(closedTarget.place);
check(
  "Game reports a closed place as inaccessible",
  !closedAccess.allowed &&
    closedAccess.code === "closed" &&
    closedAccess.place === closedTarget.place,
);

const closedScene = buildScene(closedGame);
const closedChoice = enterChoice(closedScene, closedTarget.place.id);
check(
  "closed places remain visible as disabled choices",
  closedChoice?.enabled === false &&
    closedChoice.disabledReason === `${closedTarget.place.name} is closed.`,
);

const closedState = JSON.stringify(closedGame);
let closedError = null;
try {
  performChoice(closedGame, {
    sceneId: closedScene.id,
    choiceId: closedChoice.id,
  });
} catch (error) {
  closedError = error;
}
check(
  "authoritative execution rejects a disabled closed-place choice",
  closedError?.code === CHOICE_ERROR_CODE.disabledChoice,
);
check(
  "rejected closed-place entry leaves state unchanged",
  JSON.stringify(closedGame) === closedState,
);

const boundaryGame = new Game({
  seed: 118,
  startDate: new Date("2026-08-24T12:00:00.000Z"),
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
const boundaryTarget = allPlaces(boundaryGame)
  .map(({ location, place }) => ({
    location,
    place,
    closesAt: place.getClosingTime(boundaryGame.now),
  }))
  .find(
    ({ place, closesAt }) =>
      closesAt instanceof Date &&
      !place.isOpen(new Date(closesAt.getTime() + MINUTE)),
  );
check("the generated world contains a place with a closing boundary", Boolean(boundaryTarget));

const oneMinuteBeforeClose = new Date(boundaryTarget.closesAt.getTime() - MINUTE);
boundaryGame.jumpToDate(oneMinuteBeforeClose);
boundaryGame.moveTo(boundaryTarget.location.id);
check(
  "the boundary place is open when entry starts",
  boundaryTarget.place.isOpen(boundaryGame.now),
);
const boundaryChoice = enterChoice(buildScene(boundaryGame), boundaryTarget.place.id);
check(
  "entry is disabled when the place closes before arrival",
  boundaryChoice?.enabled === false &&
    boundaryChoice.disabledReason === `${boundaryTarget.place.name} is closed.`,
);

const otherPlace = allPlaces(boundaryGame).find(
  ({ location }) => location.id !== boundaryGame.currentLocationId,
).place;
check(
  "places outside the current location fail the access query",
  boundaryGame.getPlaceAccess(otherPlace).code === "not-here",
);

boundaryGame.setCurrentPlace({ placeId: boundaryTarget.place.id });
check(
  "the access query requires the player to leave their current place",
  boundaryGame.getPlaceAccess(boundaryTarget.place).code === "already-inside",
);

let invalidDateError = null;
try {
  boundaryGame.getPlaceAccess(boundaryTarget.place, { at: new Date("invalid") });
} catch (error) {
  invalidDateError = error;
}
check(
  "place access rejects an invalid evaluation time",
  invalidDateError instanceof TypeError,
);

if (failures.length) {
  console.error("\nPlace access failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All place access tests passed.");
}
