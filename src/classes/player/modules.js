import * as relationship from "./util/relationship.js";
import * as stat from "./util/stat.js";
import * as skill from "./util/skill.js";
import * as trait from "./util/trait.js";

export * from "./util/relationship.js";
export * from "./util/stat.js";
export * from "./util/skill.js";
export * from "./util/trait.js";

if (debug) {
  Object.assign(window, {
    ...relationship,
    ...skill,
    ...stat,
    ...trait,
  });
}
