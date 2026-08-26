import { Game } from "../../src/classes/game/game.js";
import { performChoice } from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import { createWGRuntimeContext } from "../../src/classes/game/scene/wg/runtimeContext.js";
import { applyWGEffects } from "../../src/classes/game/scene/wg/storyRuntime.js";

const START = new Date("2026-08-24T08:00:00.000Z");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function findChoice(scene, id) {
  return scene.sections.flatMap((section) => section.choices).find((choice) => choice.id === id);
}

function choose(game, scene, id) {
  return performChoice(game, { sceneId: scene.id, choiceId: id });
}

const game = new Game({ seed: 1337, startDate: START, npcTemplates: [] });
game.currentLocationId = game.homeLocationId;
game.setCurrentPlace({ placeId: game.homePlaceId });

let scene = buildScene(game);
const lift = findChoice(scene, "lift-weights");
check("home exposes the strength-building choice", Boolean(lift));
check("strength-building takes five minutes", lift?.durationMinutes === 5);
check(
  "strength-building previews direction without its amount",
  lift?.skillChanges.length === 1 &&
    lift.skillChanges[0].label === "+Strength" &&
    lift.skillChanges[0].direction === "increase" &&
    !Object.prototype.hasOwnProperty.call(lift.skillChanges[0], "amount"),
);

const liftStart = game.now.getTime();
const liftRevision = game.actionRevision;
choose(game, scene, "lift-weights");
check("lifting adds exactly 0.1 Strength", game.player.getSkillValue("strength") === 0.1);
check("lifting advances five minutes", game.now.getTime() === liftStart + 5 * 60_000);
check("successful choices advance the roll revision", game.actionRevision === liftRevision + 1);

scene = buildScene(game);
const jar = findChoice(scene, "open-jar");
check("home exposes the jar skill check", Boolean(jar));
check(
  "jar UI metadata exposes only skill and difficulty labels",
  jar?.skillCheck?.skillId === "strength" &&
    jar.skillCheck.skillLabel === "Strength" &&
    jar.skillCheck.difficultyId === "tricky" &&
    jar.skillCheck.difficultyLabel === "Tricky" &&
    !Object.prototype.hasOwnProperty.call(jar.skillCheck, "chance") &&
    !Object.prototype.hasOwnProperty.call(jar.skillCheck, "roll") &&
    !Object.prototype.hasOwnProperty.call(jar.skillCheck, "outcome"),
);
check("checked choices hide branch duration", jar?.durationMinutes === 0);
check("checked choices hide branch skill changes", jar?.skillChanges.length === 0);

const context = createWGRuntimeContext(game);
check("WG expressions expose fractional player skills", context.player.skills.strength === 0.1);

applyWGEffects(game, [
  { op: "skill", id: "strength", amount: 0.05 },
  { op: "stat", id: "energy", amount: -5 },
]);
check("WG skill effects preserve fractional changes", game.player.getSkillValue("strength") === 0.15);
check("WG stat effects adjust registered player stats", game.player.getStatBase("energy") === 95);

scene = buildScene(game);
const saved = JSON.parse(JSON.stringify(game));
const restored = Game.fromJSON(saved);
const restoredScene = buildScene(restored);
check("save/load preserves the authoritative scene instance", restoredScene.id === scene.id);
choose(game, scene, "open-jar");
choose(restored, restoredScene, "open-jar");
check(
  "save/reload preserves the skill-check branch",
  restored.currentStorySceneId === game.currentStorySceneId &&
    restored.hasFlag("jar_opened") === game.hasFlag("jar_opened"),
);
check(
  "save/reload preserves branch time and action revision",
  restored.now.getTime() === game.now.getTime() &&
    restored.actionRevision === game.actionRevision,
);
check(
  "jar checks enter exactly one authored result passage",
  ["home.jar-opened", "home.jar-stuck"].includes(game.currentStorySceneId),
);

if (failures.length) {
  console.error("\nWG skill-check failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG skill-check tests passed.");
}
