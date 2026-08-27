import { Game } from "../../src/classes/game/game.js";
import {
  BUS_BOARDING_SCENE_ID,
  BUS_TIMETABLE_SCENE_ID,
  getNextBusDeparture,
  getUpcomingBusDepartures,
  listBusStops,
  listBusTravelOptions,
} from "../../src/classes/game/busTransit.js";
import {
  CHOICE_ERROR_CODE,
  performChoice,
} from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import { listNavigationDestinations } from "../../src/classes/game/navigation.js";

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

function putPlayerAtStop(game, stop) {
  game.moveTo(String(stop.location.id));
  game.setCurrentPlace({ placeId: stop.place.id });
  game.currentStory = null;
}

function makeGame(startDate = new Date("2026-08-24T06:01:00.000Z")) {
  return new Game({
    seed: 920,
    startDate,
    playerOptions: { startPlaceId: null },
    npcTemplates: [],
  });
}

const scheduleGame = makeGame();
const scheduleStops = listBusStops(scheduleGame);
const scheduleStop = scheduleStops[0].place;
check("the generated world has multiple bus stops", scheduleStops.length > 1);
check(
  "every bus stop receives the identical shared schedule",
  scheduleStops.every(
    ({ place }) =>
      JSON.stringify(place.props.schedule) === JSON.stringify(scheduleStop.props.schedule),
  ),
);

const departureCases = [
  ["2026-08-24T06:00:00.000Z", 0, "06:00"],
  ["2026-08-24T06:01:00.000Z", 14, "06:15"],
  ["2026-08-24T21:59:00.000Z", 1, "22:00"],
  ["2026-08-24T22:01:00.000Z", 34, "22:35"],
  ["2026-08-25T05:51:00.000Z", 9, "06:00"],
];
for (const [iso, waitMinutes, clock] of departureCases) {
  const departure = getNextBusDeparture(scheduleStop, new Date(iso));
  check(
    `the next departure from ${iso.slice(11, 16)} is ${clock}`,
    departure.waitMinutes === waitMinutes &&
      departure.at.toISOString().slice(11, 16) === clock,
  );
}
const overnightDepartures = getUpcomingBusDepartures(
  scheduleStop,
  new Date("2026-08-24T23:40:00.000Z"),
  { count: 3 },
);
check(
  "upcoming departures continue cleanly across midnight",
  overnightDepartures.map(({ at }) => at.toISOString().slice(11, 16)).join(",") ===
    "23:45,00:20,00:55",
);

const game = makeGame();
const stops = listBusStops(game);
const source = stops[0];
putPlayerAtStop(game, source);
game.player.money = 2.49;
let scene = buildScene(game);
let wait = choices(scene).find((choice) => choice.id === "wait");
check(
  "the bus-stop flavor text states the live ticket price",
  scene.paragraphs.some((paragraph) => paragraph.includes("£2.50")),
);
check(
  "waiting is visible but disabled below the fare",
  wait && !wait.enabled && wait.durationMinutes === 14 && wait.disabledReason.includes("£2.50"),
);

game.player.money = 2.5;
scene = buildScene(game);
wait = choices(scene).find((choice) => choice.id === "wait");
const timetable = choices(scene).find((choice) => choice.id === "timetable");
check("waiting is enabled at exactly the fare", wait?.enabled === true);
check(
  "the timetable choice opens the runtime timetable scene",
  timetable?.action.target === BUS_TIMETABLE_SCENE_ID,
);

performChoice(game, { sceneId: scene.id, choiceId: timetable.id });
let timetableScene = buildScene(game);
check(
  "the timetable reports both service periods and upcoming departures",
  game.currentStory?.id === BUS_TIMETABLE_SCENE_ID &&
    timetableScene.paragraphs.some((paragraph) => paragraph.includes("06:00–22:00")) &&
    timetableScene.paragraphs.some((paragraph) => paragraph.includes("22:00–06:00")) &&
    timetableScene.paragraphs.some((paragraph) => paragraph.includes("06:15")),
);
const back = choices(timetableScene).find((choice) => choice.id === "back");
performChoice(game, { sceneId: timetableScene.id, choiceId: back.id });
check(
  "returning from the timetable keeps the player inside the same bus stop",
  game.currentStory === null && game.currentPlaceId === source.place.id,
);

scene = buildScene(game);
wait = choices(scene).find((choice) => choice.id === "wait");
const waitStartedAt = game.now.getTime();
const moneyBeforeWaiting = game.player.money;
performChoice(game, { sceneId: scene.id, choiceId: wait.id });
check(
  "waiting advances exactly to the scheduled bus and does not charge a fare",
  game.currentStory?.id === BUS_BOARDING_SCENE_ID &&
    game.now.getTime() === waitStartedAt + 14 * 60_000 &&
    game.player.money === moneyBeforeWaiting,
);

let boardingScene = buildScene(game);
const destinationChoices = choices(boardingScene).filter(
  (choice) => choice.action.type === "bus-travel",
);
const travelOptions = listBusTravelOptions(game);
check(
  "the arriving bus lists every other bus stop exactly once",
  destinationChoices.length === stops.length - 1 &&
    new Set(destinationChoices.map((choice) => choice.action.targetPlaceId)).size ===
      stops.length - 1,
);
check(
  "destination labels include location and stop names with calculated durations",
  destinationChoices.every((choice) => {
    const option = travelOptions.find(
      ({ place }) => String(place.id) === choice.action.targetPlaceId,
    );
    return Boolean(
      option &&
        choice.label.includes(option.location.name) &&
        choice.label.includes(option.place.name) &&
        choice.durationMinutes ===
          Math.max(
            1,
            Math.ceil(
              option.walkingMinutes * Number(source.place.props.travelTimeMult),
            ),
          ) &&
        choice.costs[0]?.amount === 2.5,
    );
  }),
);

const loadedBoardingGame = Game.fromJSON(JSON.parse(JSON.stringify(game)));
const loadedBoardingScene = buildScene(loadedBoardingGame);
check(
  "save and load preserve the live boarding scene",
  loadedBoardingGame.currentStory?.id === BUS_BOARDING_SCENE_ID &&
    choices(loadedBoardingScene).filter(
      (choice) => choice.action.type === "bus-travel",
    ).length === destinationChoices.length,
);
const stepAway = choices(loadedBoardingScene).find(
  (choice) => choice.id === "step-away",
);
const stepAwayTime = loadedBoardingGame.now.getTime();
const stepAwayMoney = loadedBoardingGame.player.money;
performChoice(loadedBoardingGame, {
  sceneId: loadedBoardingScene.id,
  choiceId: stepAway.id,
});
check(
  "stepping away preserves the completed wait and charges nothing",
  loadedBoardingGame.currentStory === null &&
    loadedBoardingGame.currentPlaceId === source.place.id &&
    loadedBoardingGame.now.getTime() === stepAwayTime &&
    loadedBoardingGame.player.money === stepAwayMoney,
);

const selectedChoice = destinationChoices[0];
const selectedOption = travelOptions.find(
  ({ place }) => String(place.id) === selectedChoice.action.targetPlaceId,
);
const gpsDestination = listNavigationDestinations(game).find(
  (entry) => entry.placeId === String(selectedOption.place.id),
);
const walkingRoute = game.world.map.getTravelTotal(
  source.location.id,
  selectedOption.location.id,
);
const gpsActivation = game.setGpsTarget(gpsDestination.placeId);
check(
  "bus stops remain selectable GPS destinations using the walking route only",
  gpsActivation.active &&
    game.getGpsRoute()?.totalMinutes === walkingRoute.minutes &&
    selectedChoice.durationMinutes ===
      Math.max(1, Math.ceil(walkingRoute.minutes * source.place.props.travelTimeMult)),
);

const travelStartedAt = game.now.getTime();
const travelStartedMoney = game.player.money;
performChoice(game, {
  sceneId: boardingScene.id,
  choiceId: selectedChoice.id,
});
check(
  "bus travel atomically charges, advances time, and arrives inside the destination stop",
  game.player.money === travelStartedMoney - 2.5 &&
    game.now.getTime() === travelStartedAt + selectedChoice.durationMinutes * 60_000 &&
    String(game.currentLocationId) === String(selectedOption.location.id) &&
    String(game.currentPlaceId) === String(selectedOption.place.id) &&
    game.gpsTarget === null,
);

const authorityGame = makeGame(new Date("2026-08-24T06:15:00.000Z"));
const authoritySource = listBusStops(authorityGame)[0];
putPlayerAtStop(authorityGame, authoritySource);
authorityGame.player.money = 2.5;
let authorityScene = buildScene(authorityGame);
performChoice(authorityGame, {
  sceneId: authorityScene.id,
  choiceId: "wait",
});
authorityScene = buildScene(authorityGame);
const formerlyAffordable = choices(authorityScene).find(
  (choice) => choice.action.type === "bus-travel",
);
authorityGame.player.money = 2.49;
const beforeRejectedTravel = JSON.stringify(authorityGame);
let rejectedCode = null;
try {
  performChoice(authorityGame, {
    sceneId: authorityScene.id,
    choiceId: formerlyAffordable.id,
  });
} catch (error) {
  rejectedCode = error?.code;
}
check(
  "a canonically unaffordable journey is rejected without mutating state",
  rejectedCode === CHOICE_ERROR_CODE.disabledChoice &&
    JSON.stringify(authorityGame) === beforeRejectedTravel,
);

if (failures.length) {
  console.error("\nBus transit failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All bus transit tests passed.");
}
