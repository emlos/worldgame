import { WG_BUNDLE } from "../../../../generated/wg/scenes.js";
import { evaluateWGExpression } from "../../wg/expressionEvaluator.js";
import { createWGRuntimeContext } from "../../wg/runtimeContext.js";
import { enterWGTarget, resolveActiveWGStory } from "./storyRuntime.js";

export const WG_AUTO_TRIGGER = Object.freeze({
  enterPlace: "enter-place",
  enterLocation: "enter-location",
  leavePlace: "leave-place",
});

export const WG_OFFER_TYPE = Object.freeze({
  place: "place",
  npc: "npc",
});

export const WG_HUB_TYPE = Object.freeze({
  place: "place",
});

export class WGSceneExposureError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGSceneExposureError";
  }
}

function fail(message) {
  throw new WGSceneExposureError(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exposedSceneList(scenes) {
  const source = scenes ?? WG_BUNDLE.scenes ?? {};
  const list = Array.isArray(source) ? source : Object.values(source);
  return [...list].sort((left, right) => compareText(String(left.id), String(right.id)));
}

function listValue(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function placeTags(place) {
  return new Set([
    ...listValue(place?.props?.category).map(String),
    ...listValue(place?.props?.tags).map(String),
  ]);
}

function matchesAny(required, actual) {
  return !required?.length || required.some((value) => actual.has(String(value)));
}

function currentPosition(game) {
  return { location: game.location, place: game.currentPlace };
}

function matchesPosition(scene, position) {
  const { location, place } = position;
  if (!location) return false;

  if (scene.placeKeys?.length) {
    if (!place || !scene.placeKeys.includes(String(place.key))) return false;
  }
  if (!matchesAny(scene.placeTags, placeTags(place))) return false;
  if (!matchesAny(scene.locationTags, new Set((location.tags || []).map(String)))) {
    return false;
  }
  return true;
}

function conditionsPass(scene, context) {
  return (scene.conditions || []).every((condition) =>
    Boolean(evaluateWGExpression(condition, context)),
  );
}

function npcIsPresent(game, npcId) {
  return game
    .getNPCsAtCurrentPosition()
    .some((npc) => String(npc.id) === String(npcId));
}

export function getWGOfferScenes(
  game,
  { type, npcId = null, scenes = undefined } = {},
) {
  if (!Object.values(WG_OFFER_TYPE).includes(type)) {
    fail(`Unknown WG offer type '${String(type)}'`);
  }

  const context = createWGRuntimeContext(game);
  return exposedSceneList(scenes).filter((scene) => {
    if (scene.offer?.type !== type) return false;
    if (type === WG_OFFER_TYPE.place && !game.currentPlace) return false;
    if (type === WG_OFFER_TYPE.npc) {
      const offeredNpcId = String(scene.offer.npcId);
      if (offeredNpcId !== String(npcId) || !npcIsPresent(game, offeredNpcId)) {
        return false;
      }
    }
    return (
      matchesPosition(scene, currentPosition(game)) &&
      conditionsPass(scene, context)
    );
  });
}

export function getWGPlaceHubScene(game, { scenes = undefined } = {}) {
  if (!game.currentPlace) return null;

  const context = createWGRuntimeContext(game);
  const matches = exposedSceneList(scenes).filter(
    (scene) =>
      scene.hub?.type === WG_HUB_TYPE.place &&
      matchesPosition(scene, currentPosition(game)) &&
      conditionsPass(scene, context),
  );

  if (matches.length > 1) {
    fail(
      `Multiple WG place hubs match '${String(game.currentPlace.key)}': ${matches
        .map((scene) => scene.id)
        .join(", ")}`,
    );
  }
  return matches[0] ?? null;
}

export function getEligibleWGAutomaticScenes(
  game,
  trigger,
  { scenes = undefined, position = undefined } = {},
) {
  if (!Object.values(WG_AUTO_TRIGGER).includes(trigger)) {
    fail(`Unknown WG automatic trigger '${String(trigger)}'`);
  }
  const resolvedPosition = position ?? currentPosition(game);
  if (!resolvedPosition.location) return [];
  if (trigger === WG_AUTO_TRIGGER.enterPlace && !resolvedPosition.place) {
    return [];
  }
  if (trigger === WG_AUTO_TRIGGER.enterLocation && resolvedPosition.place) {
    return [];
  }
  if (trigger === WG_AUTO_TRIGGER.leavePlace && !resolvedPosition.place) {
    return [];
  }

  const context = createWGRuntimeContext(game);
  return exposedSceneList(scenes).filter(
    (scene) =>
      scene.automaticTriggers?.includes(trigger) &&
      matchesPosition(scene, resolvedPosition) &&
      conditionsPass(scene, context),
  );
}

export function getEligibleWGPoolScenes(
  game,
  poolId,
  { scenes = undefined } = {},
) {
  const id = String(poolId || "");
  if (!id) fail("WG event pools require a pool id");

  const context = createWGRuntimeContext(game);
  return exposedSceneList(scenes).filter(
    (scene) =>
      scene.pools?.includes(id) &&
      matchesPosition(scene, currentPosition(game)) &&
      conditionsPass(scene, context),
  );
}

function randomSample(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    fail("WG scene random source must return values from 0 up to but excluding 1");
  }
  return value;
}

export function selectWGPoolScene(scenes, random) {
  if (!Array.isArray(scenes)) fail("WG event-pool candidates must be an array");
  if (typeof random !== "function") fail("WG event-pool selection requires random");

  const candidates = exposedSceneList(scenes);
  if (!candidates.length) return null;
  const highestPriority = Math.max(
    ...candidates.map((scene) => Number(scene.priority ?? 0)),
  );
  if (!Number.isFinite(highestPriority)) {
    fail("WG event-pool priorities must be finite numbers");
  }
  const prioritized = candidates.filter(
    (scene) => Number(scene.priority ?? 0) === highestPriority,
  );
  const totalWeight = prioritized.reduce((total, scene) => {
    const weight = Number(scene.weight ?? 1);
    if (!Number.isFinite(weight) || weight <= 0) {
      fail(`WG scene '${scene.id}' has an invalid weight`);
    }
    return total + weight;
  }, 0);
  const roll = randomSample(random) * totalWeight;
  let cursor = 0;
  for (const scene of prioritized) {
    cursor += Number(scene.weight ?? 1);
    if (roll < cursor) return scene;
  }
  return prioritized.at(-1);
}

export function resolveWGPoolScene(
  game,
  poolId,
  chance = 1,
  { scenes = undefined, random = undefined } = {},
) {
  const probability = Number(chance);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    fail("WG event-pool chance must be between 0 and 1");
  }
  const candidates = getEligibleWGPoolScenes(game, poolId, { scenes });
  if (!candidates.length) return null;

  const source = random ?? game.getRNG("wg-events");
  if (randomSample(source) >= probability) return null;
  return selectWGPoolScene(candidates, source);
}

export function selectWGAutomaticScene(scenes, random) {
  if (!Array.isArray(scenes)) fail("WG automatic scene candidates must be an array");
  if (typeof random !== "function") fail("WG automatic scene selection requires random");

  const candidates = exposedSceneList(scenes);
  const priorities = [
    ...new Set(candidates.map((scene) => Number(scene.priority ?? 0))),
  ].sort((left, right) => right - left);

  for (const priority of priorities) {
    if (!Number.isFinite(priority)) fail("WG scene priorities must be finite numbers");
    const survivors = candidates.filter((scene) => {
      if (Number(scene.priority ?? 0) !== priority) return false;
      const chance = Number(scene.chance ?? 1);
      if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
        fail(`WG scene '${scene.id}' has an invalid chance`);
      }
      return randomSample(random) < chance;
    });
    if (!survivors.length) continue;

    const totalWeight = survivors.reduce((total, scene) => {
      const weight = Number(scene.weight ?? 1);
      if (!Number.isFinite(weight) || weight <= 0) {
        fail(`WG scene '${scene.id}' has an invalid weight`);
      }
      return total + weight;
    }, 0);
    const roll = randomSample(random) * totalWeight;
    let cursor = 0;
    for (const scene of survivors) {
      cursor += Number(scene.weight ?? 1);
      if (roll < cursor) return scene;
    }
    return survivors.at(-1);
  }

  return null;
}

export function resolveWGAutomaticScene(
  game,
  trigger,
  { scenes = undefined, random = undefined, position = undefined } = {},
) {
  if (game.currentStory) return null;
  const candidates = getEligibleWGAutomaticScenes(game, trigger, {
    scenes,
    position,
  });
  if (!candidates.length) return null;

  const selected = selectWGAutomaticScene(
    candidates,
    random ?? game.getRNG("wg-events"),
  );
  if (!selected) return null;
  enterWGTarget(game, selected.id);
  resolveActiveWGStory(game);
  return selected;
}
