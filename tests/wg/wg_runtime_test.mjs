import { Game } from "../../src/classes/game/game.js";
import { performChoice } from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
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
check("entering the player's home activates the Taylor WG scene", game.currentStorySceneId === "taylor.study.peek");
check("the active WG definition materializes as an event Scene", scene.kind === "event");
check("interpolation resolves and capitalizes Taylor's pronoun", scene.paragraphs[0].includes("Her gaze"));
check("the false conditional branch supplies its prose", scene.paragraphs.includes("Taylor remains focused on the textbook."));
check("a true @when expression includes its choice", Boolean(findChoice(scene, "mess")));
check("a passing @require expression enables its choice", findChoice(scene, "mess")?.enabled === true);

game.player.setStatBase("energy", 5);
scene = buildScene(game);
check("a failing @require keeps its choice visible", Boolean(findChoice(scene, "mess")));
check("a failing @require disables the choice with its reason", findChoice(scene, "mess")?.disabledReason === "You are too tired.");
game.player.setStatBase("energy", 20);

taylor.setLocationAndPlace(taylor.homeLocationId, taylor.homePlaceId);
scene = buildScene(game);
check("a false @when expression hides its choice", findChoice(scene, "mess") === undefined);
taylor.setLocationAndPlace(game.homeLocationId, game.homePlaceId);

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
check("WG choices transition to their compiled target", game.currentStorySceneId === "taylor.study.mess");

scene = buildScene(game);
choose(game, scene, "apologise");
check("a second WG transition returns to the requested scene", game.currentStorySceneId === "taylor.study.peek");
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
check("the study choice enters its target", game.currentStorySceneId === "taylor.study.back");
check("target @onenter effects run during transition", game.story.daily?.taylorStudyCompany === true);
const storyAfterEntry = JSON.stringify(game.story);
buildScene(game);
buildScene(game);
check("rebuilding a WG scene does not repeat entry effects", JSON.stringify(game.story) === storyAfterEntry);

const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
check("active WG scene state survives save/load", restored.currentStorySceneId === "taylor.study.back");
check("authored story state survives save/load", restored.story.daily?.taylorStudyCompany === true);
check("a restored active WG scene can be materialized", buildScene(restored).kind === "event");

scene = buildScene(game);
choose(game, scene, "leave");
check("an @exit target closes the WG scene", game.currentStorySceneId === null);
check("@exit returns to the ordinary home place scene", buildScene(game).kind === "place");

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
check("every later entry to the player's home triggers the scene again", game.currentStorySceneId === "taylor.study.peek");

if (failures.length) {
  console.error("\nWG runtime failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG runtime tests passed.");
}
