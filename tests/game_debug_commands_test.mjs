import {
  addDebugMoney,
  teleportPlayerToSchool,
} from "../src/classes/game/debugCommands.js";
import { Game } from "../src/classes/game/game.js";

const failures = [];
const check = (label, condition) => {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
};

const game = new Game({
  seed: 117,
  startDate: new Date("2026-08-24T08:00:00.000Z"),
});
const startingMoney = game.player.money;
const startingTime = game.now.toISOString();
const startingRevision = game.actionRevision;

const balance = addDebugMoney(game);

check("the debug command adds exactly £100", game.player.money === startingMoney + 100);
check("the debug command returns the new balance", balance === game.player.money);
check("granting debug money does not pass time", game.now.toISOString() === startingTime);
check(
  "granting debug money commits one logged action",
  game.actionRevision === startingRevision + 1 &&
    game.log.at(-1)?.label === "[Debug] Add £100 to the player",
);

addDebugMoney(game);
check("the debug grant can be used repeatedly", game.player.money === startingMoney + 200);

const school = [...game.world.locations.values()]
  .flatMap((location) =>
    location.places.map((place) => ({ location, place })),
  )
  .find(({ place }) => place.key === "high_school");
const teleportTime = game.now.toISOString();
const teleportRevision = game.actionRevision;
game.currentStory = { type: "scene", id: "debug.test" };
const destination = teleportPlayerToSchool(game);

check(
  "the school teleport moves the player inside the generated high school",
  destination.location.id === school.location.id &&
    destination.place.id === school.place.id &&
    game.currentLocationId === school.location.id &&
    game.currentPlaceId === school.place.id &&
    game.currentPlaceKey === "high_school",
);
check(
  "the school teleport clears the previous story without passing time",
  game.currentStory === null && game.now.toISOString() === teleportTime,
);
check(
  "the school teleport commits one debug action",
  game.actionRevision === teleportRevision + 1 &&
    game.log.at(-1)?.label === `[Debug] Teleport player to ${school.place.name}`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} debug command test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All game debug command tests passed.");
}
