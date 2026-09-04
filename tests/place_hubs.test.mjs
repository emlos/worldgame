import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import { getWGPlaceHubScene } from "../src/classes/game/scene/wg/sceneExposure.js";
import { SCENE_ACTION_TYPE } from "../src/data/scene/actions.js";
import { PLACE_LEAVE_MINUTES } from "../src/data/world/travel.js";
import { WG_BUNDLE } from "../src/generated/wg/scenes.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

function placePlayerAt(game, placeKey) {
  for (const location of game.world.locations.values()) {
    const place = (location.places || []).find(
      (candidate) => candidate.key === placeKey,
    );
    if (!place) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(place.id) });
    return place;
  }
  throw new Error(`The generated test world has no '${placeKey}' place`);
}

function createGameInside(placeKey) {
  const game = new Game({
    seed: 7301,
    startDate: new Date("2026-09-03T14:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  return { game, place: placePlayerAt(game, placeKey) };
}

function findChoice(scene, choiceId) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.id === choiceId);
}

test("registered places without WG source use an implicit hub and Leave choice", () => {
  const { game, place } = createGameInside("town_square");

  assert.equal(getWGPlaceHubScene(game), null);
  const scene = buildScene(game);
  const leave = findChoice(scene, "leave");

  assert.equal(scene.kind, "place");
  assert.equal(scene.heading, place.name);
  assert.ok(scene.content.length >= 2);
  assert.ok(leave);
  assert.equal(leave.durationMinutes, PLACE_LEAVE_MINUTES);
  assert.equal(leave.action.type, SCENE_ACTION_TYPE.leave);

  const before = game.now.getTime();
  performChoice(game, { sceneId: scene.id, choiceId: leave.id });

  assert.equal(game.now.getTime() - before, PLACE_LEAVE_MINUTES * 60_000);
  assert.equal(game.currentPlace, null);
  assert.equal(game.currentStory, null);
  assert.equal(buildScene(game).kind, "location");
});

test("leaving can enter an automatic scene selected against the departed place", () => {
  const { game } = createGameInside("town_square");
  const event = WG_BUNDLE.scenes["home.random.forgotten-mug"];
  const previous = {
    automaticTriggers: event.automaticTriggers,
    placeKeys: event.placeKeys,
    conditions: event.conditions,
  };

  try {
    event.automaticTriggers = ["leave-place"];
    event.placeKeys = ["town_square"];
    event.conditions = [];

    const scene = buildScene(game);
    performChoice(game, { sceneId: scene.id, choiceId: "leave" });

    assert.equal(game.currentPlace, null);
    assert.equal(game.currentStory?.id, event.id);
  } finally {
    Object.assign(event, previous);
  }
});

test("@hub implies its place kind and selector, and leave-place is an auto trigger", () => {
  const bundle = compileStorySources([
    {
      file: "tests/implicit-hub.wg",
      source: `:: fixture.cafe-hub
@hub cafe

The cafe has custom content.

:: fixture.after-leaving
@auto leave-place
@place-key cafe

The event runs outside.
`,
    },
  ]);

  assert.equal(bundle.formatVersion, 27);
  assert.equal(bundle.scenes["fixture.cafe-hub"].kind, "place");
  assert.deepEqual(bundle.scenes["fixture.cafe-hub"].placeKeys, ["cafe"]);
  assert.deepEqual(
    bundle.scenes["fixture.after-leaving"].automaticTriggers,
    ["leave-place"],
  );
});

test("authored hubs cannot restate their implicit kind or Leave choice", () => {
  assert.throws(
    () =>
      compileStorySources([
        {
          file: "tests/redundant-hub-kind.wg",
          source: `:: fixture.cafe-hub
@hub cafe
@kind place

The cafe has custom content.
`,
        },
      ]),
    /@kind place is implicit/,
  );

  assert.throws(
    () =>
      compileStorySources([
        {
          file: "tests/redundant-hub-leave.wg",
          source: `:: fixture.cafe-hub
@hub cafe

The cafe has custom content.

@choice leave "Leave" -> @leave-place
@endchoice
`,
        },
      ]),
    /reserved by the implicit place-hub navigation/,
  );

  assert.throws(
    () =>
      compileStorySources([
        {
          file: "tests/orphan-place-kind.wg",
          source: `:: fixture.orphan-place
@kind place

This is not attached to a generated place.
`,
        },
      ]),
    /@kind place is reserved for @hub/,
  );
});
