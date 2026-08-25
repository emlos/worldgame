import { Game } from "../../src/classes/game/game.js";
import { teleportNPCToPlayer } from "../../src/classes/game/debugCommands.js";
import {
  CHOICE_ERROR_CODE,
  performChoice,
} from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import {
  getEligibleWGAutomaticEntries,
  getWGOfferEntries,
  resolveWGAutomaticEntry,
  selectWGAutomaticEntry,
  WG_AUTO_TRIGGER,
  WG_OFFER_TYPE,
} from "../../src/classes/game/scene/wg/entryResolver.js";
import { WG_BUNDLE } from "../../src/generated/wg/scenes.js";
import { NPC_REGISTRY } from "../../src/data/npc/npcs.js";
import { parseExpression } from "../../tools/wg/compiler/expressionParser.js";

const START = new Date("2026-08-24T08:00:00.000Z");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function ids(entries) {
  return entries.map((entry) => entry.id);
}

function sequenceRandom(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

function entry(id, overrides = {}) {
  return {
    id,
    sceneId: "taylor.study.peek",
    placeKeys: [],
    placeTags: [],
    locationTags: [],
    offer: null,
    automaticTriggers: [],
    conditions: [],
    label: null,
    icon: null,
    priority: 0,
    chance: 1,
    weight: 1,
    ...overrides,
  };
}

const taylorTemplate = NPC_REGISTRY.find((definition) => definition.id === "taylor");
const game = new Game({
  seed: 801,
  startDate: START,
  playerOptions: { startPlaceId: null },
  npcTemplates: [{ ...taylorTemplate, behavior: null }],
});
game.setCurrentPlace({ placeId: game.homePlaceId });
const taylor = game.npcs.get("taylor");
taylor.setLocationAndPlace(game.currentLocationId, game.currentPlaceId);

const homeTag = [
  ...(Array.isArray(game.currentPlace.props.category)
    ? game.currentPlace.props.category
    : [game.currentPlace.props.category]),
  ...(game.currentPlace.props.tags || []),
].find(Boolean);
const locationTag = game.location.tags[0];
const selectorEntries = [
  entry("key-match", {
    placeKeys: ["missing", String(game.currentPlace.key)],
    offer: { type: "place" },
    label: "Key match",
  }),
  entry("key-miss", {
    placeKeys: ["missing"],
    offer: { type: "place" },
    label: "Key miss",
  }),
  entry("tag-match", {
    placeTags: [String(homeTag)],
    offer: { type: "place" },
    label: "Tag match",
  }),
  entry("location-match", {
    locationTags: [String(locationTag)],
    offer: { type: "place" },
    label: "Location match",
  }),
  entry("cross-kind-miss", {
    placeKeys: [String(game.currentPlace.key)],
    locationTags: ["definitely-missing"],
    offer: { type: "place" },
    label: "Cross-kind miss",
  }),
  entry("conditions-pass", {
    offer: { type: "place" },
    label: "Conditions pass",
    conditions: [parseExpression("true"), parseExpression("npc.taylor.present")],
  }),
  entry("conditions-fail", {
    offer: { type: "place" },
    label: "Conditions fail",
    conditions: [parseExpression("true"), parseExpression("false")],
  }),
];

const placeOfferIds = ids(
  getWGOfferEntries(game, {
    type: WG_OFFER_TYPE.place,
    entries: selectorEntries,
  }),
);
check("place-key selectors OR their repeated values", placeOfferIds.includes("key-match"));
check("nonmatching place-key selectors reject entries", !placeOfferIds.includes("key-miss"));
check("place-tag selectors match place categories", placeOfferIds.includes("tag-match"));
check("location-tag selectors match the containing location", placeOfferIds.includes("location-match"));
check("different selector kinds are ANDed", !placeOfferIds.includes("cross-kind-miss"));
check("multiple @when conditions all pass together", placeOfferIds.includes("conditions-pass"));
check("one false @when condition rejects the entry", !placeOfferIds.includes("conditions-fail"));

const npcOffer = entry("npc-offer", {
  offer: { type: "npc", npcId: "taylor" },
  label: "Invite Taylor",
});
check(
  "NPC offers are available for a present matching NPC",
  ids(
    getWGOfferEntries(game, {
      type: WG_OFFER_TYPE.npc,
      npcId: "taylor",
      entries: [npcOffer],
    }),
  ).includes("npc-offer"),
);
taylor.setLocationAndPlace(taylor.homeLocationId, taylor.homePlaceId);
check(
  "NPC offers disappear when that NPC is not at the exact player position",
  getWGOfferEntries(game, {
    type: WG_OFFER_TYPE.npc,
    npcId: "taylor",
    entries: [npcOffer],
  }).length === 0,
);
taylor.setLocationAndPlace(game.currentLocationId, game.currentPlaceId);

const placeAutomatic = entry("place-auto", {
  automaticTriggers: [WG_AUTO_TRIGGER.enterPlace],
  placeKeys: [String(game.currentPlace.key)],
});
check(
  "enter-place automatic selectors match an indoor arrival",
  ids(
    getEligibleWGAutomaticEntries(game, WG_AUTO_TRIGGER.enterPlace, {
      entries: [placeAutomatic],
    }),
  ).includes("place-auto"),
);
check(
  "enter-location automatic selectors do not run while indoors",
  getEligibleWGAutomaticEntries(game, WG_AUTO_TRIGGER.enterLocation, {
    entries: [entry("location-auto", { automaticTriggers: [WG_AUTO_TRIGGER.enterLocation] })],
  }).length === 0,
);

const high = entry("high", { priority: 10, chance: 1 });
const low = entry("low", { priority: 0, chance: 1 });
check(
  "a surviving higher priority entry suppresses lower priorities",
  selectWGAutomaticEntry([low, high], sequenceRandom([0, 0.5]))?.id === "high",
);
const gatedHigh = entry("gated-high", { priority: 10, chance: 0.25 });
check(
  "a failed chance gate falls through to the next priority",
  selectWGAutomaticEntry(
    [low, gatedHigh],
    sequenceRandom([0.9, 0, 0.5]),
  )?.id === "low",
);
const light = entry("a-light", { weight: 1 });
const heavy = entry("b-heavy", { weight: 4 });
check(
  "weight controls selection among same-priority survivors",
  selectWGAutomaticEntry(
    [light, heavy],
    sequenceRandom([0, 0, 0.3]),
  )?.id === "b-heavy",
);
check(
  "selection returns no event when every chance gate fails",
  selectWGAutomaticEntry(
    [entry("never", { chance: 0 })],
    sequenceRandom([0.5]),
  ) === null,
);

game.setCurrentPlace();
const locationEntry = entry("manual-location-resolution", {
  automaticTriggers: [WG_AUTO_TRIGGER.enterLocation],
  locationTags: [String(game.location.tags[0])],
});
const resolved = resolveWGAutomaticEntry(game, WG_AUTO_TRIGGER.enterLocation, {
  entries: [locationEntry],
  random: sequenceRandom([0, 0]),
});
check("automatic resolution enters the selected compiled passage", resolved?.id === locationEntry.id);
check("automatic resolution activates its scene", game.currentStorySceneId === "taylor.study.peek");

const menuGame = new Game({
  seed: 802,
  startDate: START,
  playerOptions: { startPlaceId: null },
  npcTemplates: [{ ...taylorTemplate, behavior: null }],
});
const menuTaylor = menuGame.npcs.get("taylor");
menuTaylor.setLocationAndPlace(menuGame.currentLocationId, null);
WG_BUNDLE.entries["test.npc-offer"] = entry("test.npc-offer", {
  offer: { type: "npc", npcId: "taylor" },
  label: "Invite Taylor",
  icon: "☕",
});
let menuScene = buildScene(menuGame);
check(
  "generated people sections include eligible NPC entry launchers",
  menuScene.sections.flatMap((section) => section.choices).some(
    (choice) => choice.id === "entry:test.npc-offer" && choice.label === "Invite Taylor",
  ),
);
const displayedNpcOffer = menuScene.sections
  .flatMap((section) => section.choices)
  .find((choice) => choice.id === "entry:test.npc-offer");
menuTaylor.setLocationAndPlace(menuTaylor.homeLocationId, menuTaylor.homePlaceId);
const unavailableBefore = JSON.stringify(menuGame);
let unavailableError = null;
try {
  performChoice(menuGame, {
    sceneId: menuScene.id,
    choiceId: displayedNpcOffer.id,
  });
} catch (error) {
  unavailableError = error;
}
check(
  "NPC entry launchers are rechecked authoritatively",
  unavailableError?.code === CHOICE_ERROR_CODE.unavailableChoice,
);
check(
  "rejected stale NPC entry launchers leave game state unchanged",
  JSON.stringify(menuGame) === unavailableBefore,
);
delete WG_BUNDLE.entries["test.npc-offer"];

const busyOfferGame = new Game({
  seed: 117,
  startDate: new Date("2026-08-24T08:45:00.000Z"),
  playerOptions: { startPlaceId: null },
});
teleportNPCToPlayer(busyOfferGame, "taylor");
const busyNpcOffers = getWGOfferEntries(busyOfferGame, {
  type: WG_OFFER_TYPE.npc,
  npcId: "taylor",
  entries: [
    entry("test.busy-npc-offer", {
      offer: { type: "npc", npcId: "taylor" },
      label: "Talk with Taylor",
    }),
  ],
});
check(
  "NPC entry launchers are hidden while the NPC has an obligation",
  busyNpcOffers.length === 0,
);

const travelGame = new Game({
  seed: 803,
  startDate: START,
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
let travelScene = buildScene(travelGame);
const travelChoice = travelScene.sections
  .flatMap((section) => section.choices)
  .find((choice) => choice.action.type === "travel");
const destination = travelGame.world.getLocation(travelChoice.action.targetLocationId);
WG_BUNDLE.entries["test.location-arrival"] = entry("test.location-arrival", {
  automaticTriggers: [WG_AUTO_TRIGGER.enterLocation],
  locationTags: [String(destination.tags[0])],
});
performChoice(travelGame, {
  sceneId: travelScene.id,
  choiceId: travelChoice.id,
});
check("travel resolves enter-location entries after arrival", travelGame.currentStorySceneId === "taylor.study.peek");
delete WG_BUNDLE.entries["test.location-arrival"];

const finalPositionGame = new Game({
  seed: 804,
  startDate: START,
  playerOptions: { startPlaceId: null },
  npcTemplates: [{ ...taylorTemplate, behavior: null }],
});
const finalTaylor = finalPositionGame.npcs.get("taylor");
finalTaylor.setLocationAndPlace(finalPositionGame.homeLocationId, finalPositionGame.homePlaceId);
finalPositionGame.story.homeEvents = {
  forgottenMugPlayed: true,
  openWindowPlayed: true,
  lateBreakfastPlayed: true,
};
const removeTimeListener = finalPositionGame.on("time", () => {
  finalTaylor.setLocationAndPlace(finalTaylor.homeLocationId, finalTaylor.homePlaceId);
});
let finalScene = buildScene(finalPositionGame);
const enterHome = finalScene.sections
  .flatMap((section) => section.choices)
  .find(
    (choice) =>
      choice.action.type === "enter" &&
      String(choice.action.placeId) === String(finalPositionGame.homePlaceId),
  );
performChoice(finalPositionGame, {
  sceneId: finalScene.id,
  choiceId: enterHome.id,
});
check(
  "post-arrival conditions observe NPC movement during the action's elapsed time",
  finalPositionGame.currentStorySceneId === null,
);
removeTimeListener();

if (failures.length) {
  console.error("\nWG entry resolver failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG entry resolver tests passed.");
}
