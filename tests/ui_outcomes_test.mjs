import assert from "node:assert/strict";

import {
  OUTCOME,
  outcomeForRange,
  outcomeForRelationship,
  parseOutcomeText,
} from "../src/ui/browser/outcomes.js";

assert.equal(outcomeForRange(100, 0, 100), OUTCOME.VERY_GOOD);
assert.equal(outcomeForRange(50, 0, 100), OUTCOME.OK);
assert.equal(outcomeForRange(40, 0, 100), OUTCOME.WARNING);
assert.equal(outcomeForRange(25, 0, 100), OUTCOME.BAD);
assert.equal(outcomeForRange(0, 0, 100), OUTCOME.DIRE);

assert.equal(
  outcomeForRange(0, 0, 100, { lowerIsBetter: true }),
  OUTCOME.VERY_GOOD,
  "stress, fear, and trauma should be green when low",
);
assert.equal(
  outcomeForRange(100, 0, 100, { lowerIsBetter: true }),
  OUTCOME.DIRE,
);
assert.equal(outcomeForRelationship(0), OUTCOME.OK);
assert.equal(outcomeForRelationship(0.01), OUTCOME.VERY_GOOD);
assert.equal(outcomeForRelationship(1), OUTCOME.VERY_GOOD);
assert.equal(outcomeForRelationship(-0.1), OUTCOME.WARNING);
assert.equal(outcomeForRelationship(-0.5), OUTCOME.BAD);
assert.equal(outcomeForRelationship(-1), OUTCOME.DIRE);

assert.deepEqual(
  parseOutcomeText(
    "Before [good]great[/good], [warning]careful[/warning], [dire]run[/dire].",
  ),
  [
    { text: "Before ", outcome: null },
    { text: "great", outcome: OUTCOME.VERY_GOOD },
    { text: ", ", outcome: null },
    { text: "careful", outcome: OUTCOME.WARNING },
    { text: ", ", outcome: null },
    { text: "run", outcome: OUTCOME.DIRE },
    { text: ".", outcome: null },
  ],
);
assert.deepEqual(parseOutcomeText("[very-good]Excellent[/very-good]"), [
  { text: "Excellent", outcome: OUTCOME.VERY_GOOD },
]);
assert.deepEqual(parseOutcomeText("[bad]<img src=x onerror=alert(1)>[/bad]"), [
  { text: "<img src=x onerror=alert(1)>", outcome: OUTCOME.BAD },
]);
assert.deepEqual(parseOutcomeText("An [good]unclosed marker"), [
  { text: "An [good]unclosed marker", outcome: null },
]);

console.log("UI outcome palette and passage marker checks passed.");
