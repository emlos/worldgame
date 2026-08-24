import { keyedRandom01 } from "../../../shared/util/random.js";
import {
  LOCATION_DESCRIPTIONS,
  PLACE_DESCRIPTIONS,
} from "../../../data/scene/descriptions.js";
import { SCENE_ACTION_TYPE } from "../../../data/scene/actions.js";
import { buildLocalMapView } from "./mapView.js";
import { buildSceneStatus } from "./sceneContext.js";
import { createChoice, validateSceneChoices } from "./choiceContract.js";

function stablePick(lines, game, key) {
  const index = Math.floor(keyedRandom01(game.seed, key) * lines.length);
  return lines[index];
}

function personChoice(npc) {
  return createChoice({
    id: `greet:${npc.id}`,
    icon: "👋",
    label: `Say hello to ${npc.meta?.shortName || npc.name}`,
    durationMinutes: 5,
    effectsPreview: [
      {
        type: "relationship",
        amount: 0.02,
        targetId: npc.id,
        label: "+Relationship",
      },
    ],
    action: { type: SCENE_ACTION_TYPE.greet, npcId: npc.id },
  });
}

function buildLocationScene(game) {
  const location = game.location;
  const connections = [...location.neighbors.entries()];
  const streetNames = [
    ...new Set(connections.map(([, edge]) => edge.streetName).filter(Boolean)),
  ];
  const nearbyStreet = streetNames[0];
  const people = game.getNPCsAtCurrentPosition();

  const places = location.places.map((place) =>
    createChoice({
      id: `enter:${place.id}`,
      icon: place.props?.icon || "▣",
      label: place.name,
      durationMinutes: 2,
      action: { type: SCENE_ACTION_TYPE.enter, placeId: place.id },
    }),
  );

  const travel = connections.map(([targetLocationId, edge]) => {
    const destination = game.world.getLocation(targetLocationId);
    return createChoice({
      id: `travel:${targetLocationId}`,
      icon: "→",
      label: `Follow ${edge.streetName || "the road"} to ${destination.name}`,
      durationMinutes: edge.minutes,
      action: { type: SCENE_ACTION_TYPE.travel, targetLocationId },
    });
  });

  return {
    id: `location:${location.id}:${game.now.toISOString()}`,
    kind: "location",
    heading: nearbyStreet
      ? `${nearbyStreet} · ${location.name}`
      : location.name,
    status: buildSceneStatus(game),
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
          createChoice({
            id: "loiter:15",
            icon: "⌛",
            label: "Loiter for a while",
            durationMinutes: 15,
            action: { type: SCENE_ACTION_TYPE.loiter },
          }),
        ],
      },
    ].filter((section) => section.choices.length),
  };
}

function buildPlaceScene(game) {
  const place = game.currentPlace;
  const location = game.location;
  const people = game.getNPCsAtCurrentPosition();

  return {
    id: `place:${place.id}:${game.now.toISOString()}`,
    kind: "place",
    heading: place.name,
    status: buildSceneStatus(game),
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
          createChoice({
            id: "leave",
            icon: "🚪",
            label: "Leave",
            durationMinutes: 1,
            action: { type: SCENE_ACTION_TYPE.leave },
          }),
        ],
      },
    ].filter((section) => section.choices.length),
  };
}

export function buildScene(game) {
  const scene = game.currentPlace
    ? buildPlaceScene(game)
    : buildLocationScene(game);
  return validateSceneChoices(scene);
}
