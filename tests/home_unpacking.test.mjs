import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";

function placePlayerAtHome(game) {
  for (const location of game.world.locations.values()) {
    const place = (location.places || []).find(
      (candidate) => candidate.key === "player_home",
    );
    if (!place) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(place.id) });
    return;
  }
  throw new Error("The generated world has no player home");
}

function choices(scene) {
  return scene.sections.flatMap((section) => section.choices);
}

function choiceWithLabel(scene, label) {
  return choices(scene).find((choice) => choice.label === label);
}

function choose(game, label) {
  const scene = buildScene(game);
  const choice = choiceWithLabel(scene, label);
  assert.ok(choice, `Expected choice '${label}' in '${scene.id}'`);
  performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

function finishUnpackingStep(game) {
  choose(game, "Finish for now");
}

test("unpacking advances in thirty-minute stages and reveals home activities", () => {
  const game = new Game({
    seed: 9021,
    startDate: new Date("2026-09-03T04:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  game.setFlag("opening_seen");
  placePlayerAtHome(game);

  let home = buildScene(game);
  assert.equal(game.story.home, undefined);
  assert.ok(choiceWithLabel(home, "Unpack"));
  assert.ok(choiceWithLabel(home, "Go to Bed"));
  assert.equal(choiceWithLabel(home, "Take a shower"), undefined);
  assert.equal(choiceWithLabel(home, "Choose an outfit"), undefined);

  const startedAt = game.now.getTime();
  choose(game, "Unpack");
  assert.equal(game.story.home.unpack, 1);
  assert.equal(game.now.getTime() - startedAt, 30 * 60_000);
  assert.match(JSON.stringify(buildScene(game).content), /little more space/);
  finishUnpackingStep(game);

  choose(game, "Unpack");
  assert.equal(game.story.home.unpack, 2);
  assert.match(JSON.stringify(buildScene(game).content), /bathroom boxes/);
  finishUnpackingStep(game);
  home = buildScene(game);
  assert.ok(choiceWithLabel(home, "Take a shower"));
  assert.ok(choiceWithLabel(home, "Brush your teeth"));

  while (game.story.home.unpack < 5) {
    choose(game, "Unpack");
    finishUnpackingStep(game);
  }
  home = buildScene(game);
  assert.ok(choiceWithLabel(home, "Choose an outfit"));
  assert.ok(choiceWithLabel(home, "Sit down with your diary"));

  while (game.story.home.unpack < 10) {
    choose(game, "Unpack");
    finishUnpackingStep(game);
  }
  home = buildScene(game);
  assert.ok(choiceWithLabel(home, "Go to Bed"));
  choose(game, "Go to Bed");
  assert.match(JSON.stringify(buildScene(game).content), /bed assembled/);
  choose(game, "Leave");

  while (game.story.home.unpack < 15) {
    choose(game, "Unpack");
    finishUnpackingStep(game);
  }
  assert.ok(choiceWithLabel(buildScene(game), "Invite someone over"));

  while (game.story.home.unpack < 19) {
    choose(game, "Unpack");
    finishUnpackingStep(game);
  }
  assert.ok(choiceWithLabel(buildScene(game), "Unpack the last boxes"));
  choose(game, "Unpack the last boxes");
  assert.equal(game.story.home.unpack, 20);
  assert.equal(game.hasFlag("quest_receptacle_start"), true);
  assert.match(JSON.stringify(buildScene(game).content), /strange receptacle/);
  finishUnpackingStep(game);

  home = buildScene(game);
  assert.equal(choiceWithLabel(home, "Unpack"), undefined);
  assert.equal(choiceWithLabel(home, "Unpack the last boxes"), undefined);
  assert.ok(choiceWithLabel(home, "Examine the strange receptacle"));
});

test("unpacking progress and the receptacle discovery survive saving", () => {
  const game = new Game({ seed: 9022 });
  game.story.home = { unpack: 20 };
  game.setFlag("quest_receptacle_start");

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));

  assert.deepEqual(restored.story.home, { unpack: 20 });
  assert.equal(restored.hasFlag("quest_receptacle_start"), true);
});
