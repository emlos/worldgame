import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import {
  resolveWGPoolEntry,
} from "../src/classes/game/scene/wg/entryResolver.js";
import { createWGRuntimeContext } from "../src/classes/game/scene/wg/runtimeContext.js";
import {
  enterWGSequence,
  resolveActiveWGStory,
  suspendWGContinuation,
} from "../src/classes/game/scene/wg/storyRuntime.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const fixture = compileStorySources([{
  file: "story/tests/event-pool.wg",
  source: `
@entry test.event
  @scene test.event
  @pool test.pool
@endentry

@sequence test.event -> @return
@heading "Test event"
The event runs.
@next "Return"
@endsequence

:: test.source
@heading "Source"
@choice continue "Continue" -> @exit
  @event-pool test.pool
  @event-chance 25%
@endchoice
`,
}]);
assert.equal(fixture.formatVersion, 13);
assert.deepEqual(fixture.entries["test.event"].pools, ["test.pool"]);
assert.equal(fixture.sequences["test.event"].finalTarget, "@return");
const fixtureChoice = fixture.scenes["test.source"].body.find(
  (node) => node.type === "choice",
);
assert.equal(fixtureChoice.eventPool, "test.pool");
assert.equal(fixtureChoice.eventChance, 0.25);

assert.throws(
  () => compileStorySources([{
    file: "story/tests/unknown-pool.wg",
    source: `
:: test.source
@heading "Source"
@choice continue "Continue" -> @exit
  @event-pool missing.pool
@endchoice
`,
  }]),
  /Unknown event pool 'missing.pool'/,
);

assert.throws(
  () => compileStorySources([{
    file: "story/tests/chance-without-pool.wg",
    source: `
:: test.source
@heading "Source"
@choice continue "Continue" -> @exit
  @event-chance 50%
@endchoice
`,
  }]),
  /@event-chance requires @event-pool/,
);

function putAtSchool(game) {
  for (const location of game.world.locations.values()) {
    const place = location.places.find((candidate) => candidate.key === "high_school");
    if (!place) continue;
    game.moveTo(location.id);
    game.setCurrentPlace({ placeId: place.id });
    return;
  }
  assert.fail("the generated world should contain a high school");
}

function createEnglishClassGame() {
  const game = new Game({
    seed: 723,
    startDate: new Date("2026-09-02T09:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  putAtSchool(game);
  game.runAction({
    label: "",
    apply(currentGame) {
      enterWGSequence(currentGame, "school.class.english");
    },
    after(currentGame) {
      resolveActiveWGStory(currentGame);
    },
  });
  return game;
}

function randomValues(...values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, "event-pool selection consumed an unexpected roll");
    return values[index++];
  };
}

const selectionGame = createEnglishClassGame();
assert.equal(
  resolveWGPoolEntry(
    selectionGame,
    "school.class.english",
    0.75,
    { random: randomValues(0.8) },
  ),
  null,
  "the pool-level miss should select no event",
);
assert.equal(
  resolveWGPoolEntry(
    selectionGame,
    "school.class.english",
    0.75,
    { random: randomValues(0.1, 0.01) },
  )?.id,
  "school.english.event.group-discussion",
);
assert.equal(
  resolveWGPoolEntry(
    selectionGame,
    "school.class.english",
    0.75,
    { random: randomValues(0.1, 0.34) },
  )?.id,
  "school.english.event.reading-aloud",
);
assert.equal(
  resolveWGPoolEntry(
    selectionGame,
    "school.class.english",
    0.75,
    { random: randomValues(0.1, 0.67) },
  )?.id,
  "school.english.event.surprise-quiz",
);

const eventGame = createEnglishClassGame();
eventGame.getRNG("wg-events").setState(0);
let scene = buildScene(eventGame);
performChoice(eventGame, {
  sceneId: scene.id,
  choiceId: "english-1-study",
});
assert.equal(eventGame.now.toISOString(), "2026-09-02T09:15:00.000Z");
assert.equal(eventGame.currentStory.type, "sequence");
assert.equal(eventGame.currentStory.id, "school.english.event.group-discussion");
assert.equal(eventGame.currentStory.passageId, "opening");
assert.equal(eventGame.storyContinuations.length, 1);
assert.equal(eventGame.storyContinuations[0].target, ".segment-2");
assert.equal(eventGame.storyContinuations[0].sequenceId, "school.class.english");
assert.equal(eventGame.storyContinuations[0].sourcePassageId, "segment-1");
assert.equal(createWGRuntimeContext(eventGame).school.arrival.startingSegment, 1);
assert.equal(
  createWGRuntimeContext(eventGame).event.entryId,
  "school.english.event.group-discussion",
);

const restored = Game.fromJSON(JSON.parse(JSON.stringify(eventGame)));
assert.equal(restored.toJSON().saveVersion, 22);
assert.equal(restored.storyContinuations.length, 1);
scene = buildScene(restored);
performChoice(restored, {
  sceneId: scene.id,
  choiceId: "discussion-listen",
});
assert.equal(restored.currentStory.passageId, "listened");
scene = buildScene(restored);
performChoice(restored, {
  sceneId: scene.id,
  choiceId: "__wg_next",
});
assert.equal(restored.currentStory.id, "school.class.english");
assert.equal(restored.currentStory.passageId, "segment-2");
assert.equal(restored.storyContinuations.length, 0);
assert.equal(restored.currentStory.schoolClass.startingSegment, 1);

function exerciseEventSequence(eventId, choiceIds) {
  const game = createEnglishClassGame();
  game.runAction({
    label: "",
    apply(currentGame) {
      suspendWGContinuation(
        currentGame,
        { target: ".segment-2", sequenceId: "school.class.english" },
        {
          poolId: "school.class.english",
          entryId: eventId,
          choiceId: "english-1-study",
        },
      );
      enterWGSequence(currentGame, eventId);
    },
    after(currentGame) {
      resolveActiveWGStory(currentGame);
    },
  });
  for (const choiceId of choiceIds) {
    const currentScene = buildScene(game);
    performChoice(game, { sceneId: currentScene.id, choiceId });
  }
  assert.equal(game.currentStory.id, "school.class.english");
  assert.equal(game.currentStory.passageId, "segment-2");
  assert.equal(game.storyContinuations.length, 0);
}

exerciseEventSequence("school.english.event.reading-aloud", [
  "reading-volunteer",
  "__wg_next",
]);
exerciseEventSequence("school.english.event.surprise-quiz", [
  "quiz-first-correct",
  "quiz-second-correct",
  "__wg_next",
]);

const noEventGame = createEnglishClassGame();
noEventGame.getRNG("wg-events").setState(1327);
scene = buildScene(noEventGame);
performChoice(noEventGame, {
  sceneId: scene.id,
  choiceId: "english-1-study",
});
assert.equal(noEventGame.currentStory.id, "school.class.english");
assert.equal(noEventGame.currentStory.passageId, "segment-2");
assert.equal(noEventGame.storyContinuations.length, 0);

console.log("WG event-pool checks passed.");
