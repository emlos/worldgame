import { Game } from "../../src/classes/game/game.js";
import {
  CHOICE_ERROR_CODE,
  performChoice,
} from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import { npcHomeAccessFlag } from "../../src/data/world/access.js";

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

const privateGame = new Game({
  seed: 119,
  startDate: new Date("2026-08-29T12:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});
const taylor = privateGame.npcs.get("taylor");
const taylorHome = privateGame.world
  .getLocation(taylor.homeLocationId)
  .places.find((place) => String(place.id) === String(taylor.homePlaceId));
const taylorAccessFlag = npcHomeAccessFlag(taylor.id);
privateGame.moveTo(taylor.homeLocationId);

const privateAccess = privateGame.getPlaceAccess(taylorHome);
check(
  "NPC homes require their stable per-NPC access flag",
  privateAccess.allowed === false &&
    privateAccess.code === "missing-access-flag" &&
    privateAccess.place === taylorHome &&
    privateAccess.owner === taylor &&
    privateAccess.requiredFlag === taylorAccessFlag,
);

const privateScene = buildScene(privateGame);
const privateChoice = enterChoice(privateScene, taylorHome.id);
check(
  "private residences stay visible with a permission reason",
  privateChoice?.enabled === false &&
    privateChoice.disabledReason === "You need Taylor's permission to enter.",
);

const privateState = JSON.stringify(privateGame);
const privateError = (() => {
  try {
    performChoice(privateGame, {
      sceneId: privateScene.id,
      choiceId: privateChoice.id,
    });
    return null;
  } catch (error) {
    return error;
  }
})();
check(
  "authoritative execution rejects entry without residence access",
  privateError?.code === CHOICE_ERROR_CODE.disabledChoice &&
    JSON.stringify(privateGame) === privateState,
);

privateGame.setFlag(npcHomeAccessFlag("shade"));
check(
  "access to another NPC's home does not unlock Taylor's home",
  privateGame.getPlaceAccess(taylorHome).code === "missing-access-flag",
);
privateGame.setFlag(taylorAccessFlag);
check(
  "the matching access flag unlocks the residence",
  privateGame.getPlaceAccess(taylorHome).allowed === true,
);

const restoredPrivateGame = Game.fromJSON(JSON.parse(JSON.stringify(privateGame)));
const restoredTaylor = restoredPrivateGame.npcs.get("taylor");
const restoredTaylorHome = restoredPrivateGame.world
  .getLocation(restoredTaylor.homeLocationId)
  .places.find((place) => String(place.id) === String(restoredTaylor.homePlaceId));
check(
  "residence access survives save and load",
  restoredPrivateGame.hasFlag(taylorAccessFlag) &&
    restoredPrivateGame.getPlaceAccess(restoredTaylorHome).allowed === true,
);

const unlockedScene = buildScene(privateGame);
const unlockedChoice = enterChoice(unlockedScene, taylorHome.id);
performChoice(privateGame, {
  sceneId: unlockedScene.id,
  choiceId: unlockedChoice.id,
});
check(
  "unlocked NPC homes enter their authored place hub",
  privateGame.currentPlaceId === taylorHome.id &&
    buildScene(privateGame).kind === "place",
);

const playerHomeGame = new Game({
  seed: 120,
  startDate: new Date("2026-08-29T12:00:00.000Z"),
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
check(
  "the player's own home remains accessible without a flag",
  playerHomeGame.getPlaceAccess(playerHomeGame.homePlaceId).allowed === true,
);

const ageGame = new Game({
  seed: 121,
  startDate: new Date("2026-08-29T12:00:00.000Z"),
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
const ageTarget = allPlaces(ageGame).find(({ place }) => place.props?.ages?.min === 18);
ageGame.player.setAgeAtDate(17, ageGame.now);
ageGame.moveTo(ageTarget.location.id);
const ageAccess = ageGame.getPlaceAccess(ageTarget.place);
check(
  "minimum-age place access uses the player's current age",
  ageAccess.allowed === false &&
    ageAccess.code === "age-minimum" &&
    ageAccess.requiredAge === 18,
);
const ageChoice = enterChoice(buildScene(ageGame), ageTarget.place.id);
check(
  "age-restricted places explain their disabled entry choice",
  ageChoice?.enabled === false &&
    ageChoice.disabledReason === "You must be at least 18 to enter.",
);

if (failures.length) {
  console.error("\nPlace access failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All place access tests passed.");
}
