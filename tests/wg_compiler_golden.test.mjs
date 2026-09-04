import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { compileProject } from "../tools/wg/compile.mjs";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const FIXTURE_URL = new URL("./fixtures/wg/compiler.golden.wg", import.meta.url);
const GOLDEN_URL = new URL("./fixtures/wg/compiler.golden.json", import.meta.url);
const FIXTURE_FILE = "tests/fixtures/wg/compiler.golden.wg";

function withoutSourceLocations(value) {
  if (Array.isArray(value)) return value.map(withoutSourceLocations);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "source")
      .map(([key, child]) => [key, withoutSourceLocations(child)]),
  );
}

test("representative WG source compiles to the semantic golden bundle", async () => {
  const [source, expectedText] = await Promise.all([
    readFile(FIXTURE_URL, "utf8"),
    readFile(GOLDEN_URL, "utf8"),
  ]);
  const actual = withoutSourceLocations(
    compileStorySources([{ file: FIXTURE_FILE, source }]),
  );

  assert.deepEqual(actual, JSON.parse(expectedText));
});

test("checked-in project WG output is current", async () => {
  await assert.doesNotReject(() => compileProject({ check: true }));
});
