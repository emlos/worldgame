import * as skill from "./util/skill.js";

export * from "./util/skill.js";

if (debug) {
  Object.assign(window, {
    ...skill,
  });
}
