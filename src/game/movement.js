import { clearActiveStory } from "../story/storyState.js";
import { isPlaceUnlocked } from "../world/model/place.js";
import { emitGameEvent } from "./events.js";

export function movePlayerTo(game, locationId, { preserveStory = false } = {}) {
  if (!game.world.locations.has(locationId)) {
    throw new Error(`Unknown location: ${locationId}`);
  }
  if (locationId === game.currentLocationId) return;

  game.currentLocationId = locationId;
  game.currentPlaceId = null;
  game.currentPlaceKey = null;
  if (!preserveStory) clearActiveStory(game);
  if (
    game.gpsTarget &&
    String(game.gpsTarget.locationId) === String(game.currentLocationId)
  ) {
    game.gpsTarget = null;
  }

  emitGameEvent(game, "location", [game, locationId]);
}

export function setPlayerPlace(
  game,
  { placeId = null, placeKey = null, preserveStory = false } = {},
) {
  if (placeId == null) {
    game.currentPlaceId = null;
    game.currentPlaceKey = placeKey == null ? null : String(placeKey);
    if (!preserveStory) clearActiveStory(game);
    return;
  }

  const place = game.world.getPlace(game.currentLocationId, placeId);
  if (!place) {
    throw new Error(
      `Unknown place '${placeId}' in location '${game.currentLocationId}'`,
    );
  }
  if (!isPlaceUnlocked(place)) {
    throw new Error("That place has not been unlocked");
  }
  if (placeKey != null && String(placeKey) !== String(place.key ?? "")) {
    throw new Error(
      `Place key '${placeKey}' does not match place '${placeId}' (${place.key ?? "no key"})`,
    );
  }

  game.currentPlaceId = place.id;
  game.currentPlaceKey = place.key ?? null;
  if (!preserveStory) clearActiveStory(game);
}

export function relocatePlayer(game, destination) {
  if (!destination || typeof destination !== "object") {
    throw new TypeError("Player relocation requires a destination");
  }

  let target = null;
  if (destination.kind === "home") {
    target = {
      locationId: game.homeLocationId,
      placeId: game.homePlaceId,
    };
  } else if (destination.kind === "nearest-place") {
    const placeKey = String(destination.placeKey || "");
    target = game.world.map.findNearestPlace(
      (place) => String(place.key) === placeKey && isPlaceUnlocked(place),
      game.currentLocationId,
      game.now,
      false,
    );
  } else {
    throw new Error(
      `Unknown player relocation kind '${String(destination.kind)}'`,
    );
  }

  if (!target?.locationId || !target?.placeId) {
    throw new Error("No valid player relocation destination was found");
  }
  const place = game.world.getPlace(target.locationId, target.placeId);
  if (!place || !isPlaceUnlocked(place)) {
    throw new Error("Player relocation destination is unavailable");
  }

  if (String(target.locationId) !== String(game.currentLocationId)) {
    movePlayerTo(game, target.locationId, { preserveStory: true });
  }
  setPlayerPlace(game, {
    placeId: target.placeId,
    preserveStory: true,
  });
  return {
    locationId: String(target.locationId),
    placeId: String(target.placeId),
    placeKey: String(place.key),
  };
}

export function getPlaceAccess(game, placeOrId, { at = game.now } = {}) {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    throw new TypeError("Game.getPlaceAccess requires a valid Date");
  }
  if (game.currentPlaceId != null) {
    return { allowed: false, code: "already-inside", place: null };
  }

  const placeId =
    placeOrId && typeof placeOrId === "object" ? placeOrId.id : placeOrId;
  const place = game.world.getPlace(game.currentLocationId, placeId);
  if (!place) return { allowed: false, code: "not-here", place: null };
  if (!isPlaceUnlocked(place)) {
    return { allowed: false, code: "locked", place: null };
  }

  const ageRange = place.props?.ages;
  const playerAge = game.player.getAgeAt(at);
  if (ageRange?.min != null && playerAge < ageRange.min) {
    return {
      allowed: false,
      code: "age-minimum",
      place,
      requiredAge: ageRange.min,
    };
  }
  if (ageRange?.max != null && playerAge > ageRange.max) {
    return {
      allowed: false,
      code: "age-maximum",
      place,
      requiredAge: ageRange.max,
    };
  }
  if (typeof place.isOpen === "function" && !place.isOpen(at)) {
    return { allowed: false, code: "closed", place };
  }
  return { allowed: true, code: "allowed", place };
}

export function enforcePlaceClosing(game, from, to) {
  const place = game.currentPlace;
  if (!place?.props?.ejectAtClose || !(to > from)) return null;

  const closingTime = place.getClosingTime?.(from) ?? null;
  const crossedClosingTime = closingTime && to >= closingTime;
  const alreadyClosed =
    typeof place.isOpen === "function" && !place.isOpen(from);
  if (!crossedClosingTime && !alreadyClosed) return null;

  const ejectedFrom = {
    id: String(place.id),
    key: place.key == null ? null : String(place.key),
    name: place.name,
    closedAt: closingTime?.toISOString?.() ?? null,
  };
  setPlayerPlace(game);
  return ejectedFrom;
}
