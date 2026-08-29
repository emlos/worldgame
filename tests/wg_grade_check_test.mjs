import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import {
  getPlayerSkillCheckValue,
  getSkillCheckTargetDefinition,
} from "../src/data/scene/skillChecks.js";
import {
  enterWGSequence,
  resolveActiveWGStory,
} from "../src/classes/game/scene/wg/storyRuntime.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const compiled = compileStorySources([{
  file: "story/tests/grade-check.wg",
  source: `
:: test.passive-grade-check
@check grade english tricky
@success
You understand the material.
@failure
You misunderstand the material.
@endcheck

:: test.interactive-grade-check
@choice answer "Answer the question"
  @check grade english difficult
  @success -> @exit
  @endsuccess
  @failure -> @exit
  @endfailure
@endchoice
`,
}]);

assert.equal(compiled.formatVersion, 15);
const passiveCheck = compiled.scenes["test.passive-grade-check"].body[0].check;
assert.equal(passiveCheck.targetType, "grade");
assert.equal(passiveCheck.targetId, "english");
assert.equal(passiveCheck.difficultyId, "tricky");
const interactiveCheck = compiled.scenes["test.interactive-grade-check"].body[0].check;
assert.equal(interactiveCheck.targetType, "grade");
assert.equal(interactiveCheck.targetId, "english");
assert.equal(interactiveCheck.difficultyId, "difficult");

assert.throws(
  () => compileStorySources([{
    file: "story/tests/unknown-grade-check.wg",
    source: `
:: test.unknown-grade-check
@check grade geography tricky
@success
Success.
@failure
Failure.
@endcheck
`,
  }]),
  /unknown school subject 'geography'/,
);

assert.throws(
  () => compileStorySources([{
    file: "story/tests/implicit-check-target.wg",
    source: `
:: test.implicit-check-target
@check resolve tricky
@success
Success.
@failure
Failure.
@endcheck
`,
  }]),
  /target type, target id, and difficulty id/,
);

assert.deepEqual(getSkillCheckTargetDefinition("grade", "english"), {
  label: "English Grade",
  min: 0,
  max: 10,
});

function createDiscussionGame(grade) {
  const game = new Game({
    seed: 723,
    startDate: new Date("2026-09-02T09:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  game.player.adjustSubjectGrade(
    "english",
    grade - game.player.getSubjectGrade("english"),
  );
  game.runAction({
    label: "",
    apply(currentGame) {
      enterWGSequence(currentGame, "school.english.event.group-discussion");
    },
    after(currentGame) {
      resolveActiveWGStory(currentGame);
    },
  });
  return game;
}

const lowGradeGame = createDiscussionGame(0);
assert.equal(getPlayerSkillCheckValue(lowGradeGame.player, "grade", "english"), 0);
let scene = buildScene(lowGradeGame);
let choice = scene.sections
  .flatMap((section) => section.choices)
  .find((candidate) => candidate.id === "discussion-argue");
assert.deepEqual(choice.skillCheck, {
  targetType: "grade",
  targetId: "english",
  targetLabel: "English Grade",
  difficultyId: "difficult",
  difficultyLabel: "Difficult",
});
performChoice(lowGradeGame, { sceneId: scene.id, choiceId: choice.id });
assert.equal(lowGradeGame.currentStory.passageId, "misread");

const highGradeGame = createDiscussionGame(100);
assert.equal(getPlayerSkillCheckValue(highGradeGame.player, "grade", "english"), 10);
scene = buildScene(highGradeGame);
choice = scene.sections
  .flatMap((section) => section.choices)
  .find((candidate) => candidate.id === "discussion-argue");
performChoice(highGradeGame, { sceneId: scene.id, choiceId: choice.id });
assert.equal(highGradeGame.currentStory.passageId, "argued");

console.log("WG grade-targeted skill-check checks passed.");
