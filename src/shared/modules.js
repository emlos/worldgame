import * as clothing from "./classes/clothing.js";
import * as pronouns from "./classes/pronouns.js";
import * as color from "./util/color.js";
import * as util from "./util/util.js";
import * as random from "./util/random.js";

export * from "./classes/clothing.js";
export * from "./classes/pronouns.js";
export * from "./util/color.js";
export * from "./util/util.js";
export * from "./util/random.js";

if (debug) {
  Object.assign(window, {
    ...clothing,
    ...pronouns,
    ...color,
    ...util,
    ...random
  });
}
