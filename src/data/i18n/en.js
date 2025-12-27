import * as common from "./en/common.js";
import * as test from "./en/test.js";
import * as sample from "./en/sample.js";
import * as traversal from "./en/traversal.js";

export const STRINGS_EN = {
    ...common.COMMON,
    ...test.SCENES,
    ...test.CHOICES,
    ...traversal.SCENES,
    ...traversal.CHOICES,
    ...sample.SCENES,
    ...sample.CHOICES,
};
