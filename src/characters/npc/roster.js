import { PLACE_TAGS } from "../../world/data/place.js";
import { NPC } from "./npc.js";

export function initializeNPCBrains(game) {
  for (const npc of game.npcs.values()) {
    npc.brain?.initialize(game, game.now);
  }
}

export function createNPCs(game, templates) {
  for (const definition of templates || []) {
    let npc;
    let id;

    if (definition instanceof NPC) {
      npc = definition;
      id = definition.id || definition.name;
    } else {
      npc = new NPC(definition);
      id = definition.id || npc.id || npc.name;
    }

    id = String(id || npc.name);
    npc.id = id;
    assignHomeForNPC(game, id, npc);
    game.npcs.set(id, npc);
  }
}

function assignHomeForNPC(game, id, npc) {
  const random = game.getRNG("npc-homes");
  const preference = npc?.homePreference;
  if (!preference) {
    throw new Error(`NPC '${id}' has no homePreference`);
  }

  const strategies = [];
  if (Array.isArray(preference.withKey) && preference.withKey.length) {
    strategies.push({ kind: "withKey", values: preference.withKey });
  }
  if (
    Array.isArray(preference.withPlaceCategory) &&
    preference.withPlaceCategory.length
  ) {
    strategies.push({
      kind: "withPlaceCategory",
      values: preference.withPlaceCategory,
    });
  }
  if (
    Array.isArray(preference.withLocationCategory) &&
    preference.withLocationCategory.length
  ) {
    strategies.push({
      kind: "withLocationCategory",
      values: preference.withLocationCategory,
    });
  }

  if (!strategies.length) {
    throw new Error(
      `homePreference for NPC '${id}' must include at least one of ` +
        "withKey, withPlaceCategory, withLocationCategory",
    );
  }

  const selected = strategies[(random() * strategies.length) | 0];
  const allLocations = [...game.world.locations.values()];
  if (!allLocations.length) throw new Error("World has no locations");

  const pickRandom = (values) => values[(random() * values.length) | 0];
  const placeHasAnyCategory = (place, wanted) => {
    const category = place?.props?.category;
    if (!category) return false;
    const categories = Array.isArray(category) ? category : [category];
    return categories.some((value) => wanted.has(value));
  };

  let chosenLocation = null;

  if (selected.kind === "withKey") {
    const wantedKeys = new Set(selected.values.map(String));
    const candidates = allLocations.filter((location) =>
      (location.places || []).some((place) => wantedKeys.has(String(place.key))),
    );
    if (!candidates.length) {
      throw new Error(
        `No location contains any place with key in [${[
          ...wantedKeys,
        ].join(", ")}]`,
      );
    }
    chosenLocation = pickRandom(candidates);
  }

  if (selected.kind === "withPlaceCategory") {
    const wanted = new Set(selected.values);
    let bestScore = -1;
    let best = [];

    for (const location of allLocations) {
      let score = 0;
      for (const place of location.places || []) {
        if (placeHasAnyCategory(place, wanted)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = [location];
      } else if (score === bestScore) {
        best.push(location);
      }
    }

    if (bestScore <= 0) {
      throw new Error(
        `No location has any places with category in [${[
          ...wanted,
        ].join(", ")}]`,
      );
    }
    chosenLocation = pickRandom(best);
  }

  if (selected.kind === "withLocationCategory") {
    const wanted = new Set(selected.values);
    let bestScore = -1;
    let best = [];

    for (const location of allLocations) {
      const tags = Array.isArray(location.tags) ? location.tags : [];
      let score = 0;
      for (const tag of tags) if (wanted.has(tag)) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = [location];
      } else if (score === bestScore) {
        best.push(location);
      }
    }

    if (bestScore <= 0) {
      throw new Error(
        `No location has any tags in [${[...wanted].join(", ")}]`,
      );
    }
    chosenLocation = pickRandom(best);
  }

  if (!chosenLocation) {
    throw new Error(`Failed to choose a home location for NPC '${id}'`);
  }

  const homeId = `home_${id}`;
  const displayName =
    typeof preference.nameFn === "function"
      ? preference.nameFn(chosenLocation)
      : `${npc.name}'s home`;

  const homePlace = game.world.createPlaceAt(
    {
      id: homeId,
      key: homeId,
      name: displayName,
      unlocked: false,
      props: {
        category: [PLACE_TAGS.housing],
        ownerNpcId: id,
        isResidence: true,
        discovered: false,
        icon: "🏠",
      },
    },
    chosenLocation.id,
  );

  npc.homeLocationId = String(chosenLocation.id);
  npc.homePlaceId = homePlace ? homePlace.id : homeId;
  if (!npc.locationId) {
    npc.setLocationAndPlace(String(chosenLocation.id), npc.homePlaceId);
  }
}
