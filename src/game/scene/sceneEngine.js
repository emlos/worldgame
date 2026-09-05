import { keyedRandom01 } from "../../shared/util/random.js";
import { isPlaceUnlocked } from "../../world/model/place.js";
import {
  LOCATION_DESCRIPTIONS,
  PLACE_DESCRIPTIONS,
  SCENE_TEXT,
} from "./text.js";
import { SCENE_ACTION_TYPE } from "./actions.js";
import {
  PLACE_ENTER_MINUTES,
  PLACE_LEAVE_MINUTES,
} from "../../world/data/travel.js";
import { buildLocalMapView } from "./mapView.js";
import { buildSceneStatus } from "./sceneContext.js";
import { createChoice } from "./choiceContract.js";
import { createScene } from "./sceneContract.js";
import { buildGlobalSceneAlerts } from "./sceneAlerts.js";
import {
  getWGOfferScenes,
  getWGPlaceHubScene,
  WG_OFFER_TYPE,
} from "../../story/wg/runtime/sceneExposure.js";
import {
  materializeWGScene,
  materializeWGSystem,
} from "../../story/wg/runtime/sceneMaterializer.js";
import { getWGScene } from "../../story/wg/runtime/storyRuntime.js";
import { materializeWGLocationContributions } from "../../story/wg/runtime/locationContributions.js";
import {
  BUS_BOARDING_SCENE_ID,
  BUS_STOP_KEY,
  BUS_TIMETABLE_SCENE_ID,
  getBusFare,
  getBusSchedulePeriods,
  getCurrentBusStop,
  getNextBusDeparture,
  getUpcomingBusDepartures,
  listBusTravelOptions,
} from "../busTransit.js";

function formatBusFare(fare) {
  return `£${fare.toFixed(2)}`;
}

function formatClockTime(date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function paragraphBlock(text) {
  return { type: "paragraph", text };
}

function paragraphBlocks(values) {
  return values.map(paragraphBlock);
}

function decorateBusStopHub(game, authored) {
  const place = getCurrentBusStop(game);
  if (!place) throw new Error("Bus-stop hub requires the player to be at a bus stop");

  const fare = getBusFare(place);
  const nextDeparture = getNextBusDeparture(place, game.now);
  const canAfford = game.player.money >= fare;
  let foundWaitChoice = false;
  const sections = authored.sections.map((section) => ({
    ...section,
    choices: section.choices.map((choice) => {
      if (choice.id !== "wait") return choice;
      foundWaitChoice = true;
      return createChoice({
        ...choice,
        durationMinutes: nextDeparture.waitMinutes,
        enabled: choice.enabled && canAfford,
        disabledReason: !choice.enabled
          ? choice.disabledReason
          : canAfford
            ? null
            : `You need ${formatBusFare(fare)} for a bus ticket.`,
      });
    }),
  }));
  if (!foundWaitChoice) {
    throw new Error("Authored bus-stop hub requires a 'wait' choice");
  }

  return {
    ...authored,
    content: [
      ...authored.content,
      paragraphBlock(`A single bus ticket costs ${formatBusFare(fare)}.`),
    ],
    sections,
  };
}

function decorateBusTimetableScene(game, authored) {
  const place = getCurrentBusStop(game);
  if (!place) throw new Error("Bus timetable requires the player to be at a bus stop");

  const periods = getBusSchedulePeriods(place);
  const periodText = periods.map(
    (period) =>
      `${capitalize(period.label)} service runs ${period.from}–${period.to}, ` +
      `with a bus every ${period.everyMinutes} minutes.`,
  );
  const departures = getUpcomingBusDepartures(place, game.now, { count: 4 });
  const departureText = departures.map((entry) => formatClockTime(entry.at)).join(", ");

  return {
    ...authored,
    content: [
      ...authored.content,
      ...paragraphBlocks(periodText),
      paragraphBlock(`The next departures are ${departureText}.`),
    ],
  };
}

function decorateBusBoardingScene(game, authored) {
  const place = getCurrentBusStop(game);
  if (!place) throw new Error("Bus boarding requires the player to be at a bus stop");

  const fare = getBusFare(place);
  const canAfford = game.player.money >= fare;
  const destinations = listBusTravelOptions(game, place).map((destination) =>
    createChoice({
      id: `bus-travel:${destination.place.id}`,
      icon: destination.place.props?.icon || "🚌",
      label: `${destination.location.name} — ${destination.place.name}`,
      durationMinutes: destination.travelMinutes,
      costs: [
        {
          type: "money",
          amount: fare,
          label: formatBusFare(fare),
          currency: "GBP",
        },
      ],
      enabled: canAfford,
      disabledReason: canAfford
        ? null
        : `You need ${formatBusFare(fare)} for a bus ticket.`,
      action: {
        type: SCENE_ACTION_TYPE.busTravel,
        targetPlaceId: String(destination.place.id),
      },
    }),
  );

  const sections = authored.sections.length
    ? authored.sections.map((section, index) =>
        index === 0
          ? { ...section, choices: [...destinations, ...section.choices] }
          : section,
      )
    : [{ id: "choices", heading: "Destinations", choices: destinations }];
  return { ...authored, sections };
}

function decorateRuntimeWGScene(game, definitionId, authored) {
  if (definitionId === BUS_TIMETABLE_SCENE_ID) {
    return decorateBusTimetableScene(game, authored);
  }
  if (definitionId === BUS_BOARDING_SCENE_ID) {
    return decorateBusBoardingScene(game, authored);
  }
  return authored;
}

function stablePick(lines, game, key) {
  const index = Math.floor(keyedRandom01(game.seed, key) * lines.length);
  return lines[index];
}

function exposedSceneChoice(scene) {
  return createChoice({
    id: `scene:${scene.id}`,
    icon: scene.icon,
    label: scene.label,
    action: {
      type: SCENE_ACTION_TYPE.wg,
      target: scene.id,
      effects: [],
    },
  });
}

function personChoices(game, npc) {
  const offers = getWGOfferScenes(game, {
    type: WG_OFFER_TYPE.npc,
    npcId: npc.id,
  });
  return offers.map(exposedSceneChoice);
}

function buildLocationScene(game) {
  const location = game.location;
  const authored = materializeWGLocationContributions(game);
  const connections = [...location.neighbors.entries()];
  const streetNames = [
    ...new Set(connections.map(([, edge]) => edge.streetName).filter(Boolean)),
  ];
  const nearbyStreet = streetNames[0];
  const people = game.getNPCsAtCurrentPosition();
  const gpsRoute = game.getGpsRoute();

  const places = location.places.filter(isPlaceUnlocked).map((place) => {
    const access = game.getPlaceAccess(place, {
      at: new Date(game.now.getTime() + PLACE_ENTER_MINUTES * 60_000),
    });
    return createChoice({
      id: `enter:${place.id}`,
      icon: place.props?.icon || "▣",
      label: place.name,
      durationMinutes: PLACE_ENTER_MINUTES,
      enabled: access.allowed,
      disabledReason: SCENE_TEXT.placeAccess(access, game.currentPlace?.name),
      action: { type: SCENE_ACTION_TYPE.enter, placeId: place.id },
    });
  });

  const travel = connections.map(([targetLocationId, edge]) => {
    const destination = game.world.getLocation(targetLocationId);
    return createChoice({
      id: `travel:${targetLocationId}`,
      icon: "→",
      label: SCENE_TEXT.travelChoice(edge.streetName, destination.name),
      durationMinutes: edge.minutes,
      navigation:
        String(targetLocationId) === gpsRoute?.nextLocationId
          ? {
              kind: "gps",
              destinationName: gpsRoute.destination.name,
              remainingMinutes: gpsRoute.totalMinutes,
            }
          : null,
      action: { type: SCENE_ACTION_TYPE.travel, targetLocationId },
    });
  });

  return {
    id: `location:${location.id}:${game.now.toISOString()}`,
    kind: "location",
    heading: SCENE_TEXT.locationHeading(nearbyStreet, location.name),
    status: buildSceneStatus(game),
    map: buildLocalMapView(game),
    content: [
      paragraphBlock(SCENE_TEXT.locationIntroduction(nearbyStreet, location.name)),
      paragraphBlock(stablePick(LOCATION_DESCRIPTIONS, game, `location:${location.id}`)),
      ...authored.content,
    ],
    sections: [
      ...authored.sections,
      {
        id: "places",
        heading: SCENE_TEXT.sectionHeading.places,
        choices: places,
      },
      {
        id: "people",
        heading: SCENE_TEXT.sectionHeading.people,
        choices: people.flatMap((npc) => personChoices(game, npc)),
      },
      {
        id: "travel",
        heading: SCENE_TEXT.sectionHeading.travel,
        choices: travel,
      },
      {
        id: "local",
        heading: SCENE_TEXT.sectionHeading.local,
        choices: [
          createChoice({
            id: "loiter:15",
            icon: "⌛",
            label: SCENE_TEXT.loiterChoice,
            durationMinutes: 15,
            action: { type: SCENE_ACTION_TYPE.loiter },
          }),
        ],
      },
    ].filter((section) => section.choices.length),
  };
}

function buildPlaceScene(game, activeDefinition = null) {
  const place = game.currentPlace;
  if (!place) throw new Error("A place hub requires a current place");
  const hubScene = getWGPlaceHubScene(game);
  if (activeDefinition && activeDefinition.id !== hubScene?.id) {
    throw new Error(
      `Active WG place hub '${activeDefinition.id}' does not match ` +
        `current place hub '${hubScene?.id ?? "implicit"}'`,
    );
  }
  const definition = activeDefinition || hubScene;
  if (definition && definition.kind !== "place") {
    throw new Error(
      `Invalid authored WG hub '${definition.id}' for '${String(place.key)}'`,
    );
  }

  let authored = definition
    ? materializeWGScene(game, definition)
    : createScene({
        id: `place:${String(place.id)}:${game.now.toISOString()}`,
        kind: "place",
        heading: place.name,
        status: buildSceneStatus(game),
        map: null,
        content: [
          paragraphBlock(
            SCENE_TEXT.placeIntroduction(place.name, game.location.name),
          ),
          paragraphBlock(
            stablePick(PLACE_DESCRIPTIONS, game, `place:${String(place.id)}`),
          ),
        ],
        sections: [],
      });
  if (place.key === BUS_STOP_KEY) authored = decorateBusStopHub(game, authored);
  const people = game.getNPCsAtCurrentPosition();
  const eventScenes = getWGOfferScenes(game, {
    type: WG_OFFER_TYPE.place,
  });
  const events = eventScenes.map(exposedSceneChoice);
  const hubText = eventScenes
    .map((scene) => scene.hubText)
    .filter((text) => typeof text === "string" && text);
  const leaveChoice = createChoice({
    id: "leave",
    icon: "",
    label: SCENE_TEXT.leaveChoice,
    durationMinutes: PLACE_LEAVE_MINUTES,
    action: {
      type: SCENE_ACTION_TYPE.leave,
      effects: [],
      responses: [],
      exitStory: true,
    },
  });
  const sections = [
    ...authored.sections,
    {
      id: "events",
      heading: SCENE_TEXT.sectionHeading.events,
      choices: events,
    },
    {
      id: "people",
      heading: SCENE_TEXT.sectionHeading.people,
      choices: people.flatMap((npc) => personChoices(game, npc)),
    },
  ].filter((section) => section.choices.length);
  const navigationIndex = sections.findIndex(
    (section) => section.id === "navigation",
  );
  if (navigationIndex === -1) {
    sections.push({
      id: "navigation",
      heading: SCENE_TEXT.sectionHeading.navigation,
      choices: [leaveChoice],
    });
  } else {
    const navigation = sections[navigationIndex];
    sections[navigationIndex] = {
      ...navigation,
      choices: [...navigation.choices, leaveChoice],
    };
  }

  return createScene({
    ...authored,
    kind: "place",
    heading: place.name,
    content: [...authored.content, ...paragraphBlocks(hubText)],
    sections,
  });
}

export function buildScene(game) {
  let scene;
  if (game.currentStory) {
    const definition = getWGScene(game.currentStory.id);
    if (!definition) {
      throw new Error(`Unknown active WG scene: ${game.currentStory.id}`);
    }
    if (definition.system) {
      scene = materializeWGSystem(game, definition);
    } else if (definition.kind === "place") {
      scene = buildPlaceScene(game, definition);
    } else {
      scene = decorateRuntimeWGScene(
        game,
        definition.id,
        materializeWGScene(game, definition, game.currentStory.passageId),
      );
    }
  } else {
    scene = game.currentPlace
      ? buildPlaceScene(game)
      : buildLocationScene(game);
  }

  return createScene({
    ...scene,
    alerts: buildGlobalSceneAlerts(game),
  });
}
