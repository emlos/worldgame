import { Game } from "../../src/classes/game/game.js";
import { performChoice } from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import { getWGPlaceHubEntry } from "../../src/classes/game/scene/wg/entryResolver.js";
import { WG_BUNDLE } from "../../src/generated/wg/scenes.js";
import { NPC_REGISTRY } from "../../src/data/npc/npcs.js";
import { PLACE_REGISTRY } from "../../src/data/world/place.js";

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

const hubEntries = Object.values(WG_BUNDLE.entries).filter(
  (entry) => entry.hub?.type === "place",
);
const hubCounts = new Map();
for (const entry of hubEntries) {
  for (const placeKey of entry.placeKeys || []) {
    hubCounts.set(placeKey, (hubCounts.get(placeKey) || 0) + 1);
  }
}
const expectedPlaceKeys = [
  ...PLACE_REGISTRY.map((definition) => definition.key),
  ...NPC_REGISTRY.filter((definition) => !definition.meta?.example).map(
    (definition) => `home_${definition.id}`,
  ),
];

check(
  "every registered place and generated NPC home has exactly one authored WG hub",
  expectedPlaceKeys.every((key) => hubCounts.get(key) === 1) &&
    [...hubCounts.keys()].every((key) => expectedPlaceKeys.includes(key)),
);

const game = new Game({
  seed: 920,
  startDate: START,
  playerOptions: { startPlaceId: null },
});
const generatedPlaces = [...game.world.locations.values()].flatMap((location) =>
  location.places.map((place) => ({ location, place })),
);

let everyGeneratedPlaceMaterializes = true;
for (const { location, place } of generatedPlaces) {
  game.currentLocationId = location.id;
  game.setCurrentPlace({ placeId: place.id });
  game.currentStorySceneId = null;

  const entry = getWGPlaceHubEntry(game);
  const scene = buildScene(game);
  const availableChoices = choices(scene);
  everyGeneratedPlaceMaterializes &&=
    entry?.placeKeys.includes(place.key) &&
    scene.kind === "place" &&
    scene.heading === place.name &&
    availableChoices.filter((choice) => choice.action.type === "wg").length >= 2 &&
    availableChoices.some((choice) => choice.action.type === "leave");
}
check(
  "generated place instances materialize their authored activities and exit",
  everyGeneratedPlaceMaterializes,
);

game.currentLocationId = game.homeLocationId;
game.setCurrentPlace({ placeId: game.homePlaceId });
game.currentStorySceneId = null;
let scene = buildScene(game);
const rest = choices(scene).find((choice) => choice.id === "rest");
const restStart = game.now.getTime();
performChoice(game, { sceneId: scene.id, choiceId: rest.id });
check(
  "placeholder activities stay on their authored hub without mutating time",
  game.currentStorySceneId === "place.player-home" &&
    game.now.getTime() === restStart &&
    buildScene(game).kind === "place",
);

scene = buildScene(game);
const leave = choices(scene).find((choice) => choice.action.type === "leave");
performChoice(game, { sceneId: scene.id, choiceId: leave.id });
check(
  "@leave-place exits both the place and its active authored hub",
  game.currentPlaceId === null && game.currentStorySceneId === null,
);

if (failures.length) {
  console.error("\nWG place hub failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG place hub tests passed.");
}
