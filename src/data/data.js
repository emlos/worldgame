import * as time from "./world/time.js";
import * as calendar from "./world/calendar.js";
import * as location from "./world/location.js";
import * as moon from "./world/moon.js";
import * as place from "./world/place.js";
import * as street from "./world/street.js";
import * as weather from "./world/weather.js";

import * as npc from "./npc/npcs.js";

export * from "./world/time.js";
export * from "./world/calendar.js";
export * from "./world/location.js";
export * from "./world/moon.js";
export * from "./world/place.js";
export * from "./world/street.js";
export * from "./world/weather.js";

export * from "./npc/npcs.js";

if (debug) {
    Object.assign(window, {
        ...calendar,
        ...location,
        ...moon,
        ...place,
        ...time,
        ...street,
        ...weather,

        ...npc,
    });
}
