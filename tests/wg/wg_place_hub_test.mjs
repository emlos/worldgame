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
  game.currentStory = null;

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

const jail = generatedPlaces.find(({ place }) => place.key === "jail");
game.currentLocationId = jail.location.id;
game.setCurrentPlace({ placeId: jail.place.id });
game.currentStory = null;
const taylor = game.npcs.get("taylor");
taylor.setLocationAndPlace(jail.location.id, jail.place.id);
taylor.brain.currentGoal = null;
taylor.brain.currentAction = null;
let scene = buildScene(game);
const desk = choices(scene).find((choice) => choice.id === "desk");
const jailActivityStart = game.now.getTime();
performChoice(game, { sceneId: scene.id, choiceId: desk.id });
const reloadedJailScene = buildScene(game);
check(
  "active place hubs preserve their live place heading without placeholder NPC choices",
  game.currentStory?.type === "scene" && game.currentStory.id === "place.jail" &&
    game.now.getTime() === jailActivityStart &&
    game.getNPCsAtCurrentPosition().includes(taylor) &&
    reloadedJailScene.heading === jail.place.name &&
    !reloadedJailScene.sections.some((section) => section.id === "people") &&
    !choices(reloadedJailScene).some((choice) => choice.id === "greet:taylor"),
);

const locationAwayFromJail = [...game.world.locations.keys()].find(
  (locationId) => locationId !== jail.location.id,
);
taylor.setLocationAndPlace(locationAwayFromJail, null);
check(
  "moving an NPC away leaves the authored place hub stable",
  buildScene(game).heading === jail.place.name &&
    !choices(buildScene(game)).some((choice) => choice.id === "greet:taylor"),
);

game.currentLocationId = game.homeLocationId;
game.setCurrentPlace({ placeId: game.homePlaceId });
game.currentStory = null;
scene = buildScene(game);
const rest = choices(scene).find((choice) => choice.id === "rest");
const restStart = game.now.getTime();
game.player.setStatBase("energy", 20);
performChoice(game, { sceneId: scene.id, choiceId: rest.id });
check(
  "authored home activities stay on their hub and apply their duration",
  game.currentStory?.type === "scene" && game.currentStory.id === "place.player-home" &&
    game.now.getTime() === restStart + 8 * 60 * 60_000 &&
    game.player.getStatBase("energy") === 95 &&
    buildScene(game).kind === "place",
);

scene = buildScene(game);
const leave = choices(scene).find((choice) => choice.action.type === "leave");
performChoice(game, { sceneId: scene.id, choiceId: leave.id });
check(
  "@leave-place exits both the place and its active authored hub",
  game.currentPlaceId === null && game.currentStory === null,
);

if (failures.length) {
  console.error("\nWG place hub failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG place hub tests passed.");
}
