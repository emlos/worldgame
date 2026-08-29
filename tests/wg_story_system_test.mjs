import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import {
  enterWGSequence,
  resolveActiveWGStory,
} from "../src/classes/game/scene/wg/storyRuntime.js";
import { WG_BUNDLE } from "../src/generated/wg/scenes.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const compiled = compileStorySources([
  {
    file: "story/tests/system.wg",
    source: `
@sequence test.system -> @exit
@heading "System fixture"
@system school.quiz {"bank":"math.core","questions":2}
@endsequence
`,
  },
]);
assert.equal(compiled.formatVersion, 16);
assert.deepEqual(compiled.sequences["test.system"].system.config, {
  bank: "math.core",
  questions: 2,
});
assert.deepEqual(compiled.sequences["test.system"].passages, []);

assert.throws(
  () =>
    compileStorySources([
      {
        file: "story/tests/system-with-body.wg",
        source: `
@sequence test.system-with-body -> @exit
@system school.quiz
This body is not allowed.
@endsequence
`,
      },
    ]),
  /System-backed sequences cannot contain authored passages/,
);

assert.throws(
  () =>
    compileStorySources([
      {
        file: "story/tests/system-bad-config.wg",
        source: `
@sequence test.system-bad-config -> @exit
@system school.quiz ["not", "an", "object"]
@endsequence
`,
      },
    ]),
  /@system config must be a JSON object/,
);

assert.throws(
  () =>
    compileStorySources([
      {
        file: "story/tests/system-school-class.wg",
        source: `
@sequence test.system-school-class -> @exit
@school-class math
@system school.quiz
@endsequence
`,
      },
    ]),
  /@system and @school-class cannot be used on the same sequence/,
);

const definition = WG_BUNDLE.sequences["school.math.event.surprise-quiz"];
assert.equal(definition.system.id, "school.quiz");
assert.deepEqual(definition.system.config, { bank: "math.core", questions: 3 });
assert.deepEqual(definition.passages, []);

const game = new Game({
  seed: 901,
  startDate: new Date("2026-09-02T10:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});
enterWGSequence(game, definition.id);
resolveActiveWGStory(game);
game.storyContinuations.push({
  target: "@exit",
  sequenceId: null,
  schoolClass: null,
  poolId: "test.quiz",
  entryId: definition.id,
  sourceStoryId: "test.source",
  sourcePassageId: null,
  sourceChoiceId: "begin-quiz",
});

assert.equal(game.currentStory.system.state.questions.length, 3);
assert.equal(game.currentStory.system.state.questionIndex, 0);
assert.equal(game.currentStory.system.state.score, 0);
const firstInstanceKey = game.currentStory.system.instanceKey;
const firstScene = buildScene(game);
assert.deepEqual(buildScene(game), firstScene, "rendering must not regenerate the quiz");
assert.equal(JSON.stringify(firstScene).includes("correctChoiceId"), false);
assert.equal(firstScene.sections[0].choices.length, 4);

function chooseAnswer(currentGame, { correct = true } = {}) {
  const state = currentGame.currentStory.system.state;
  const question = state.questions[state.questionIndex];
  const scene = buildScene(currentGame);
  const choice = scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => {
      const isCorrect = candidate.action.command?.answerId === question.correctChoiceId;
      return correct ? isCorrect : !isCorrect;
    });
  assert.ok(choice, "the requested generated answer should be rendered");
  return {
    scene,
    choice,
    result: performChoice(currentGame, {
      sceneId: scene.id,
      choiceId: choice.id,
    }),
  };
}

const startingGrade = game.player.getSubjectGrade("math");
const firstAnswer = chooseAnswer(game);
assert.equal(firstAnswer.result.notice, "Answer recorded.");
assert.equal(game.currentStory.system.state.questionIndex, 1);
assert.equal(game.currentStory.system.state.score, 1);
assert.equal(game.currentStory.system.revision, 1);
assert.throws(
  () =>
    performChoice(game, {
      sceneId: firstAnswer.scene.id,
      choiceId: firstAnswer.choice.id,
    }),
  /no longer current/,
);

const savedScene = buildScene(game);
const malformedSave = JSON.parse(JSON.stringify(game));
malformedSave.currentStory.system.state.score = 999;
assert.throws(() => Game.fromJSON(malformedSave), /state score is invalid/);
const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
assert.deepEqual(buildScene(restored), savedScene);
assert.deepEqual(restored.currentStory.system.state, game.currentStory.system.state);

chooseAnswer(restored, { correct: false });
chooseAnswer(restored);
assert.equal(restored.currentStory.system.state.complete, true);
assert.equal(restored.currentStory.system.state.score, 2);
assert.ok(
  Math.abs(restored.player.getSubjectGrade("math") - (startingGrade + 0.01)) < 1e-9,
);

const resultsScene = buildScene(restored);
assert.ok(
  resultsScene.content.some((block) =>
    block.text?.includes("2 out of 3 questions correctly"),
  ),
);
performChoice(restored, {
  sceneId: resultsScene.id,
  choiceId: "quiz-finish",
});
assert.equal(restored.currentStory, null);
assert.deepEqual(restored.storyContinuations, []);

enterWGSequence(restored, definition.id);
resolveActiveWGStory(restored);
assert.notEqual(restored.currentStory.system.instanceKey, firstInstanceKey);

console.log("WG story system checks passed.");
