import test from "node:test";
import assert from "node:assert/strict";

import {
  createFeatureCatalog,
  defineFeature,
} from "../src/features/catalog.js";
import { DEFAULT_FEATURE_CATALOG } from "../src/features/index.js";
import { PLACE_REGISTRY } from "../src/world/data/place.js";
import { Game } from "../src/game/game.js";
import { collectReminders } from "../src/game/reminders.js";

test("the default catalog composes each special system through feature registrations", () => {
  const features = DEFAULT_FEATURE_CATALOG;

  assert.deepEqual(features.features.map((feature) => feature.id), [
    "bus",
    "cinema",
    "encounter",
    "journal",
    "school",
    "rent",
  ]);
  assert.equal(typeof features.getActionHandler("bus.travel"), "function");
  assert.equal(typeof features.getActionHandler("cinema.remind"), "function");
  assert.equal(typeof features.getActionHandler("cinema.watch"), "function");
  assert.ok(features.getWGSystem("encounter.physical"));
  assert.ok(features.getWGSystem("journal.diary"));
  assert.ok(features.getWGSystem("school.quiz"));
  assert.ok(features.getWGSystem("school.timetable"));
  assert.ok(features.getStoryBehavior("school.class"));
  assert.deepEqual(features.stateDefinitions.map((definition) => definition.id), [
    "cinema",
    "encounter",
    "school",
  ]);
  assert.ok(features.timerDefinitions["rent.weekly"]);
  assert.ok(features.getSkillCheckTargetDefinition("grade", "english"));
  assert.equal(typeof features.getWGEffectHandler("grade"), "function");
  assert.equal(typeof features.getWGEffectHandler("attendance"), "function");
  assert.deepEqual(
    features.placeDefinitions.map((definition) => definition.key),
    ["bus_stop", "high_school"],
  );
  assert.deepEqual(
    features.placeRegistry.slice(PLACE_REGISTRY.length),
    features.placeDefinitions,
  );

  const game = new Game({
    seed: 4401,
    startDate: new Date("2026-09-03T08:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  assert.ok(features.createWGContext(game).school);
  assert.ok(game.featureState.school);
  assert.deepEqual(game.featureState.cinema, { screeningReminders: [] });
  assert.deepEqual(game.featureState.encounter, { postCombatFatigue: null });
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

test("game world generation and save loading use the active feature place registry", () => {
  const noFeatures = createFeatureCatalog([]);
  const emptyGame = new Game({
    features: noFeatures,
    seed: 4402,
    startDate: new Date("2026-09-03T08:00:00.000Z"),
    playerOptions: { startPlaceId: null },
    npcTemplates: [],
  });
  assert.equal(emptyGame.world.findFirstPlaceByKey("bus_stop"), null);
  assert.equal(emptyGame.world.findFirstPlaceByKey("high_school"), null);
  assert.doesNotThrow(() => Game.fromJSON(emptyGame.toJSON(), { features: noFeatures }));

  const defaultGame = new Game({
    seed: 4404,
    startDate: new Date("2026-09-03T08:00:00.000Z"),
    playerOptions: { startPlaceId: null },
    npcTemplates: [],
  });
  assert.throws(
    () => Game.fromJSON(defaultGame.toJSON(), { features: noFeatures }),
    /place key '(?:bus_stop|high_school)'.*not registered by the active feature catalog/,
  );

  const customFeatures = createFeatureCatalog([{
    id: "custom",
    placeDefinitions: [{
      key: "custom_lab",
      label: "Custom Lab",
      props: { category: ["service"] },
      unlocked: true,
    }],
  }]);
  const customGame = new Game({
    features: customFeatures,
    seed: 4403,
    startDate: new Date("2026-09-03T08:00:00.000Z"),
    playerOptions: { startPlaceId: null },
    npcTemplates: [],
  });
  assert.ok(customGame.world.findFirstPlaceByKey("custom_lab"));
  assert.equal(customGame.world.findFirstPlaceByKey("bus_stop"), null);
  assert.doesNotThrow(() =>
    Game.fromJSON(customGame.toJSON(), { features: customFeatures }),
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

  assert.throws(
    () => createFeatureCatalog([
      defineFeature({ id: "invalid", timeChangeHandlers: ["not-a-function"] }),
    ]),
    /time change handlers must be functions/,
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

test("feature composition rejects malformed timer definitions at registration", () => {
  assert.throws(
    () => createFeatureCatalog([{
      id: "broken",
      timerDefinitions: {
        "broken.timer": {
          schedule: { kind: "interval", hours: 1 },
          repeat: false,
        },
      },
    }]),
    /invalid timer 'broken\.timer'.*requires exactly one of effects or an onDue callback/,
  );

  assert.throws(
    () => createFeatureCatalog([{
      id: "broken",
      timerDefinitions: {
        "broken.timer": {
          schedule: { kind: "interval", hours: 0 },
          repeat: true,
          onDue() {},
        },
      },
    }]),
    /invalid timer 'broken\.timer'.*requires positive hours/,
  );
});


test("feature composition validates WG system and story behavior contracts at registration", () => {
  assert.throws(
    () => createFeatureCatalog([{
      id: "broken",
      wgSystems: {
        "broken.system": { render() {}, act() {} },
      },
    }]),
    /WG system 'broken\.system' create must be a function/,
  );

  assert.throws(
    () => createFeatureCatalog([{
      id: "broken",
      wgSystems: {
        "broken.system": {
          create() {},
          render() {},
          act() {},
          validateState: true,
        },
      },
    }]),
    /WG system 'broken\.system' validateState must be a function when provided/,
  );

  assert.throws(
    () => createFeatureCatalog([{
      id: "broken",
      storyBehaviors: { "broken.behavior": {} },
    }]),
    /story behavior 'broken\.behavior' enter must be a function/,
  );

  assert.throws(
    () => createFeatureCatalog([{
      id: "broken",
      storyBehaviors: {
        "broken.behavior": { enter() {}, validateDefinition: "invalid" },
      },
    }]),
    /story behavior 'broken\.behavior' validateDefinition must be a function when provided/,
  );
});

test("feature composition validates automatic reminder contracts at registration", () => {
  const reminder = {
    id: "system:test-reminder",
    group: "today",
    priority: 10,
    tone: "info",
    text: () => "Test reminder",
  };
  const catalog = createFeatureCatalog([{ id: "valid", automaticReminders: [reminder] }]);
  assert.equal(catalog.automaticReminders[0].id, reminder.id);

  for (const [change, expected] of [
    [{ id: 7 }, /requires a non-empty string id/],
    [{ tone: "purple" }, /tone must be 'info' or 'warning'/],
    [{ group: "later" }, /group must be 'today' or 'todo'/],
    [{ priority: Number.NaN }, /priority must be a finite number/],
    [{ text: "not-a-function" }, /text must be a function/],
  ]) {
    assert.throws(
      () => createFeatureCatalog([{
        id: "broken",
        automaticReminders: [{ ...reminder, ...change }],
      }]),
      expected,
    );
  }
});

test("automatic reminder text callbacks cannot produce unsaveable reminder data", () => {
  const features = createFeatureCatalog([{
    id: "broken",
    automaticReminders: [{
      id: "system:broken-reminder",
      group: "today",
      priority: 10,
      tone: "info",
      text: () => ({ invalid: true }),
    }],
  }]);

  assert.throws(
    () => collectReminders({ reminders: new Set(), features, now: new Date(0) }),
    /text\(\) must return null or a non-empty string/,
  );
});
