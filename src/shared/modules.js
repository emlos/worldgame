import * as clothing from "./classes/clothing.js";
import * as pronouns from "./classes/pronouns.js";
import * as color from "./util/color.js";
import * as util from "./util/util.js";
import * as random from "./util/random.js";
import * as date from "./util/date.js";
import * as relationship from "./classes/relationship.js";
import * as stat from "./classes/stat.js";
import * as trait from "./classes/trait.js";
import * as body from "./classes/body.js";

import * as screenConds from "./scenes/conditions.js";

export * from "./classes/clothing.js";
export * from "./classes/pronouns.js";
export * from "./classes/relationship.js";
export * from "./classes/stat.js";
export * from "./classes/trait.js";
export * from "./util/color.js";
export * from "./util/util.js";
export * from "./util/random.js";
export * from "./util/date.js";
export * from "./classes/body.js";

export * from "./scenes/conditions.js";

if (debug) {
    Object.assign(window, {
        ...clothing,
        ...pronouns,
        ...color,
        ...util,
        ...random,
        ...stat,
        ...trait,
        ...relationship,
        ...body,
        ...date,

        ...screenConds
    });
}
