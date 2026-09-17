import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const GENERIC_FILES = [
  "../src/game/scene/sceneEngine.js",
  "../src/game/scene/choiceEngine.js",
  "../src/game/scene/skillChecks.js",
  "../src/game/scene/phoneView.js",
  "../src/game/debugCommands.js",
  "../src/characters/player/player.js",
  "../src/characters/player/saveValidation.js",
  "../src/characters/npc/npcs.js",
  "../src/ui/browser/app.js",
  "../src/characters/npc/npcBrain.js",
  "../src/story/wg/runtime/effectRuntime.js",
  "../src/story/wg/runtime/storySystemRegistry.js",
  "../tools/wg/compiler/sourceParser.js",
];

const CONCRETE_FEATURE_MARKERS = [
  /transit\.bus/,
  /bus_stop/,
  /high_school/,
  /school\.class/,
  /school\.quiz/,
  /rent\.weekly/,
  /features[\\/]bus/,
  /features[\\/]school/,
  /features[\\/]rent/,
];

test("generic scene and WG infrastructure contains no concrete feature knowledge", async () => {
  for (const relativePath of GENERIC_FILES) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    for (const marker of CONCRETE_FEATURE_MARKERS) {
      assert.doesNotMatch(source, marker, `${relativePath} contains ${marker}`);
    }
  }
});

test("old cross-cutting feature paths were removed rather than kept as aliases", async () => {
  const removedPaths = [
    "../src/game/busTransit.js",
    "../src/game/timerDefinitions.js",
    "../src/features/placeContributions.js",
    "../src/story/systems/schoolQuiz/system.js",
    "../src/characters/player/education.js",
    "../src/characters/player/schedule.js",
    "../story/places/civic-transport.wg",
    "../story/events/school-class.wg",
  ];

  for (const relativePath of removedPaths) {
    await assert.rejects(access(new URL(relativePath, import.meta.url)));
  }
});

test("the core place registry does not statically compose feature places", async () => {
  const source = await readFile(
    new URL("../src/world/data/place.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /features[\/]/);
  assert.doesNotMatch(source, /bus_stop|high_school/);
});


async function collectJavaScriptFiles(directoryUrl) {
  const files = [];
  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    const childUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directoryUrl);
    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(childUrl));
    } else if (entry.name.endsWith(".js")) {
      files.push(childUrl);
    }
  }
  return files;
}

test("browser UI imports no concrete feature implementations", async () => {
  const browserFiles = await collectJavaScriptFiles(
    new URL("../src/ui/browser/", import.meta.url),
  );
  for (const fileUrl of browserFiles) {
    const source = await readFile(fileUrl, "utf8");
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\s*\()\s*["'][^"']*features[\/]/,
      `${fileUrl.pathname} imports a concrete feature`,
    );
  }
});

test("browser debug markup exposes generic feature contribution slots", async () => {
  const source = await readFile(new URL("../play.html", import.meta.url), "utf8");
  assert.match(source, /id="debug-feature-actions"/);
  assert.match(source, /id="debug-feature-sections"/);
  assert.doesNotMatch(
    source,
    /debug-(?:teleport-(?:school|cinema|alley)|encounter)/,
  );
});
