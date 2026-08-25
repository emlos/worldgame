import { Game } from "../../src/classes/game/game.js";
import { performChoice } from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import {
  getEligibleWGAutomaticEntries,
  WG_AUTO_TRIGGER,
} from "../../src/classes/game/scene/wg/entryResolver.js";
import { WG_BUNDLE } from "../../src/generated/wg/scenes.js";

const HOME_ENTRY_IDS = Object.freeze([
  "home.random.forgotten-mug",
  "home.random.open-window",
  "home.random.late-breakfast",
]);
const UNCONDITIONAL_ENTRY_IDS = HOME_ENTRY_IDS.slice(0, 2);
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

function performById(game, choiceId) {
  const scene = buildScene(game);
  const choice = choices(scene).find((candidate) => candidate.id === choiceId);
  if (!choice) throw new Error(`Missing choice '${choiceId}' in scene '${scene.id}'`);
  return performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

function enterHome(game) {
  const scene = buildScene(game);
  const choice = choices(scene).find(
    (candidate) =>
      candidate.action.type === "enter" &&
      String(candidate.action.placeId) === String(game.homePlaceId),
  );
  if (!choice) throw new Error("Player home entry choice is unavailable");
  performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

function eligibleAt(isoTime) {
  const game = new Game({
    seed: 901,
    startDate: new Date(isoTime),
    playerOptions: { startPlaceId: null },
    npcTemplates: [],
  });
  game.setCurrentPlace({ placeId: game.homePlaceId });
  return getEligibleWGAutomaticEntries(game, WG_AUTO_TRIGGER.enterPlace)
    .map((entry) => entry.id)
    .filter((id) => HOME_ENTRY_IDS.includes(id));
}

const compiledEntries = HOME_ENTRY_IDS.map((id) => WG_BUNDLE.entries[id]);
check("all three home events compile into WG entries", compiledEntries.every(Boolean));
check(
  "home events have equal automatic selection odds",
  compiledEntries.every(
    (entry) => entry.priority === 0 && entry.chance === 1 && entry.weight === 1,
  ),
);
check(
  "only the two unconditional events are eligible before 10:00",
  eligibleAt("2026-08-24T09:59:00.000Z").sort().join(",") ===
    [...UNCONDITIONAL_ENTRY_IDS].sort().join(","),
);
check(
  "the timed event becomes equally eligible at 10:00",
  eligibleAt("2026-08-24T10:00:00.000Z").sort().join(",") ===
    [...HOME_ENTRY_IDS].sort().join(","),
);
check(
  "the timed event remains eligible at 13:00",
  eligibleAt("2026-08-24T13:00:00.000Z").includes("home.random.late-breakfast"),
);
check(
  "the timed event is ineligible after 13:00",
  !eligibleAt("2026-08-24T13:01:00.000Z").includes("home.random.late-breakfast"),
);

const replayGame = new Game({
  seed: 902,
  startDate: new Date("2026-08-24T08:00:00.000Z"),
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
const playedScenes = [];
for (let index = 0; index < 2; index++) {
  enterHome(replayGame);
  playedScenes.push(replayGame.currentStorySceneId);
  performById(replayGame, "next");
  check(`event ${index + 1} Next returns to the home hub`, replayGame.currentStorySceneId === null);
  performById(replayGame, "leave");
}
check(
  "both unconditional events play once across repeated home entries",
  new Set(playedScenes).size === 2 &&
    playedScenes.every((id) => UNCONDITIONAL_ENTRY_IDS.includes(id)),
);
enterHome(replayGame);
check(
  "played unconditional events never trigger again",
  replayGame.currentStorySceneId === null,
);

const timedGame = new Game({
  seed: 903,
  startDate: new Date("2026-08-24T11:00:00.000Z"),
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
timedGame.story.homeEvents = {
  forgottenMugPlayed: true,
  openWindowPlayed: true,
};
enterHome(timedGame);
check(
  "the time-gated event triggers during its window",
  timedGame.currentStorySceneId === "home.random.late-breakfast",
);
performById(timedGame, "next");
performById(timedGame, "leave");
enterHome(timedGame);
check(
  "the time-gated event also plays only once",
  timedGame.currentStorySceneId === null,
);

if (failures.length) {
  console.error("\nWG home event failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG home event tests passed.");
}
