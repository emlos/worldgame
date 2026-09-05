// Debug-only browser bootstrap.
//
// Production modules import their dependencies directly and never depend on
// this file. Test/docs pages can load it with `debug = true` to expose the
// project API on window for console use and non-module diagnostic pages.

import * as clothing from "./characters/core/clothing.js";
import * as pronouns from "./characters/core/pronouns.js";
import * as relationship from "./characters/core/relationship.js";
import * as stat from "./characters/core/stat.js";
import * as body from "./characters/core/body.js";
import * as color from "./shared/util/color.js";
import * as util from "./shared/util/util.js";
import * as random from "./shared/util/random.js";
import * as date from "./shared/util/date.js";

import * as player from "./characters/player/player.js";
import * as npc from "./characters/npc/npc.js";
import * as npcBrain from "./characters/npc/npcBrain.js";
import * as world from "./world/world.js";
import * as calendarClass from "./world/model/calendar.js";
import * as worldMap from "./world/model/worldmap.js";
import * as worldTime from "./world/model/time.js";
import * as weatherClass from "./world/model/weather.js";
import * as moonClass from "./world/model/moon.js";
import * as locationClass from "./world/model/location.js";
import * as placeClass from "./world/model/place.js";
import * as streetClass from "./world/model/street.js";
import * as game from "./game/game.js";

import * as timeData from "./world/data/time.js";
import * as calendarData from "./world/data/calendar.js";
import * as locationData from "./world/data/location.js";
import * as moonData from "./world/data/moon.js";
import * as placeData from "./world/data/place.js";
import * as streetData from "./world/data/street.js";
import * as weatherData from "./world/data/weather.js";
import * as behaviorData from "./characters/npc/behavior.js";
import * as npcData from "./characters/npc/npcs.js";
import * as playerData from "./characters/player/stats.js";

// `debug` is intentionally supplied by the embedding HTML page.
// @ts-ignore
if (typeof debug !== "undefined" && debug) {
    Object.assign(window, {
        ...clothing,
        ...pronouns,
        ...relationship,
        ...stat,
        ...body,
        ...color,
        ...util,
        ...random,
        ...date,
        ...player,
        ...npc,
        ...npcBrain,
        ...world,
        ...calendarClass,
        ...worldMap,
        ...worldTime,
        ...weatherClass,
        ...moonClass,
        ...locationClass,
        ...placeClass,
        ...streetClass,
        ...game,
        ...timeData,
        ...calendarData,
        ...locationData,
        ...moonData,
        ...placeData,
        ...streetData,
        ...weatherData,
        ...behaviorData,
        ...npcData,
        ...playerData,
    });
}
