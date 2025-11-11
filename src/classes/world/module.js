import * as calendar from "./util/calendar.js";
import * as map from "./util/map.js";
import * as time from "./util/time.js";
import * as weather from "./util/weather.js";
import * as enums from "./util/enums.js"


export * from "./util/calendar.js";
export * from "./util/map.js";
export * from "./util/time.js";
export * from "./util/weather.js";
export * from "./util/enums.js"


if (debug) {
  Object.assign(window, {
    ...calendar,
    ...map,
    ...time,
    ...weather,
    ...enums
  });
}
