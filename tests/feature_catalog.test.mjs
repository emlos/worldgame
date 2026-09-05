import test from "node:test";
import assert from "node:assert/strict";

import {
  createFeatureCatalog,
  defineFeature,
} from "../src/features/catalog.js";
import { DEFAULT_FEATURE_CATALOG } from "../src/features/index.js";
import { FEATURE_PLACE_DEFINITIONS } from "../src/features/placeContributions.js";
import { Game } from "../src/game/game.js";

test("the default catalog composes each special system through feature registrations", () => {
  const features = DEFAULT_FEATURE_CATALOG;

  assert.deepEqual(features.features.map((feature) => feature.id), [
    "bus",
    "school",
    "rent",
  ]);
  assert.equal(typeof features.getActionHandler("bus.travel"), "function");
  assert.ok(features.getWGSystem("school.quiz"));
  assert.ok(features.getStoryBehavior("school.class"));
  assert.ok(features.timerDefinitions["rent.weekly"]);
  assert.ok(features.getSkillCheckTargetDefinition("grade", "english"));
  assert.equal(typeof features.getWGEffectHandler("grade"), "function");
  assert.equal(typeof features.getWGEffectHandler("attendance"), "function");
  assert.deepEqual(
    features.placeDefinitions.map((definition) => definition.key),
    ["bus_stop", "high_school"],
  );
  assert.deepEqual(features.placeDefinitions, FEATURE_PLACE_DEFINITIONS);

  const game = new Game({
    seed: 4401,
    startDate: new Date("2026-09-03T08:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  assert.ok(features.createWGContext(game).school);
  assert.equal(
    features.matchesNPCScheduleConditions(
      game,
      { schoolDay: true },
      { date: game.now },
    ),
    true,
  );
  assert.deepEqual(
    features.buildPlayerStatsSections(game).map((section) => section.id),
    ["school-grades"],
  );
});

test("feature composition rejects ambiguous ownership", () => {
  const handler = () => {};
  assert.throws(
    () => createFeatureCatalog([
      defineFeature({ id: "first", actionHandlers: { "custom.run": handler } }),
      defineFeature({ id: "second", actionHandlers: { "custom.run": handler } }),
    ]),
    /duplicate action handler 'custom\.run'/,
  );

  assert.throws(
    () => createFeatureCatalog([
      defineFeature({ id: "first", placeDefinitions: [{ key: "custom_place" }] }),
      defineFeature({ id: "second", placeDefinitions: [{ key: "custom_place" }] }),
    ]),
    /duplicate feature place definition 'custom_place'/,
  );
});

test("scene decorators run in enabled-feature order", () => {
  const decorate = (suffix) => ({
    id: suffix,
    applies: () => true,
    decorate: ({ scene }) => ({ ...scene, trace: [...(scene.trace ?? []), suffix] }),
  });
  const catalog = createFeatureCatalog([
    defineFeature({ id: "first", sceneDecorators: [decorate("one")] }),
    defineFeature({ id: "second", sceneDecorators: [decorate("two")] }),
  ]);

  assert.deepEqual(catalog.decorateScene({}, { trace: [] }).trace, ["one", "two"]);
});
