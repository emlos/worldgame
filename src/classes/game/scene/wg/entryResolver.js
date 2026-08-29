import { WG_BUNDLE } from "../../../../generated/wg/scenes.js";
import { evaluateWGExpression } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";
import { enterWGTarget, resolveActiveWGStory } from "./storyRuntime.js";

export const WG_AUTO_TRIGGER = Object.freeze({
  enterPlace: "enter-place",
  enterLocation: "enter-location",
});

export const WG_OFFER_TYPE = Object.freeze({
  place: "place",
  npc: "npc",
});

export const WG_HUB_TYPE = Object.freeze({
  place: "place",
});

export class WGEntryError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGEntryError";
  }
}

function fail(message) {
  throw new WGEntryError(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function entryList(entries) {
  const source = entries ?? WG_BUNDLE.entries ?? {};
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

function matchesPosition(entry, game) {
  const location = game.location;
  const place = game.currentPlace;
  if (!location) return false;

  if (entry.placeKeys?.length) {
    if (!place || !entry.placeKeys.includes(String(place.key))) return false;
  }
  if (!matchesAny(entry.placeTags, placeTags(place))) return false;
  if (!matchesAny(entry.locationTags, new Set((location.tags || []).map(String)))) {
    return false;
  }
  return true;
}

function conditionsPass(entry, context) {
  return (entry.conditions || []).every((condition) =>
    Boolean(evaluateWGExpression(condition, context)),
  );
}

function npcIsPresent(game, npcId) {
  return game
    .getNPCsAtCurrentPosition()
    .some((npc) => String(npc.id) === String(npcId));
}

export function getWGOfferEntries(
  game,
  { type, npcId = null, entries = undefined } = {},
) {
  if (!Object.values(WG_OFFER_TYPE).includes(type)) {
    fail(`Unknown WG offer type '${String(type)}'`);
  }

  const context = createWGRuntimeContext(game);
  return entryList(entries).filter((entry) => {
    if (entry.offer?.type !== type) return false;
    if (type === WG_OFFER_TYPE.place && !game.currentPlace) return false;
    if (type === WG_OFFER_TYPE.npc) {
      const offeredNpcId = String(entry.offer.npcId);
      if (offeredNpcId !== String(npcId) || !npcIsPresent(game, offeredNpcId)) {
        return false;
      }
    }
    return matchesPosition(entry, game) && conditionsPass(entry, context);
  });
}

export function getWGPlaceHubEntry(game, { entries = undefined } = {}) {
  if (!game.currentPlace) return null;

  const context = createWGRuntimeContext(game);
  const matches = entryList(entries).filter(
    (entry) =>
      entry.hub?.type === WG_HUB_TYPE.place &&
      matchesPosition(entry, game) &&
      conditionsPass(entry, context),
  );

  if (matches.length > 1) {
    fail(
      `Multiple WG place hubs match '${String(game.currentPlace.key)}': ${matches
        .map((entry) => entry.id)
        .join(", ")}`,
    );
  }
  return matches[0] ?? null;
}

export function getEligibleWGAutomaticEntries(
  game,
  trigger,
  { entries = undefined } = {},
) {
  if (!Object.values(WG_AUTO_TRIGGER).includes(trigger)) {
    fail(`Unknown WG automatic trigger '${String(trigger)}'`);
  }
  if (trigger === WG_AUTO_TRIGGER.enterPlace && !game.currentPlace) return [];
  if (trigger === WG_AUTO_TRIGGER.enterLocation && game.currentPlace) return [];

  const context = createWGRuntimeContext(game);
  return entryList(entries).filter(
    (entry) =>
      entry.automaticTriggers?.includes(trigger) &&
      matchesPosition(entry, game) &&
      conditionsPass(entry, context),
  );
}

export function getEligibleWGPoolEntries(
  game,
  poolId,
  { entries = undefined } = {},
) {
  const id = String(poolId || "");
  if (!id) fail("WG event pools require a pool id");

  const context = createWGRuntimeContext(game);
  return entryList(entries).filter(
    (entry) =>
      entry.pools?.includes(id) &&
      matchesPosition(entry, game) &&
      conditionsPass(entry, context),
  );
}

function randomSample(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    fail("WG entry random source must return values from 0 up to but excluding 1");
  }
  return value;
}

export function selectWGPoolEntry(entries, random) {
  if (!Array.isArray(entries)) fail("WG event-pool candidates must be an array");
  if (typeof random !== "function") fail("WG event-pool selection requires random");

  const candidates = entryList(entries);
  if (!candidates.length) return null;
  const highestPriority = Math.max(
    ...candidates.map((entry) => Number(entry.priority ?? 0)),
  );
  if (!Number.isFinite(highestPriority)) {
    fail("WG event-pool priorities must be finite numbers");
  }
  const prioritized = candidates.filter(
    (entry) => Number(entry.priority ?? 0) === highestPriority,
  );
  const totalWeight = prioritized.reduce((total, entry) => {
    const weight = Number(entry.weight ?? 1);
    if (!Number.isFinite(weight) || weight <= 0) {
      fail(`WG entry '${entry.id}' has an invalid weight`);
    }
    return total + weight;
  }, 0);
  const roll = randomSample(random) * totalWeight;
  let cursor = 0;
  for (const entry of prioritized) {
    cursor += Number(entry.weight ?? 1);
    if (roll < cursor) return entry;
  }
  return prioritized.at(-1);
}

export function resolveWGPoolEntry(
  game,
  poolId,
  chance = 1,
  { entries = undefined, random = undefined } = {},
) {
  const probability = Number(chance);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    fail("WG event-pool chance must be between 0 and 1");
  }
  const candidates = getEligibleWGPoolEntries(game, poolId, { entries });
  if (!candidates.length) return null;

  const source = random ?? game.getRNG("wg-events");
  if (randomSample(source) >= probability) return null;
  return selectWGPoolEntry(candidates, source);
}

export function selectWGAutomaticEntry(entries, random) {
  if (!Array.isArray(entries)) fail("WG automatic entry candidates must be an array");
  if (typeof random !== "function") fail("WG automatic entry selection requires random");

  const candidates = entryList(entries);
  const priorities = [
    ...new Set(candidates.map((entry) => Number(entry.priority ?? 0))),
  ].sort((left, right) => right - left);

  for (const priority of priorities) {
    if (!Number.isFinite(priority)) fail("WG entry priorities must be finite numbers");
    const survivors = candidates.filter((entry) => {
      if (Number(entry.priority ?? 0) !== priority) return false;
      const chance = Number(entry.chance ?? 1);
      if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
        fail(`WG entry '${entry.id}' has an invalid chance`);
      }
      return randomSample(random) < chance;
    });
    if (!survivors.length) continue;

    const totalWeight = survivors.reduce((total, entry) => {
      const weight = Number(entry.weight ?? 1);
      if (!Number.isFinite(weight) || weight <= 0) {
        fail(`WG entry '${entry.id}' has an invalid weight`);
      }
      return total + weight;
    }, 0);
    const roll = randomSample(random) * totalWeight;
    let cursor = 0;
    for (const entry of survivors) {
      cursor += Number(entry.weight ?? 1);
      if (roll < cursor) return entry;
    }
    return survivors.at(-1);
  }

  return null;
}

export function resolveWGAutomaticEntry(
  game,
  trigger,
  { entries = undefined, random = undefined } = {},
) {
  if (game.currentStory) return null;
  const candidates = getEligibleWGAutomaticEntries(game, trigger, { entries });
  if (!candidates.length) return null;

  const selected = selectWGAutomaticEntry(
    candidates,
    random ?? game.getRNG("wg-events"),
  );
  if (!selected) return null;
  enterWGTarget(game, selected.sceneId);
  resolveActiveWGStory(game);
  return selected;
}
