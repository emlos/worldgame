function requireGameWorld(game) {
  if (
    !game?.world?.locations ||
    typeof game.world.map?.getTravelTotal !== "function"
  ) {
    throw new TypeError("Navigation requires a game with a world map");
  }
}

/** Resolve a generated place and its containing district by stable place id. */
export function resolveNavigationDestination(game, placeId) {
  requireGameWorld(game);
  const targetId = String(placeId ?? "");
  if (!targetId) return null;

  for (const location of game.world.locations.values()) {
    const place = (location.places || []).find(
      (candidate) => String(candidate.id) === targetId,
    );
    if (!place) continue;

    return {
      placeId: String(place.id),
      locationId: String(location.id),
      name: place.name,
      icon: place.props?.icon || null,
      districtName: location.name,
      districtKey: location.districtKey ?? null,
    };
  }

  return null;
}

/** Return every place that can be selected in the phone's GPS app. */
export function listNavigationDestinations(game) {
  requireGameWorld(game);

  const destinations = [];
  for (const location of game.world.locations.values()) {
    for (const place of location.places || []) {
      destinations.push({
        placeId: String(place.id),
        locationId: String(location.id),
        name: place.name,
        icon: place.props?.icon || null,
        districtName: location.name,
        districtKey: location.districtKey ?? null,
        placeKey: place.key ?? null,
      });
    }
  }

  return destinations.sort(
    (left, right) =>
      left.districtName.localeCompare(right.districtName) ||
      left.name.localeCompare(right.name) ||
      left.placeId.localeCompare(right.placeId),
  );
}

/** Build a fresh shortest route for the active GPS target. */
export function buildGpsRoute(game) {
  requireGameWorld(game);
  if (!game.gpsTarget) return null;

  const destination = resolveNavigationDestination(game, game.gpsTarget.placeId);
  if (!destination) return null;
  if (destination.locationId !== String(game.gpsTarget.locationId)) return null;

  const currentLocationId = String(game.currentLocationId);
  if (destination.locationId === currentLocationId) return null;

  const travel = game.world.map.getTravelTotal(
    currentLocationId,
    destination.locationId,
  );
  if (!travel) return null;

  return {
    destination,
    locationIds: travel.locations.map(String),
    edges: travel.locations.slice(1).map((locationId, index) => ({
      a: String(travel.locations[index]),
      b: String(locationId),
      streetName: travel.edges[index]?.streetName || "Road",
      minutes: Number(travel.edges[index]?.minutes) || 1,
    })),
    totalMinutes: travel.minutes,
    nextLocationId: travel.locations[1] == null ? null : String(travel.locations[1]),
  };
}
