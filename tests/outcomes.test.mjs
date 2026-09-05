import test from "node:test";
import assert from "node:assert/strict";

import {
  OUTCOME,
  parseOutcomeText,
} from "../src/ui/browser/outcomes.js";

test("good is the only author-facing marker for the very-good outcome", () => {
  assert.deepEqual(parseOutcomeText("[good]Great[/good]"), [
    { text: "Great", outcome: OUTCOME.VERY_GOOD },
  ]);
  assert.deepEqual(parseOutcomeText("[very-good]Great[/very-good]"), [
    { text: "[very-good]Great[/very-good]", outcome: null },
  ]);
});
