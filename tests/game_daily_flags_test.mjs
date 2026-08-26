import { Game } from "../src/classes/game/game.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";

const START = new Date("2026-08-24T08:00:00.000Z");

function makeGame(startDate = START) {
  return new Game({ seed: 117, startDate, npcTemplates: [] });
}

function check(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

function findChoice(scene, id) {
  return scene.sections.flatMap((section) => section.choices).find((choice) => choice.id === id);
}

const flagsGame = makeGame();
check("new games start without daily flags", flagsGame.dailyFlags.size === 0);
flagsGame.setDailyFlag("one");
flagsGame.setDailyFlag("two");
check("daily flags can be set and queried", flagsGame.hasDailyFlag("one") && flagsGame.hasDailyFlag("two"));
flagsGame.clearDailyFlag("one");
check("individual daily flags can be cleared", !flagsGame.hasDailyFlag("one") && flagsGame.hasDailyFlag("two"));
flagsGame.setDailyFlag("two", false);
check("setting a daily flag false removes it", !flagsGame.hasDailyFlag("two"));

const midnightGame = makeGame(new Date("2026-08-24T23:50:00.000Z"));
midnightGame.setDailyFlag("one");
midnightGame.setDailyFlag("two");
midnightGame.advanceMinutes(9);
check("daily flags remain before midnight", midnightGame.dailyFlags.size === 2);
midnightGame.advanceMinutes(1);
check("all daily flags clear exactly at midnight", midnightGame.dailyFlags.size === 0);

const resyncGame = makeGame();
resyncGame.setDailyFlag("same-day");
resyncGame.jumpToDate(new Date("2026-08-24T23:59:00.000Z"));
check("same-day forward resync preserves daily flags", resyncGame.hasDailyFlag("same-day"));
resyncGame.jumpToDate(new Date("2026-08-25T00:00:00.000Z"));
check("forward resync across midnight clears daily flags", resyncGame.dailyFlags.size === 0);

const persistedGame = makeGame();
persistedGame.setDailyFlag("saved-daily-action");
const restoredGame = Game.fromJSON(JSON.parse(JSON.stringify(persistedGame)));
check("daily flags survive save and load", restoredGame.hasDailyFlag("saved-daily-action"));

const rollbackGame = makeGame(new Date("2026-08-24T23:50:00.000Z"));
rollbackGame.setDailyFlag("must-survive");
const rollbackBefore = JSON.stringify(rollbackGame);
const expectedError = new Error("time listener failed");
const unsubscribe = rollbackGame.on("time", () => {
  throw expectedError;
});
let caught = null;
try {
  rollbackGame.advanceMinutes(10);
} catch (error) {
  caught = error;
}
check("midnight listener errors are rethrown", caught === expectedError);
check("failed midnight changes restore daily flags", JSON.stringify(rollbackGame) === rollbackBefore);
unsubscribe();

const homeGame = makeGame();
homeGame.currentLocationId = homeGame.homeLocationId;
homeGame.setCurrentPlace({ placeId: homeGame.homePlaceId });
let homeScene = buildScene(homeGame);
const lift = findChoice(homeScene, "lift-weights");
check("weightlifting starts available", Boolean(lift));
performChoice(homeGame, { sceneId: homeScene.id, choiceId: lift.id });
check("weightlifting sets its daily flag", homeGame.hasDailyFlag("home_weightlifting"));
homeScene = buildScene(homeGame);
check("weightlifting is hidden after use that day", !findChoice(homeScene, "lift-weights"));
homeGame.jumpToDate(new Date("2026-08-25T00:00:00.000Z"));
homeScene = buildScene(homeGame);
check("weightlifting returns after midnight", Boolean(findChoice(homeScene, "lift-weights")));

const crossingActionGame = makeGame(new Date("2026-08-24T23:58:00.000Z"));
crossingActionGame.currentLocationId = crossingActionGame.homeLocationId;
crossingActionGame.setCurrentPlace({ placeId: crossingActionGame.homePlaceId });
let crossingScene = buildScene(crossingActionGame);
const crossingLift = findChoice(crossingScene, "lift-weights");
performChoice(crossingActionGame, {
  sceneId: crossingScene.id,
  choiceId: crossingLift.id,
});
crossingScene = buildScene(crossingActionGame);
check(
  "an action that crosses midnight belongs to the previous day",
  crossingActionGame.now.toISOString() === "2026-08-25T00:03:00.000Z" &&
    !crossingActionGame.hasDailyFlag("home_weightlifting") &&
    Boolean(findChoice(crossingScene, "lift-weights")),
);

console.log("All daily flag tests passed.");
