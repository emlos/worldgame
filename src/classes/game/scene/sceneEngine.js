import { keyedRandom01 } from "../../../shared/util/random.js";
import {
  LOCATION_DESCRIPTIONS,
  PLACE_DESCRIPTIONS,
  SCENE_TEXT,
} from "../../../content/scene/genericText.js";
import { SCENE_ACTION_TYPE } from "../../../data/scene/actions.js";
import { buildLocalMapView } from "./mapView.js";
import { buildSceneStatus } from "./sceneContext.js";
import { createChoice } from "./choiceContract.js";
import { createScene } from "./sceneContract.js";

const ENTER_PLACE_MINUTES = 2;

function stablePick(lines, game, key) {
  const index = Math.floor(keyedRandom01(game.seed, key) * lines.length);
  return lines[index];
}

function personChoice(npc) {
  const npcName = npc.meta?.shortName || npc.name;
  return createChoice({
    id: `greet:${npc.id}`,
    icon: "👋",
    label: SCENE_TEXT.greetChoice(npcName),
    durationMinutes: 5,
    effectsPreview: [
      {
        type: "relationship",
        amount: 0.02,
        targetId: npc.id,
        label: SCENE_TEXT.relationshipPreview,
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

  const places = location.places.map((place) => {
    const access = game.getPlaceAccess(place, {
      at: new Date(game.now.getTime() + ENTER_PLACE_MINUTES * 60_000),
    });
    return createChoice({
      id: `enter:${place.id}`,
      icon: place.props?.icon || "▣",
      label: place.name,
      durationMinutes: ENTER_PLACE_MINUTES,
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
        choices: people.map(personChoice),
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
      SCENE_TEXT.placeIntroduction(place.name, location.name),
      stablePick(PLACE_DESCRIPTIONS, game, `place:${place.id}`),
    ],
    sections: [
      {
        id: "people",
        heading: SCENE_TEXT.sectionHeading.people,
        choices: people.map(personChoice),
      },
      {
        id: "navigation",
        heading: SCENE_TEXT.sectionHeading.navigation,
        choices: [
          createChoice({
            id: "leave",
            icon: "🚪",
            label: SCENE_TEXT.leaveChoice,
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
  return createScene(scene);
}
