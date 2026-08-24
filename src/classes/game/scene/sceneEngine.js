import { keyedRandom01 } from "../../../shared/util/random.js";
import { buildLocalMapView } from "./mapView.js";


//TODO: move to own data file - loaction files, event files, npc files for clarity?
const LOCATION_DESCRIPTIONS = [
  "People pass through at an unhurried pace, each occupied with their own destination.",
  "The surrounding streets carry the low, constant noise of the town.",
  "A few distant conversations drift through the air before fading again.",
  "The area feels lived-in, marked by the routines of the people who pass through it.",
  "Traffic and footsteps create a steady rhythm along the street.",
];

const PLACE_DESCRIPTIONS = [
  "The room has the familiar atmosphere of a place used throughout the day.",
  "Small signs of recent activity are visible around you.",
  "The sounds from outside become quieter once you step in.",
  "People come and go, rarely paying much attention to the door.",
  "The place settles into the ordinary rhythm of the day.",
];

function stablePick(lines, game, key) {
  const index = Math.floor(keyedRandom01(game.seed, key) * lines.length);
  return lines[index];
}

//TODO: should be a game method? smth like game.getNpcsAt(locationId, optional placeId) -> list of npc id's?
function peopleAtPlayerPosition(game) {
  return game.npcsArray.filter(
    (npc) =>
      String(npc.locationId) === String(game.currentLocationId) &&
      String(npc.currentPlaceId ?? "") === String(game.currentPlaceId ?? ""),
  );
}

function personChoice(npc) {
  return {
    id: `greet:${npc.id}`,
    icon: "👋",
    label: `Say hello to ${npc.meta?.shortName || npc.name}`,
    durationMinutes: 5,
    action: { type: "greet", npcId: npc.id },
  };
}

function buildStatus(game) {
  return {
    now: game.now.toISOString(),
    weather: game.world.currentWeather,
    temperatureC: game.world.temperature,
  };
}

function buildLocationScene(game) {
  const location = game.location;
  const connections = [...location.neighbors.entries()];
  const streetNames = [
    ...new Set(connections.map(([, edge]) => edge.streetName).filter(Boolean)),
  ];
  const nearbyStreet = streetNames[0];
  const people = peopleAtPlayerPosition(game);

  const places = location.places.map((place) => ({
    id: `enter:${place.id}`,
    icon: place.props?.icon || "▣",
    label: place.name,
    durationMinutes: 2,
    action: { type: "enter", placeId: place.id },
  }));

  const travel = connections.map(([targetLocationId, edge]) => {
    const destination = game.world.getLocation(targetLocationId);
    return {
      id: `travel:${targetLocationId}`,
      icon: "→",
      label: `Follow ${edge.streetName || "the road"} to ${destination.name}`,
      durationMinutes: edge.minutes,
      action: { type: "travel", targetLocationId },
    };
  });

  return {
    id: `location:${location.id}:${game.now.toISOString()}`,
    kind: "location",
    heading: nearbyStreet
      ? `${nearbyStreet} · ${location.name}`
      : location.name,
    status: buildStatus(game),
    map: buildLocalMapView(game),
    paragraphs: [
      nearbyStreet
        ? `You are near ${nearbyStreet} in ${location.name}.`
        : `You are in ${location.name}.`,
      stablePick(LOCATION_DESCRIPTIONS, game, `location:${location.id}`),
    ],
    sections: [
      { id: "places", heading: "Places of interest", choices: places },
      {
        id: "people",
        heading: "People here",
        choices: people.map(personChoice),
      },
      { id: "travel", heading: "Travel", choices: travel },
      {
        id: "local",
        heading: "Other",
        choices: [
          {
            id: "loiter:15",
            icon: "⌛",
            label: "Loiter for a while",
            durationMinutes: 15,
            action: { type: "loiter" },
          },
        ],
      },
    ].filter((section) => section.choices.length),
  };
}

function buildPlaceScene(game) {
  const place = game.currentPlace;
  const location = game.location;
  const people = peopleAtPlayerPosition(game);

  return {
    id: `place:${place.id}:${game.now.toISOString()}`,
    kind: "place",
    heading: place.name,
    status: buildStatus(game),
    map: null,
    paragraphs: [
      `You are inside ${place.name} in ${location.name}.`,
      stablePick(PLACE_DESCRIPTIONS, game, `place:${place.id}`),
    ],
    sections: [
      {
        id: "people",
        heading: "People here",
        choices: people.map(personChoice),
      },
      {
        id: "navigation",
        heading: "Navigation",
        choices: [
          {
            id: "leave",
            icon: "🚪",
            label: "Leave",
            durationMinutes: 1,
            action: { type: "leave" },
          },
        ],
      },
    ].filter((section) => section.choices.length),
  };
}

export function buildScene(game) {
  return game.currentPlace ? buildPlaceScene(game) : buildLocationScene(game);
}

export function performChoice(game, scene, choiceId) {
  const choice = scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.id === choiceId);

  if (!choice) throw new Error(`Unknown choice: ${choiceId}`);

  const minutes = choice.durationMinutes || 0;
  const action = choice.action;

  if (action.type === "travel") {
    const destination = game.world.getLocation(action.targetLocationId);
    game.runAction({
      label: `Travel to ${destination.name}`,
      minutes,
      apply(currentGame) {
        currentGame.moveTo(action.targetLocationId);
      },
    });
    return `You arrive in ${destination.name}.`;
  }

  if (action.type === "enter") {
    const place = game.location.places.find(
      (candidate) => candidate.id === action.placeId,
    );
    game.runAction({
      label: `Enter ${place.name}`,
      minutes,
      apply(currentGame) {
        currentGame.setCurrentPlace({ placeId: place.id });
      },
    });
    return `You enter ${place.name}.`;
  }

  if (action.type === "leave") {
    const placeName = game.currentPlace?.name || "the building";
    game.runAction({
      label: `Leave ${placeName}`,
      minutes,
      apply(currentGame) {
        currentGame.setCurrentPlace();
      },
    });
    return `You step outside ${placeName}.`;
  }

  if (action.type === "loiter") {
    game.runAction({ label: "Loiter", minutes });
    return "You spend a little while watching the area around you.";
  }

  if (action.type === "greet") {
    const npc = game.npcs.get(action.npcId);
    game.runAction({
      label: `Greet ${npc.name}`,
      minutes,
      apply(currentGame) {
        currentGame.player.bumpRelationship(npc.id, 0.02);
      },
    });
    return `You say hello to ${npc.meta?.shortName || npc.name}.`;
  }

  throw new Error(`Unsupported choice action: ${action.type}`);
}
