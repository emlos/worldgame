import * as calendar from "./util/calendar.js";
import * as map from "./util/worldmap.js";
import * as time from "./util/time.js";
import * as weather from "./util/weather.js";
import * as enums from "./util/enums.js"
import * as moon from "./util/moon.js";
import * as location from "./util/location.js";
import * as place from "./util/place.js";
import * as street from "./util/street.js";


export * from "./util/calendar.js";
export * from "./util/worldmap.js";
export * from "./util/time.js";
export * from "./util/weather.js";
export * from "./util/enums.js"
export * from "./util/moon.js";
export * from "./util/location.js";
export * from "./util/place.js";
export * from "./util/street.js";


if (debug) {
  Object.assign(window, {
    ...calendar,
    ...map,
    ...time,
    ...weather,
    ...enums,
    ...moon,
    ...location,
    ...place,
    ...street,
  });
}
