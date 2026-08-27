import { addDebugMoney } from "../src/classes/game/debugCommands.js";
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

if (failures.length > 0) {
  console.error(`\n${failures.length} debug command test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All game debug command tests passed.");
}
