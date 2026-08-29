import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import { createWGRuntimeContext } from "../src/classes/game/scene/wg/runtimeContext.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../src/classes/game/scene/wg/storyRuntime.js";
import { WG_BUNDLE } from "../src/generated/wg/scenes.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const classroomSequences = {
  "place.high-school.english-classroom": ["english", "school.class.english"],
  "place.high-school.math-classroom": ["math", "school.class.math"],
  "place.high-school.history-classroom": ["history", "school.class.history"],
  "place.high-school.science-classroom": ["science", "school.class.science"],
  "place.high-school.art-classroom": ["art", "school.class.art"],
  "place.high-school.gym": ["physical_education", "school.class.physical-education"],
};

for (const [sceneId, [, sequenceId]] of Object.entries(classroomSequences)) {
  const wait = WG_BUNDLE.scenes[sceneId].body.find(
    (node) => node.type === "choice" && node.id === "wait-for-class",
  );
  assert.equal(wait?.target, sequenceId, `${sceneId} should target its class sequence`);
  assert.deepEqual(wait?.timeUntilPath, ["school", "nextClassStartsAt"]);
  assert.equal(wait?.enterAfterTime, true);
}

assert.throws(
  () => compileStorySources([{
    file: "story/tests/deferred-without-time.wg",
    source: `
:: test.deferred-without-time
@heading "Invalid deferred target"
@choice wait "Wait" -> @exit
  @enter-after-time
@endchoice
`,
  }]),
  /requires @time or @time-until/,
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

function enterScene(game, sceneId) {
  game.runAction({
    label: "",
    apply(currentGame) {
      enterWGScene(currentGame, sceneId);
    },
    after(currentGame) {
      resolveActiveWGStory(currentGame);
    },
  });
}

function findChoice(scene, choiceId) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.id === choiceId);
}

const game = new Game({
  seed: 723,
  startDate: new Date("2026-09-02T08:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});
putAtSchool(game);

let school = createWGRuntimeContext(game).school;
assert.equal(school.phase, "before_school");
assert.equal(school.currentClass, null);
assert.equal(school.nextClass, "english");
assert.equal(school.nextClassStartsAt, "2026-09-02T09:00:00.000Z");
assert.equal(school.minutesUntilNextClass, 60);

enterScene(game, "place.high-school.english-classroom");
let scene = buildScene(game);
const wait = findChoice(scene, "wait-for-class");
assert.ok(wait, "the next class's classroom should offer a wait choice");
assert.equal(wait.durationMinutes, 60);
assert.equal(wait.action.enterAfterTime, true);

performChoice(game, { sceneId: scene.id, choiceId: wait.id });
assert.equal(game.now.toISOString(), "2026-09-02T09:00:00.000Z");
assert.equal(game.currentStory.type, "sequence");
assert.equal(game.currentStory.id, "school.class.english");
assert.equal(game.currentStory.passageId, "segment-1");
assert.equal(game.currentStory.schoolClass.arrivedAt, "2026-09-02T09:00:00.000Z");

school = createWGRuntimeContext(game).school;
assert.equal(school.currentClass, "english");
assert.equal(school.nextClass, "math");
assert.equal(school.nextClassStartsAt, "2026-09-02T10:00:00.000Z");

enterScene(game, "place.high-school.english-classroom");
scene = buildScene(game);
assert.equal(findChoice(scene, "wait-for-class"), undefined);

const breakGame = new Game({
  seed: 723,
  startDate: new Date("2026-09-02T09:50:00.000Z"),
  playerOptions: { startPlaceId: null },
});
putAtSchool(breakGame);
assert.equal(createWGRuntimeContext(breakGame).school.nextClass, "math");

enterScene(breakGame, "place.high-school.english-classroom");
assert.equal(findChoice(buildScene(breakGame), "wait-for-class"), undefined);

enterScene(breakGame, "place.high-school.math-classroom");
const mathWait = findChoice(buildScene(breakGame), "wait-for-class");
assert.ok(mathWait, "only the next class's room should offer waiting");
assert.equal(mathWait.durationMinutes, 10);

console.log("School classroom wait checks passed.");
