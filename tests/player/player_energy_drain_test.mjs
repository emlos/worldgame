import { Game } from "../../src/classes/game/game.js";
import { PLAYER_ENERGY_DRAIN_PER_MINUTE } from "../../src/data/player/stats.js";

const START = new Date("2026-08-24T08:00:00.000Z");

function makeGame() {
  return new Game({ seed: 117, startDate: START, npcTemplates: [] });
}

function check(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

check(
  "the passive energy drain is configured as 0.1 per minute",
  PLAYER_ENERGY_DRAIN_PER_MINUTE === 0.1,
);

const minuteGame = makeGame();
minuteGame.advanceMinutes(1);
check("one elapsed minute drains 0.1 energy", minuteGame.player.getStatBase("energy") === 99.9);

const hourGame = makeGame();
hourGame.advanceMinutes(60);
check("one elapsed hour drains 6 energy", hourGame.player.getStatBase("energy") === 94);

const twelveHourGame = makeGame();
twelveHourGame.advanceMinutes(12 * 60);
check("twelve elapsed hours drain 72 energy", twelveHourGame.player.getStatBase("energy") === 28);

const largeStepGame = makeGame();
const minuteStepGame = makeGame();
largeStepGame.advanceMinutes(12 * 60);
for (let minute = 0; minute < 12 * 60; minute += 1) minuteStepGame.advanceMinutes(1);
check(
  "large and minute-sized advances drain exactly the same energy",
  minuteStepGame.player.getStatBase("energy") === largeStepGame.player.getStatBase("energy"),
);

const actionGame = makeGame();
actionGame.runAction({
  label: "Strenuous timed action",
  minutes: 10,
  apply(game) {
    game.player.adjustStatBase("energy", -5);
  },
});
check(
  "action-specific energy costs stack with passive elapsed-time drain",
  actionGame.player.getStatBase("energy") === 94,
);

const depletedGame = makeGame();
depletedGame.player.setStatBase("energy", 0.05);
depletedGame.advanceMinutes(1);
check("passive drain clamps energy at zero", depletedGame.player.getStatBase("energy") === 0);
depletedGame.advanceMinutes(60);
check("further elapsed time cannot make energy negative", depletedGame.player.getStatBase("energy") === 0);

const resyncGame = makeGame();
resyncGame.jumpToDate(new Date(START.getTime() + 60 * 60_000));
check("forward time resync also drains energy", resyncGame.player.getStatBase("energy") === 94);
resyncGame.jumpToDate(START);
check("backward time resync does not restore energy", resyncGame.player.getStatBase("energy") === 94);

const rollbackGame = makeGame();
const rollbackBefore = JSON.stringify(rollbackGame);
const expectedError = new Error("time listener failed");
const unsubscribe = rollbackGame.on("time", () => {
  throw expectedError;
});
let caught = null;
try {
  rollbackGame.advanceMinutes(30);
} catch (error) {
  caught = error;
}
check("time-listener errors are still rethrown", caught === expectedError);
check("failed time changes roll energy back with the clock", JSON.stringify(rollbackGame) === rollbackBefore);
unsubscribe();

console.log("All passive player energy drain tests passed.");
