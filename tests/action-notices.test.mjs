import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../src/classes/game/game.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import { CHOICE_ERROR_CODE, performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { enterWGTarget, resolveActiveWGStory } from "../src/classes/game/scene/wg/storyRuntime.js";
import { actWGSystem, registerWGStorySystem } from "../src/classes/game/scene/wg/storySystemRegistry.js";
import { BUS_BOARDING_SCENE_ID, getBusFare, listBusStops } from "../src/classes/game/busTransit.js";
import { WG_BUNDLE } from "../src/generated/wg/scenes.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const fixture = compileStorySources([{
  file: "action-notices.wg",
  source: `
:: test.action-notices [event]
@choice respond "Respond" -> @exit
  @response
    You take a moment to gather your thoughts.
  @endresponse
@endchoice
@choice wait "Wait briefly" -> @exit
  @time 2m
@endchoice

@sequence test.notice-quiz -> @exit
  @system school.quiz {"bank":"math.core","questions":3}
@endsequence
`,
}]);
Object.assign(WG_BUNDLE.scenes, fixture.scenes);
Object.assign(WG_BUNDLE.sequences, fixture.sequences);

function createGame(startDate = "2026-09-01T07:00:00.000Z") {
  return new Game({
    seed: 117,
    startDate: new Date(startDate),
    playerOptions: { startPlaceId: null },
  });
}

function choose(game, predicate) {
  const scene = buildScene(game);
  const choice = scene.sections.flatMap((section) => section.choices).find(predicate);
  assert.ok(choice, "Expected a matching choice in the scene");
  return performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

function enterStory(game, id) {
  enterWGTarget(game, id);
  resolveActiveWGStory(game);
}

function findPlace(game, key) {
  for (const location of game.world.locations.values()) {
    const place = location.places.find((candidate) => candidate.key === key);
    if (place) return { place, location };
  }
  assert.fail(`Missing test place: ${key}`);
}

function moveInside(game, key) {
  const destination = findPlace(game, key);
  game.moveTo(destination.location.id);
  game.setCurrentPlace({ placeId: destination.place.id });
  return destination.place;
}

test("walking changes location without routine arrival text", () => {
  const game = createGame();
  const from = game.currentLocationId;
  const before = game.now.getTime();
  assert.deepEqual(choose(game, (choice) => choice.action.type === "travel"), { notice: "", paragraphs: [] });
  assert.notEqual(game.currentLocationId, from);
  assert.ok(game.now.getTime() > before);
});

test("entering and leaving a place no longer produce routine notices", () => {
  const game = createGame();
  assert.equal(choose(game, (choice) => choice.action.type === "enter" && choice.enabled).notice, "");
  assert.ok(game.currentPlaceId);
  assert.equal(choose(game, (choice) => choice.action.type === "leave").notice, "");
  assert.equal(game.currentPlaceId, null);
});

test("loitering still advances time without a notice", () => {
  const game = createGame();
  const before = game.now.getTime();
  assert.equal(choose(game, (choice) => choice.action.type === "loiter").notice, "");
  assert.ok(game.now.getTime() > before);
});

test("bus travel still charges its fare and moves the player without arrival text", () => {
  const game = createGame();
  const source = listBusStops(game)[0];
  game.moveTo(source.location.id);
  game.setCurrentPlace({ placeId: source.place.id });
  game.player.adjustMoney(100);
  const fare = getBusFare(source.place);
  enterStory(game, BUS_BOARDING_SCENE_ID);
  assert.equal(choose(game, (choice) => choice.action.type === "bus-travel").notice, "");
  assert.notEqual(game.currentPlaceId, source.place.id);
  assert.equal(game.player.money, 100 - fare);
});

test("authored response prose survives without a Continue notice", () => {
  const game = createGame();
  enterStory(game, "test.action-notices");
  assert.deepEqual(choose(game, (choice) => choice.id === "respond"), {
    notice: "",
    paragraphs: ["You take a moment to gather your thoughts."],
  });
});

test("next-passage navigation advances the sequence without a Continue notice", () => {
  const game = createGame();
  enterStory(game, "example.passage-sequence");
  assert.equal(choose(game, (choice) => choice.action.type === "wg-next").notice, "");
  assert.equal(game.currentStory.passageId, "decision");
});

test("skill checks retain their outcome passage without a Continue notice", () => {
  const game = createGame();
  moveInside(game, "player_home");
  assert.equal(choose(game, (choice) => choice.action.type === "skill-check").notice, "");
  assert.ok(["home.jar-opened", "home.jar-stuck"].includes(game.currentStory.id));
  assert.ok(buildScene(game).content.some((block) => block.type === "paragraph"));
});

test("school quiz answers and completion do not emit routine acknowledgements", () => {
  const game = createGame();
  enterStory(game, "test.notice-quiz");
  for (let index = 0; index < 3; index += 1) {
    assert.equal(choose(game, (choice) => choice.action.command?.type === "answer").notice, "");
    assert.equal(game.currentStory.system.state.answers.length, index + 1);
  }
  assert.equal(game.currentStory.system.state.complete, true);
  assert.equal(choose(game, (choice) => choice.action.command?.type === "finish").notice, "");
});

test("closing-time ejection still explains why the player was sent outside", () => {
  const probe = createGame("2026-09-01T12:00:00.000Z");
  const closingTime = findPlace(probe, "high_school").place.getClosingTime(probe.now);
  assert.ok(closingTime);
  const game = createGame(new Date(closingTime.getTime() - 60_000));
  const school = moveInside(game, "high_school");
  enterStory(game, "test.action-notices");
  const result = choose(game, (choice) => choice.id === "wait");
  assert.equal(result.notice, `${school.name} has closed. A member of staff ushers you outside.`);
  assert.equal(game.currentPlaceId, null);
});

test("system notices are empty by default but explicit important notices survive", () => {
  registerWGStorySystem("test.action-notices", {
    act: ({ state, command }) => ({ state, ...command }),
  });
  const definition = { system: { id: "test.action-notices" } };
  const frame = { system: { state: {}, instanceKey: "notice-test" } };
  assert.equal(actWGSystem({}, definition, frame, {}).notice, "");
  const result = actWGSystem({}, definition, frame, {
    notice: "The activity has been interrupted.", paragraphs: ["You put down your work."],
  });
  assert.equal(result.notice, "The activity has been interrupted.");
  assert.deepEqual(result.paragraphs, ["You put down your work."]);
});

test("invalid choices still produce useful errors", () => {
  const game = createGame();
  const scene = buildScene(game);
  assert.throws(
    () => performChoice(game, { sceneId: scene.id, choiceId: "nonexistent-choice" }),
    (error) => error.code === CHOICE_ERROR_CODE.unavailableChoice && error.message.includes("not available"),
  );
});
