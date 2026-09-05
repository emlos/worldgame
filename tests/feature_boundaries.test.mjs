import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const GENERIC_FILES = [
  "../src/game/scene/sceneEngine.js",
  "../src/game/scene/choiceEngine.js",
  "../src/game/scene/skillChecks.js",
  "../src/game/scene/phoneView.js",
  "../src/game/debugCommands.js",
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
    "../src/story/systems/schoolQuiz/system.js",
    "../src/characters/player/education.js",
    "../src/characters/player/schedule.js",
    "../story/places/civic-transport.wg",
    "../story/places/school.wg",
    "../story/events/school-class.wg",
  ];

  for (const relativePath of removedPaths) {
    await assert.rejects(access(new URL(relativePath, import.meta.url)));
  }
});

test("the shared place registry composes feature places without naming them", async () => {
  const source = await readFile(
    new URL("../src/world/data/place.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /FEATURE_PLACE_DEFINITIONS/);
  assert.doesNotMatch(source, /bus_stop|high_school/);
});
