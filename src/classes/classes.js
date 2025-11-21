import * as player from "./player/player.js";
import * as world from "./world/world.js";
import * as npc from "./npc/npc.js";
import * as game from "./game/game.js"
import { NPCScheduler } from "./game/util/npcai.js";

export * from "./player/player.js";
export * from "./world/world.js";
export * from "./npc/npc.js";
export * from "./game/game.js"

if (debug) {
  Object.assign(window, {
    ...player, // exposes Player, Gender, etc.
    ...world,
    ...npc,
    ...game,
    NPCScheduler
  });
}
