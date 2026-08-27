import { Game } from "../../src/classes/game/game.js";
import { performChoice } from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import {
  applyWGEffects,
  WGRuntimeError,
} from "../../src/classes/game/scene/wg/storyRuntime.js";
import { NPC_REGISTRY } from "../../src/data/npc/npcs.js";

const START = new Date("2026-08-24T08:00:00.000Z");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function findChoice(scene, choiceId) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((choice) => choice.id === choiceId);
}

function choose(game, scene, choiceId) {
  return performChoice(game, { sceneId: scene.id, choiceId });
}

const taylorTemplate = NPC_REGISTRY.find((definition) => definition.id === "taylor");
const game = new Game({
  seed: 711,
  startDate: START,
  playerOptions: { startPlaceId: null },
  npcTemplates: [{ ...taylorTemplate, behavior: null }],
});
game.player.setStatBase("energy", 20);
const startingMoney = game.player.money;
applyWGEffects(game, [
  { op: "money", amount: 25 },
  { op: "money", amount: -5 },
]);
check(
  "WG money effects add signed amounts to authoritative player state",
  game.player.money === startingMoney + 20,
);
let invalidMoneyEffectError = null;
try {
  applyWGEffects(game, [{ op: "money", amount: Number.POSITIVE_INFINITY }]);
} catch (error) {
  invalidMoneyEffectError = error;
}
check("corrupted non-finite money effects are rejected", invalidMoneyEffectError instanceof WGRuntimeError);
check("a rejected money effect does not change player state", game.player.money === startingMoney + 20);
game.story.homeEvents = {
  forgottenMugPlayed: true,
  openWindowPlayed: true,
  lateBreakfastPlayed: true,
};
const taylor = game.npcs.get("taylor");
taylor.setLocationAndPlace(game.homeLocationId, game.homePlaceId);

let scene = buildScene(game);
const enterHome = scene.sections
  .flatMap((section) => section.choices)
  .find(
    (choice) =>
      choice.action.type === "enter" &&
      String(choice.action.placeId) === String(game.homePlaceId),
  );
check("the location scene offers entry to the player's home", Boolean(enterHome));
choose(game, scene, enterHome.id);

scene = buildScene(game);
check("entering the player's home does not activate the Taylor WG scene", game.currentStory === null);
check("the ordinary home hub remains active", scene.kind === "place");
check(
  "Taylor's eligible entry contributes authored home flavor text",
  scene.paragraphs.includes(
    "Taylor is sitting at the table with a textbook and a loose stack of notes.",
  ),
);
const initialTaylorLauncher = findChoice(scene, "entry:home.taylor-study");
check(
  "the home hub offers the deliberate Taylor study launcher",
  initialTaylorLauncher?.label === "Study with Taylor",
);
choose(game, scene, initialTaylorLauncher.id);

scene = buildScene(game);
check("the launcher activates the Taylor WG scene", game.currentStory?.type === "scene" && game.currentStory.id === "taylor.study.peek");
check("the active WG definition materializes as an event Scene", scene.kind === "event");
check("interpolation resolves and capitalizes Taylor's pronoun", scene.paragraphs[0].includes("Her gaze"));
check("the false conditional branch supplies its prose", scene.paragraphs.includes("Taylor remains focused on the textbook."));
check("the authored unconditional Taylor choice materializes", Boolean(findChoice(scene, "mess")));
check("the authored unconditional Taylor choice is enabled", findChoice(scene, "mess")?.enabled === true);

game.story.taylor = { hurt: 1 };
scene = buildScene(game);
check("story-state conditions select the first true branch", scene.paragraphs.includes("Taylor notices you looking and frowns."));

game.story.taylor.hurt = 0;
game.player.setRelationship({ npcId: taylor.id, score: 0.6 });
scene = buildScene(game);
check("relationship conditions select their branch", scene.paragraphs.includes("Taylor catches your eye and smiles."));

const relationshipBeforeMess = game.player.getRelationship(taylor.id).score;
choose(game, scene, "mess");
check("WG choice effects change authoritative relationship state", game.player.getRelationship(taylor.id).score === relationshipBeforeMess - 0.02);
check("WG choices transition to their compiled target", game.currentStory?.type === "scene" && game.currentStory.id === "taylor.study.mess");

scene = buildScene(game);
choose(game, scene, "apologise");
check("a second WG transition returns to the requested scene", game.currentStory?.type === "scene" && game.currentStory.id === "taylor.study.peek");
check("the apology relationship effect is applied", game.player.getRelationship(taylor.id).score === relationshipBeforeMess);

scene = buildScene(game);
const studyStart = game.now.getTime();
const failedStudyBefore = JSON.stringify(game);
const studyListenerError = new Error("test story rollback");
const removeStudyListener = game.on("time", () => {
  throw studyListenerError;
});
let failedStudyError = null;
try {
  choose(game, scene, "study");
} catch (error) {
  failedStudyError = error;
}
check("a failed timed WG transition rethrows its error", failedStudyError === studyListenerError);
check("a failed timed WG transition rolls back story state", JSON.stringify(game) === failedStudyBefore);
removeStudyListener();
choose(game, scene, "study");
check("WG choice durations advance game time", game.now.getTime() === studyStart + 60 * 60_000);
check("the study choice enters its target", game.currentStory?.type === "scene" && game.currentStory.id === "taylor.study.back");
check("target @onenter effects run during transition", game.story.daily?.taylorStudyCompany === true);
const storyAfterEntry = JSON.stringify(game.story);
buildScene(game);
buildScene(game);
check("rebuilding a WG scene does not repeat entry effects", JSON.stringify(game.story) === storyAfterEntry);

const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
check("active WG scene state survives save/load", restored.currentStory?.type === "scene" && restored.currentStory.id === "taylor.study.back");
check("authored story state survives save/load", restored.story.daily?.taylorStudyCompany === true);
check("a restored active WG scene can be materialized", buildScene(restored).kind === "event");

scene = buildScene(game);
choose(game, scene, "continue");
scene = buildScene(game);
choose(game, scene, "leave");
check("an @exit target closes the WG scene", game.currentStory === null);
scene = buildScene(game);
check("@exit returns to the ordinary home place scene", scene.kind === "place");
const reopenTaylor = findChoice(scene, "entry:home.taylor-study");
check("the home scene offers a way back into the Taylor event", reopenTaylor?.label === "Study with Taylor");
choose(game, scene, reopenTaylor.id);
check("the home event launcher reopens the WG scene", game.currentStory?.type === "scene" && game.currentStory.id === "taylor.study.peek");

scene = buildScene(game);
choose(game, scene, "leave");

scene = buildScene(game);
choose(game, scene, "leave");
scene = buildScene(game);
const reenterHome = scene.sections
  .flatMap((section) => section.choices)
  .find(
    (choice) =>
      choice.action.type === "enter" &&
      String(choice.action.placeId) === String(game.homePlaceId),
  );
choose(game, scene, reenterHome.id);
check("later home entries also remain on the hub", game.currentStory === null);
scene = buildScene(game);
check(
  "later home hubs still expose Taylor's presence and launcher",
  scene.paragraphs.includes(
    "Taylor is sitting at the table with a textbook and a loose stack of notes.",
  ) && findChoice(scene, "entry:home.taylor-study")?.label === "Study with Taylor",
);

if (failures.length) {
  console.error("\nWG runtime failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG runtime tests passed.");
}
