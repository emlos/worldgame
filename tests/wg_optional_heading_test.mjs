import assert from "node:assert/strict";

import { createScene } from "../src/classes/game/scene/sceneContract.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const compiled = compileStorySources([{
  file: "story/tests/optional-heading.wg",
  source: `
:: test.headingless-scene
This scene has no page heading.

@choice leave "Leave" -> @exit
@endchoice

@sequence test.headingless-sequence -> @exit
This sequence has no page heading.
@next "Done"
@endsequence
`,
}]);

assert.equal(compiled.formatVersion, 16);
assert.equal(compiled.scenes["test.headingless-scene"].heading, null);
assert.equal(compiled.sequences["test.headingless-sequence"].heading, null);

function sceneInput(overrides = {}) {
  return {
    id: "test:headingless",
    kind: "event",
    status: {
      now: "2026-08-29T12:00:00.000Z",
      weather: "Clear",
      temperatureC: 20,
    },
    content: [],
    sections: [],
    ...overrides,
  };
}

const headinglessScene = createScene(sceneInput());
assert.equal(headinglessScene.heading, null);
assert.throws(
  () => createScene(sceneInput({ heading: "" })),
  /scene\.heading must be a non-empty string/,
);
assert.throws(
  () => compileStorySources([{
    file: "story/tests/empty-heading.wg",
    source: `
:: test.empty-heading
@heading ""
Text.
`,
  }]),
  /Scene heading cannot be empty/,
);

console.log("WG optional heading checks passed.");
