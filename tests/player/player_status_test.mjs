import { Game } from "../../src/classes/game/game.js";
import { Player } from "../../src/classes/player/player.js";
import {
  INITIAL_PLAYER_AGE,
  INITIAL_PLAYER_MONEY,
  INITIAL_PLAYER_TEMPERATURE,
  STATS,
} from "../../src/data/player/stats.js";

function check(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const player = new Player();

check("money starts at zero", player.money === INITIAL_PLAYER_MONEY && player.money === 0);
check("age starts at eighteen", player.age === INITIAL_PLAYER_AGE && player.age === 18);
check(
  "temperature starts comfortable",
  player.temperature === INITIAL_PLAYER_TEMPERATURE && player.temperature === "comfortable",
);
check(
  "every configured player stat is initialized",
  Object.entries(STATS).every(
    ([name, definition]) => player.getStatBase(name) === definition.initial,
  ),
);
check(
  "health is derived instead of separately stored",
  !("health" in player.stats) && player.getStatValue("health") === 100,
);

const maximumBodyHealth = player.body.getMaximumHealth();
player.applyDamageToPart({ partId: "head", amount: 10 });
check(
  "player health pools all body-part health",
  player.getStatValue("health") ===
    ((maximumBodyHealth - 10) / maximumBodyHealth) * 100,
);

const game = new Game({ seed: 812 });
game.player.money = 27.5;
game.player.temperature = "cold";
game.player.setStatBase("energy", 42);
const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));

check("money survives save and load", restored.player.money === 27.5);
check("temperature comfort survives save and load", restored.player.temperature === "cold");
check("dynamic player stats survive save and load", restored.player.getStatBase("energy") === 42);

const agingGame = new Game({
  seed: 813,
  startDate: new Date("2026-08-24T08:00:00.000Z"),
  npcTemplates: [],
});
check("new games anchor the player at age eighteen", agingGame.player.age === 18);
agingGame.jumpToDate("2027-08-24T07:59:00.000Z");
check("age does not change before the annual anniversary", agingGame.player.age === 18);
agingGame.jumpToDate("2027-08-24T08:00:00.000Z");
check("age increments on the annual anniversary", agingGame.player.age === 19);
agingGame.jumpToDate("2026-08-24T08:00:00.000Z");
check("age remains coherent after a backward resync", agingGame.player.age === 18);
const restoredAgingGame = Game.fromJSON(JSON.parse(JSON.stringify(agingGame)));
check(
  "age and birth date survive save and load",
  restoredAgingGame.player.age === 18 &&
    restoredAgingGame.player.birthDate === agingGame.player.birthDate,
);
