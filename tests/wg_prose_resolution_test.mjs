import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import {
  enterWGScene,
  enterWGSequence,
  resolveActiveWGStory,
} from "../src/classes/game/scene/wg/storyRuntime.js";
import { WG_BUNDLE } from "../src/generated/wg/scenes.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const source = `
:: test.prose-resolution
@heading "Prose Resolution Test"

@random
Random loss.
@change grade english -1
@or
Random gain.
@change grade english 1
@or
Random neutral.
@endrandom

@check resolve trivial
@success
Passive success.
@change grade english 1
@failure
Passive failure.
@change grade english -1
@endcheck

@choice visible-change "Apply a visible change" -> @exit
  @change grade english 1
@endchoice

:: test.prose-resolution-failure
@heading "Prose Resolution Rollback Test"

@effect grade english 2
@effect relationship missing-npc 0.1
This should never render.
`;

const compiled = compileStorySources([
  { file: "story/tests/prose-resolution.wg", source },
]);
Object.assign(WG_BUNDLE.scenes, compiled.scenes);

assert.throws(
  () =>
    compileStorySources([
      {
        file: "story/tests/invalid-place-effect.wg",
        source: `
:: test.invalid-place-effect
@kind place
@heading "Invalid Place Effect"
@change grade english 1
`,
      },
    ]),
  /Persistent place hubs cannot contain prose effects or passive checks/,
);

const game = new Game({
  seed: 721,
  startDate: new Date("2026-09-01T08:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});
const startingGrade = game.player.getSubjectGrade("english");

enterWGScene(game, "test.prose-resolution");
assert.equal(game.currentStory.resolution, undefined);
const resolution = resolveActiveWGStory(game);
assert.equal(resolution.revision, game.storyRevision);

const randomDecision = Object.entries(resolution.decisions).find(([key]) =>
  key.startsWith("random:"),
);
const passiveDecision = Object.entries(resolution.decisions).find(([key]) =>
  key.startsWith("passive-check:"),
);
assert.ok(randomDecision);
assert.deepEqual(passiveDecision?.[1], "success");

const randomDelta = [-1, 1, 0][randomDecision[1]];
assert.equal(
  game.player.getSubjectGrade("english"),
  startingGrade + randomDelta + 1,
);

const firstScene = buildScene(game);
const secondScene = buildScene(game);
resolveActiveWGStory(game);
assert.deepEqual(secondScene.content, firstScene.content);
assert.equal(
  game.player.getSubjectGrade("english"),
  startingGrade + randomDelta + 1,
  "rendering and repeated resolution must not apply prose effects again",
);

const prose = firstScene.content
  .filter((block) => block.type === "paragraph")
  .map((block) => block.text);
assert.ok(prose.includes("Passive success."));
assert.ok(!prose.includes("Passive failure."));
assert.equal(
  prose.filter((text) => text.startsWith("Random ")).length,
  1,
  "exactly one random alternative should render",
);

const changes = firstScene.content
  .filter((block) => block.type === "changes")
  .flatMap((block) => block.items);
assert.ok(changes.some((change) => change.label === "+English grade"));
if (randomDelta < 0) {
  assert.ok(changes.some((change) => change.label === "-English grade"));
}

const visibleChoice = firstScene.sections
  .flatMap((section) => section.choices)
  .find((choice) => choice.id === "visible-change");
assert.equal(visibleChoice.effectsPreview[0].label, "+English grade");
assert.equal(visibleChoice.action.effects[0].op, "grade");

const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
assert.deepEqual(buildScene(restored).content, firstScene.content);
assert.equal(restored.player.getSubjectGrade("english"), startingGrade + randomDelta + 1);
assert.equal(restored.toJSON().saveVersion, 21);

const rollbackGame = new Game({
  seed: 722,
  startDate: new Date("2026-09-01T08:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});
const rollbackGrade = rollbackGame.player.getSubjectGrade("english");
assert.throws(
  () =>
    rollbackGame.runAction({
      label: "",
      apply(currentGame) {
        enterWGScene(currentGame, "test.prose-resolution-failure");
      },
      after(currentGame) {
        resolveActiveWGStory(currentGame);
      },
    }),
  /missing-npc/,
);
assert.equal(rollbackGame.currentStory, null);
assert.equal(rollbackGame.storyRevision, 0);
assert.equal(rollbackGame.actionRevision, 0);
assert.equal(rollbackGame.player.getSubjectGrade("english"), rollbackGrade);

const classDefinitions = {
  english: "school.class.english",
  math: "school.class.math",
  history: "school.class.history",
  science: "school.class.science",
  art: "school.class.art",
  physical_education: "school.class.physical-education",
};
for (const [subjectId, sequenceId] of Object.entries(classDefinitions)) {
  const sequence = WG_BUNDLE.sequences[sequenceId];
  assert.equal(sequence.passages.length, 3, `${sequenceId} should have three segments`);
  for (const passage of sequence.passages) {
    const random = passage.body.find((node) => node.type === "random");
    assert.equal(random?.variants.length, 3, `${sequenceId}.${passage.id} needs three outcomes`);
    const changedEffects = random.variants
      .flat()
      .filter((node) => node.type === "effect" && node.effect?.feedback);
    assert.deepEqual(
      changedEffects.map((node) => [node.effect.id, node.effect.amount]),
      [
        [subjectId, -1],
        [subjectId, 1],
      ],
    );
  }
}

const classGame = new Game({
  seed: 723,
  startDate: new Date("2026-09-02T09:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});
let schoolPosition = null;
for (const location of classGame.world.locations.values()) {
  const place = location.places.find((candidate) => candidate.key === "high_school");
  if (place) {
    schoolPosition = { location, place };
    break;
  }
}
assert.ok(schoolPosition, "the generated world should contain a high school");
classGame.moveTo(schoolPosition.location.id);
classGame.setCurrentPlace({ placeId: schoolPosition.place.id });
const classStartingGrade = classGame.player.getSubjectGrade("english");
classGame.runAction({
  label: "",
  apply(currentGame) {
    enterWGSequence(currentGame, "school.class.english");
  },
  after(currentGame) {
    resolveActiveWGStory(currentGame);
  },
});
assert.equal(classGame.currentStory.passageId, "segment-1");
assert.ok([-1, 0, 1].includes(
  classGame.player.getSubjectGrade("english") - classStartingGrade,
));

const firstClassScene = buildScene(classGame);
performChoice(classGame, {
  sceneId: firstClassScene.id,
  choiceId: "english-1-study",
});
assert.equal(classGame.currentStory.passageId, "segment-2");
assert.equal(classGame.now.toISOString(), "2026-09-02T09:15:00.000Z");
assert.equal(classGame.currentStory.resolution.revision, classGame.storyRevision);
assert.doesNotThrow(() => buildScene(classGame));

console.log("WG prose resolution checks passed.");
