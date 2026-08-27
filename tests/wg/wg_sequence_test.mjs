import { Game } from "../../src/classes/game/game.js";
import { performChoice } from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import { enterWGTarget } from "../../src/classes/game/scene/wg/storyRuntime.js";

const START = new Date("2026-08-24T08:00:00.000Z");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function choices(scene) {
  return scene.sections.flatMap((section) => section.choices);
}

function choose(game, scene, choiceId) {
  return performChoice(game, { sceneId: scene.id, choiceId });
}

const game = new Game({ seed: 1701, startDate: START });
const startedAt = game.now.getTime();
const startingActionRevision = game.actionRevision;
const startingLogLength = game.log.length;

enterWGTarget(game, "example.passage-sequence");
check(
  "entering a sequence activates its first passage",
  game.currentStory?.type === "sequence" &&
    game.currentStory.id === "example.passage-sequence" &&
    game.currentStory.passageId === "p1",
);
check(
  "sequence @onenter effects run once on initial entry",
  game.story.examples?.sequenceEntries === 1,
);

let scene = buildScene(game);
let next = choices(scene).find((choice) => choice.action.type === "wg-next");
check(
  "the first sequence passage materializes prose and a default Next choice",
  scene.paragraphs.includes(
    "The first passage is displayed without requiring a standalone scene.",
  ) && next?.label === "Next" && next.durationMinutes === 0,
);

choose(game, scene, next.id);
check(
  "@next advances to the following passage without gameplay time or revisions",
  game.currentStory?.passageId === "decision" &&
    game.now.getTime() === startedAt &&
    game.actionRevision === startingActionRevision &&
    game.log.length === startingLogLength,
);
check(
  "@next does not repeat sequence entry effects",
  game.story.examples?.sequenceEntries === 1,
);

const restoredDecision = Game.fromJSON(JSON.parse(JSON.stringify(game)));
check(
  "save/load preserves the active sequence passage",
  restoredDecision.currentStory?.type === "sequence" &&
    restoredDecision.currentStory.id === "example.passage-sequence" &&
    restoredDecision.currentStory.passageId === "decision" &&
    buildScene(restoredDecision).paragraphs.includes(
      "The second passage can offer ordinary authored choices.",
    ),
);

scene = buildScene(game);
choose(game, scene, "stay");
check(
  "ordinary choices can target a local passage",
  game.currentStory?.passageId === "decision" &&
    game.actionRevision === startingActionRevision + 1 &&
    game.log.at(-1)?.label === "Read this passage again",
);

scene = buildScene(game);
choose(game, scene, "finish");
check(
  "local passage choices retain normal authoritative effects",
  game.currentStory?.passageId === "ending" &&
    game.story.examples?.sequenceFinished === true,
);

scene = buildScene(game);
next = choices(scene).find((choice) => choice.action.type === "wg-next");
const finalActionRevision = game.actionRevision;
const finalLogLength = game.log.length;
check("the final passage uses its custom Next label", next?.label === "Return");
choose(game, scene, next.id);
check(
  "the final @next follows the sequence target and returns to the world hub",
  game.currentStory === null &&
    game.actionRevision === finalActionRevision &&
    game.log.length === finalLogLength &&
    buildScene(game).kind === "place",
);

if (failures.length) {
  console.error("\nWG sequence failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG sequence tests passed.");
}
