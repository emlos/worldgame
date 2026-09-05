import { isPlaceUnlocked } from "../../world/model/place.js";

function normalizedDepth(value, label) {
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
  return depth;
}

function edgeKey(a, b) {
  return [String(a), String(b)].sort().join("\u0000");
}

function gpsContext(game) {
  const route = game.getGpsRoute?.() ?? null;
  if (!route) return null;
  return {
    route,
    locationIds: new Set(route.locationIds.map(String)),
    edgeKeys: new Set(route.edges.map((edge) => edgeKey(edge.a, edge.b))),
  };
}

function gpsSummary(context) {
  if (!context) return null;
  return {
    destinationPlaceId: context.route.destination.placeId,
    destinationLocationId: context.route.destination.locationId,
    destinationName: context.route.destination.name,
    totalMinutes: context.route.totalMinutes,
    nextLocationId: context.route.nextLocationId,
  };
}

function nodeFromLocation(
  location,
  game,
  gps,
  depth = null,
  boundary = false,
) {
  const id = String(location.id);
  const current = id === String(game.currentLocationId);

  return {
    id,
    name: location.name,
    x: Number(location.x) || 0,
    y: Number(location.y) || 0,
    depth,
    current,
    directlyReachable: !current && location.neighbors.has(String(game.currentLocationId)),
    onGpsRoute: gps?.locationIds.has(id) ?? false,
    gpsDestination: gps?.route.destination.locationId === id,
    boundary,
    districtKey: location.districtKey ?? null,
    places: (location.places || [])
      .filter(isPlaceUnlocked)
      .map((place) => ({
        id: String(place.id),
        name: place.name,
        icon: place.props?.icon || null,
      })),
  };
}

function edgesAmong(game, includedIds, gps) {
  const edges = [];
  const seen = new Set();

  for (const locationId of includedIds) {
    const location = game.world.getLocation(locationId);
    if (!location) continue;

    for (const [neighborIdValue, edge] of location.neighbors) {
      const neighborId = String(neighborIdValue);
      if (!includedIds.has(neighborId)) continue;

      const ends = [String(locationId), neighborId].sort();
      const key = edgeKey(ends[0], ends[1]);
      if (seen.has(key)) continue;
      seen.add(key);

      edges.push({
        a: ends[0],
        b: ends[1],
        streetName: edge?.streetName || "Road",
        minutes: Number(edge?.minutes) || 1,
        directlyReachable:
          ends[0] === String(game.currentLocationId) ||
          ends[1] === String(game.currentLocationId),
        onGpsRoute: gps?.edgeKeys.has(key) ?? false,
      });
    }
  }

  return edges.sort(
    (left, right) =>
      left.a.localeCompare(right.a) ||
      left.b.localeCompare(right.b) ||
      left.streetName.localeCompare(right.streetName),
  );
}

function localDepths(game, centerLocationId, maximumDepth) {
  const depths = new Map([[centerLocationId, 0]]);
  const queue = [centerLocationId];

  for (let index = 0; index < queue.length; index++) {
    const locationId = queue[index];
    const depth = depths.get(locationId);
    if (depth >= maximumDepth) continue;

    const location = game.world.getLocation(locationId);
    if (!location) continue;

    for (const neighborIdValue of location.neighbors.keys()) {
      const neighborId = String(neighborIdValue);
      if (depths.has(neighborId)) continue;
      depths.set(neighborId, depth + 1);
      queue.push(neighborId);
    }
  }

  return depths;
}

export function buildLocalMapView(
  game,
  { depth = 2, boundaryDepth = depth + 1 } = {},
) {
  const visibleDepth = normalizedDepth(depth, "Map depth");
  const outerDepth = normalizedDepth(boundaryDepth, "Map boundary depth");
  if (outerDepth < visibleDepth) {
    throw new RangeError("Map boundary depth cannot be smaller than its visible depth");
  }

  const centerLocationId = String(game.currentLocationId);
  if (!game.world.getLocation(centerLocationId)) {
    throw new Error(`Unknown map center: ${centerLocationId}`);
  }

  const depths = localDepths(game, centerLocationId, outerDepth);
  const gps = gpsContext(game);
  const includedIds = new Set(depths.keys());
  const nodes = [...depths.entries()]
    .map(([locationId, nodeDepth]) =>
      nodeFromLocation(
        game.world.getLocation(locationId),
        game,
        gps,
        nodeDepth,
        nodeDepth > visibleDepth,
      ),
    )
    .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));

  return {
    scope: "local",
    centerLocationId,
    depth: visibleDepth,
    boundaryDepth: outerDepth,
    gps: gpsSummary(gps),
    nodes,
    edges: edgesAmong(game, includedIds, gps),
  };
}

export function buildFullMapView(game) {
  const gps = gpsContext(game);
  const nodes = [...game.world.locations.values()]
    .map((location) => nodeFromLocation(location, game, gps))
    .sort((left, right) => left.id.localeCompare(right.id));
  const includedIds = new Set(nodes.map((node) => node.id));

  return {
    scope: "world",
    centerLocationId: String(game.currentLocationId),
    depth: null,
    boundaryDepth: null,
    gps: gpsSummary(gps),
    nodes,
    edges: edgesAmong(game, includedIds, gps),
  };
}
