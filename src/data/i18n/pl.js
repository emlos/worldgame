import * as common from "./pl/common.js";
import * as test from "./pl/test.js";
import * as sample from "./pl/sample.js";
import * as traversal from "./pl/traversal.js";

export const STRINGS_PL = {
    ...common.COMMON,
    ...test.SCENES,
    ...test.CHOICES,
    ...traversal.SCENES,
    ...traversal.CHOICES,
    ...sample.SCENES,
    ...sample.CHOICES,
};
