import { keyedRandom01 } from "../../../shared/util/random.js";
import {
  LOCATION_DESCRIPTIONS,
  SCENE_TEXT,
} from "../../../content/scene/genericText.js";
import { SCENE_ACTION_TYPE } from "../../../data/scene/actions.js";
import { PLACE_ENTER_MINUTES } from "../../../data/world/travel.js";
import { buildLocalMapView } from "./mapView.js";
import { buildSceneStatus } from "./sceneContext.js";
import { createChoice } from "./choiceContract.js";
import { createScene } from "./sceneContract.js";
import { buildGlobalSceneAlerts } from "./sceneAlerts.js";
import {
  getWGOfferEntries,
  getWGPlaceHubEntry,
  WG_OFFER_TYPE,
} from "./wg/entryResolver.js";
import {
  materializeWGScene,
  materializeWGSequence,
} from "./wg/sceneMaterializer.js";
import { getWGScene, getWGSequence } from "./wg/storyRuntime.js";
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
    paragraphs: [
      ...authored.paragraphs,
      `A single bus ticket costs ${formatBusFare(fare)}.`,
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
    paragraphs: [
      ...authored.paragraphs,
      ...periodText,
      `The next departures are ${departureText}.`,
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

function entryChoice(entry) {
  return createChoice({
    id: `entry:${entry.id}`,
    icon: entry.icon,
    label: entry.label,
    action: {
      type: SCENE_ACTION_TYPE.wg,
      target: entry.sceneId,
      effects: [],
      entryId: entry.id,
    },
  });
}

function personChoices(game, npc) {
  const offers = getWGOfferEntries(game, {
    type: WG_OFFER_TYPE.npc,
    npcId: npc.id,
  });
  return offers.map(entryChoice);
}

function buildLocationScene(game) {
  const location = game.location;
  const connections = [...location.neighbors.entries()];
  const streetNames = [
    ...new Set(connections.map(([, edge]) => edge.streetName).filter(Boolean)),
  ];
  const nearbyStreet = streetNames[0];
  const people = game.getNPCsAtCurrentPosition();
  const gpsRoute = game.getGpsRoute();

  const places = location.places.map((place) => {
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
    paragraphs: [
      SCENE_TEXT.locationIntroduction(nearbyStreet, location.name),
      stablePick(LOCATION_DESCRIPTIONS, game, `location:${location.id}`),
    ],
    sections: [
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
  const hubEntry = getWGPlaceHubEntry(game);
  if (!hubEntry) {
    throw new Error(`No authored WG hub exists for place key '${String(place.key)}'`);
  }
  if (activeDefinition && activeDefinition.id !== hubEntry.sceneId) {
    throw new Error(
      `Active WG place hub '${activeDefinition.id}' does not match ` +
        `current place hub '${hubEntry.sceneId}'`,
    );
  }
  const definition = activeDefinition || getWGScene(hubEntry.sceneId);
  if (!definition || definition.kind !== "place") {
    throw new Error(`Invalid authored WG hub '${hubEntry.id}' for '${String(place.key)}'`);
  }

  let authored = materializeWGScene(game, definition);
  if (place.key === BUS_STOP_KEY) authored = decorateBusStopHub(game, authored);
  const people = game.getNPCsAtCurrentPosition();
  const eventEntries = getWGOfferEntries(game, {
    type: WG_OFFER_TYPE.place,
  });
  const events = eventEntries.map(entryChoice);
  const hubText = eventEntries
    .map((entry) => entry.hubText)
    .filter((text) => typeof text === "string" && text);

  return createScene({
    ...authored,
    kind: "place",
    heading: place.name,
    paragraphs: [...authored.paragraphs, ...hubText],
    sections: [
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
    ].filter((section) => section.choices.length),
  });
}

export function buildScene(game) {
  let scene;
  if (game.currentStory?.type === "scene") {
    const definition = getWGScene(game.currentStory.id);
    if (!definition) {
      throw new Error(`Unknown active WG scene: ${game.currentStory.id}`);
    }
    if (definition.kind === "place") {
      scene = buildPlaceScene(game, definition);
    } else {
      scene = decorateRuntimeWGScene(
        game,
        definition.id,
        materializeWGScene(game, definition),
      );
    }
  } else if (game.currentStory?.type === "sequence") {
    const definition = getWGSequence(game.currentStory.id);
    if (!definition) {
      throw new Error(`Unknown active WG sequence: ${game.currentStory.id}`);
    }
    scene = materializeWGSequence(game, definition, game.currentStory.passageId);
  } else if (game.currentStory !== null) {
    throw new Error(`Unknown active WG story type: ${String(game.currentStory?.type)}`);
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
