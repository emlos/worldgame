import { Game } from "../../src/classes/game/game.js";
import { Player } from "../../src/classes/player/player.js";
import {
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

const game = new Game({ seed: 812 });
game.player.money = 27.5;
game.player.temperature = "cold";
game.player.setStatBase("energy", 42);
const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));

check("money survives save and load", restored.player.money === 27.5);
check("temperature comfort survives save and load", restored.player.temperature === "cold");
check("dynamic player stats survive save and load", restored.player.getStatBase("energy") === 42);
