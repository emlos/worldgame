import { Game } from "../../src/classes/game/game.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import {
  buildFullMapView,
  buildLocalMapView,
} from "../../src/classes/game/scene/mapView.js";

const START = new Date("2026-08-24T08:00:00.000Z");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expectedDepths(game, maximumDepth) {
  const center = String(game.currentLocationId);
  const depths = new Map([[center, 0]]);
  const queue = [center];

  for (let index = 0; index < queue.length; index++) {
    const locationId = queue[index];
    const depth = depths.get(locationId);
    if (depth >= maximumDepth) continue;

    for (const neighborIdValue of game.world.getLocation(locationId).neighbors.keys()) {
      const neighborId = String(neighborIdValue);
      if (depths.has(neighborId)) continue;
      depths.set(neighborId, depth + 1);
      queue.push(neighborId);
    }
  }

  return depths;
}

const game = new Game({
  seed: 117,
  startDate: START,
  playerOptions: { startPlaceId: null },
});
const before = JSON.stringify(game);
const local = buildLocalMapView(game);
const expected = expectedDepths(game, 3);

check("local map generation is pure", JSON.stringify(game) === before);
check("local map is centered on the player", local.centerLocationId === String(game.currentLocationId));
check("local map contains exactly the nodes within three hops", local.nodes.length === expected.size);
check(
  "local map records every node's shortest hop depth",
  local.nodes.every((node) => expected.get(node.id) === node.depth),
);
check(
  "third-hop nodes are boundary context and nearer nodes are not",
  local.nodes.every((node) => node.boundary === (node.depth > 2)),
);
check(
  "local edges never reference omitted nodes",
  local.edges.every(
    (edge) =>
      local.nodes.some((node) => node.id === edge.a) &&
      local.nodes.some((node) => node.id === edge.b),
  ),
);

const scene = buildScene(game);
const travelTargets = new Set(
  scene.sections
    .flatMap((section) => section.choices)
    .filter((choice) => choice.action.type === "travel")
    .map((choice) => String(choice.action.targetLocationId)),
);
const directMapTargets = new Set(
  local.nodes.filter((node) => node.directlyReachable).map((node) => node.id),
);
check(
  "directly reachable map nodes exactly match scene travel choices",
  equal([...directMapTargets].sort(), [...travelTargets].sort()),
);
check("outdoor scenes expose the local map model", equal(scene.map, local));

const full = buildFullMapView(game);
check("full map contains every world location", full.nodes.length === game.world.locations.size);
check("full map contains every world edge", full.edges.length === game.world.edges.length);
check(
  "all map coordinates and travel durations are finite",
  [...local.nodes, ...full.nodes].every(
    (node) => Number.isFinite(node.x) && Number.isFinite(node.y),
  ) &&
    [...local.edges, ...full.edges].every((edge) => Number.isFinite(edge.minutes)),
);

const loaded = Game.fromJSON(JSON.parse(JSON.stringify(game)));
check("save/load preserves the local map view", equal(buildLocalMapView(loaded), local));
check("save/load preserves the full map view", equal(buildFullMapView(loaded), full));

if (failures.length) {
  console.error("\nMap view failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All map view tests passed.");
}
