import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../src/story/wg/runtime/sceneExposure.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../src/story/wg/runtime/storyRuntime.js";

const FIXED_START = new Date("2026-09-11T20:00:00.000Z");

function gameAtStart() {
  return new Game({
    seed: 117,
    startDate: FIXED_START,
    playerOptions: { startPlaceId: null },
  });
}

function choices(scene) {
  return scene.sections.flatMap((section) => section.choices);
}

function choose(game, choiceId) {
  const scene = buildScene(game);
  const choice = choices(scene).find(({ id }) => id === choiceId);
  assert.ok(choice, `expected choice '${choiceId}'`);
  performChoice(game, { sceneId: scene.id, choiceId: choice.id });
  return choice;
}

function contentText(scene) {
  return JSON.stringify(scene.content);
}

function placePlayerAtAlley(game) {
  for (const location of game.world.locations.values()) {
    const alley = location.places.find(({ key }) => key === "alleyway");
    if (!alley) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(alley.id) });
    return alley;
  }
  throw new Error("Test world has no alleyway");
}

test("the alley screen spike renders the three fixed encounter states", () => {
  const game = gameAtStart();
  enterWGScene(game, "encounter.alley-mugging");
  resolveActiveWGStory(game);

  const actor = game.currentStory.actors.mugger;
  assert.equal(actor.profileId, "civilian");
  assert.deepEqual(game.currentStory.system.state, {
    version: 1,
    scenarioId: "alley-mugging",
    sampleId: "at-reach",
    lastPreviewActionId: null,
  });

  let scene = buildScene(game);
  assert.equal(scene.heading, "Cornered");
  assert.match(contentText(scene), /Standing at arm's reach/);
  assert.match(contentText(scene), /trying to get at your money/);
  assert.match(contentText(scene), new RegExp(actor.title));
  assert.equal(scene.content.find(({ type }) => type === "table").caption, "Current situation");
  assert.equal(scene.sections[0].choices.length, 4);
  assert.equal(scene.sections[1].choices.length, 2);

  choose(game, "encounter-preview:next-sample");
  scene = buildScene(game);
  assert.equal(game.currentStory.system.state.sampleId, "wrist-held-at-wall");
  assert.match(contentText(scene), /right wrist held/);
  assert.match(contentText(scene), /back to the wall/);
  assert.equal(scene.sections[0].choices.length, 5);

  choose(game, "encounter-preview:next-sample");
  scene = buildScene(game);
  assert.equal(game.currentStory.system.state.sampleId, "grounded");
  assert.match(contentText(scene), /On your back/);
  assert.match(contentText(scene), /left forearm pinned/);
  assert.equal(scene.sections[0].choices.length, 5);

  choose(game, "encounter-preview:next-sample");
  assert.equal(game.currentStory.system.state.sampleId, "at-reach");
});

test("preview actions display seconds without resolving combat state", () => {
  const game = gameAtStart();
  enterWGScene(game, "encounter.alley-mugging");
  resolveActiveWGStory(game);

  const playerBodyBefore = game.player.body.toJSON();
  const actorBodyBefore = structuredClone(game.currentStory.actors.mugger.body);
  const moneyBefore = game.player.money;
  const timeBefore = game.now.getTime();
  const choice = choose(game, "encounter-preview:guard");

  assert.equal(choice.durationMinutes, 1 / 60);
  assert.equal(game.now.getTime() - timeBefore, 1_000);
  assert.equal(game.currentStory.system.state.lastPreviewActionId, "guard");
  assert.deepEqual(game.player.body.toJSON(), playerBodyBefore);
  assert.deepEqual(game.currentStory.actors.mugger.body, actorBodyBefore);
  assert.equal(game.player.money, moneyBefore);
  assert.match(contentText(buildScene(game)), /Milestone 0 does not resolve combat actions/);
});

test("the screen spike survives save/load and can be left", () => {
  const game = gameAtStart();
  enterWGScene(game, "encounter.alley-mugging");
  resolveActiveWGStory(game);
  choose(game, "encounter-preview:next-sample");

  const before = buildScene(game);
  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  const after = buildScene(restored);

  assert.deepEqual(after.content, before.content);
  assert.deepEqual(after.sections, before.sections);
  choose(restored, "encounter-preview:finish");
  assert.equal(restored.currentStory, null);
});

test("entering an alley automatically opens the screen spike", () => {
  const game = gameAtStart();
  placePlayerAtAlley(game);

  const entered = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);

  assert.equal(entered?.id, "encounter.alley-mugging");
  assert.equal(game.currentStory?.system?.id, "encounter.physical");
  assert.ok(game.currentStory?.actors?.mugger);
  assert.match(contentText(buildScene(game)), /Current situation/);
});
