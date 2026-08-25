import { WG_BUNDLE } from "../../../../generated/wg/scenes.js";
import { evaluateWGExpression } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";
import { enterWGScene } from "./storyRuntime.js";

export const WG_AUTO_TRIGGER = Object.freeze({
  enterPlace: "enter-place",
  enterLocation: "enter-location",
});

export const WG_OFFER_TYPE = Object.freeze({
  place: "place",
  npc: "npc",
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

function randomSample(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    fail("WG entry random source must return values from 0 up to but excluding 1");
  }
  return value;
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
  if (game.currentStorySceneId) return null;
  const candidates = getEligibleWGAutomaticEntries(game, trigger, { entries });
  if (!candidates.length) return null;

  const selected = selectWGAutomaticEntry(
    candidates,
    random ?? game.getRNG("wg-events"),
  );
  if (!selected) return null;
  enterWGScene(game, selected.sceneId);
  return selected;
}
