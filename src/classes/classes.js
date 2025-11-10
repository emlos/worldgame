import * as player from "./player/player.js";
import * as world from "./world/world.js";
import * as npc from "./npc/npc.js";

export * from "./player/player.js";
export * from "./world/world.js";
export * from "./npc/npc.js";

if (debug) {
  Object.assign(window, {
    ...player, // exposes Player, Gender, etc.
    ...world,
    ...npc,
  });
}
