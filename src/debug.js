// Debug-only browser bootstrap.
//
// Production modules import their dependencies directly and never depend on
// this file. Test/docs pages can load it with `debug = true` to expose the
// project API on window for console use and legacy non-module helper scripts.

import * as clothing from "./shared/classes/clothing.js";
import * as pronouns from "./shared/classes/pronouns.js";
import * as relationship from "./shared/classes/relationship.js";
import * as stat from "./shared/classes/stat.js";
import * as body from "./shared/classes/body.js";
import * as flags from "./shared/classes/flags.js";
import * as color from "./shared/util/color.js";
import * as util from "./shared/util/util.js";
import * as random from "./shared/util/random.js";
import * as date from "./shared/util/date.js";

import * as skill from "./classes/player/util/skill.js";
import * as player from "./classes/player/player.js";
import * as npc from "./classes/npc/npc.js";
import * as npcBrain from "./classes/npc/npcBrain.js";
import * as world from "./classes/world/world.js";
import * as calendarClass from "./classes/world/util/calendar.js";
import * as worldMap from "./classes/world/util/worldmap.js";
import * as worldTime from "./classes/world/util/time.js";
import * as weatherClass from "./classes/world/util/weather.js";
import * as moonClass from "./classes/world/util/moon.js";
import * as locationClass from "./classes/world/util/location.js";
import * as placeClass from "./classes/world/util/place.js";
import * as streetClass from "./classes/world/util/street.js";
import * as game from "./classes/game/game.js";

import * as timeData from "./data/world/time.js";
import * as calendarData from "./data/world/calendar.js";
import * as locationData from "./data/world/location.js";
import * as moonData from "./data/world/moon.js";
import * as placeData from "./data/world/place.js";
import * as streetData from "./data/world/street.js";
import * as weatherData from "./data/world/weather.js";
import * as behaviorData from "./data/npc/behavior.js";
import * as npcData from "./data/npc/npcs.js";

// `debug` is intentionally supplied by the embedding HTML page.
// @ts-ignore
if (typeof debug !== "undefined" && debug) {
    Object.assign(window, {
        ...clothing,
        ...pronouns,
        ...relationship,
        ...stat,
        ...body,
        ...flags,
        ...color,
        ...util,
        ...random,
        ...date,
        ...skill,
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
    });
}
