import { keyedRandom01 } from "../../../shared/util/random.js";
import {
  LOCATION_DESCRIPTIONS,
  SCENE_TEXT,
} from "../../../content/scene/genericText.js";
import {
  DEFAULT_NPC_INTERACTION_MINUTES,
  SCENE_ACTION_TYPE,
} from "../../../data/scene/actions.js";
import { PLACE_ENTER_MINUTES } from "../../../data/world/travel.js";
import { buildLocalMapView } from "./mapView.js";
import { buildSceneStatus } from "./sceneContext.js";
import { createChoice } from "./choiceContract.js";
import { createScene } from "./sceneContract.js";
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
    durationMinutes: DEFAULT_NPC_INTERACTION_MINUTES,
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
  return [personChoice(npc), ...offers.map(entryChoice)];
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

  const authored = materializeWGScene(game, definition);
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
  if (game.currentStory?.type === "scene") {
    const definition = getWGScene(game.currentStory.id);
    if (!definition) {
      throw new Error(`Unknown active WG scene: ${game.currentStory.id}`);
    }
    if (definition.kind === "place") {
      return buildPlaceScene(game, definition);
    }
    return materializeWGScene(game, definition);
  }
  if (game.currentStory?.type === "sequence") {
    const definition = getWGSequence(game.currentStory.id);
    if (!definition) {
      throw new Error(`Unknown active WG sequence: ${game.currentStory.id}`);
    }
    return materializeWGSequence(game, definition, game.currentStory.passageId);
  }
  if (game.currentStory !== null) {
    throw new Error(`Unknown active WG story type: ${String(game.currentStory?.type)}`);
  }

  const scene = game.currentPlace
    ? buildPlaceScene(game)
    : buildLocationScene(game);
  return createScene(scene);
}
