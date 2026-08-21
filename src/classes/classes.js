import * as player from "./player/player.js";
import * as world from "./world/world.js";
import * as npc from "./npc/npc.js";
import * as npcBrain from "./npc/npcBrain.js";
import * as game from "./game/game.js";

export * from "./player/player.js";
export * from "./world/world.js";
export * from "./npc/npc.js";
export * from "./npc/npcBrain.js";
export * from "./game/game.js";

if (debug) {
    Object.assign(window, {
        ...player, // exposes Player, Gender, etc.
        ...world,
        ...npc,
        ...npcBrain,
        ...game,
    });
}
