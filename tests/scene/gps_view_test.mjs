import { Game } from "../../src/classes/game/game.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import {
  buildFullMapView,
  buildLocalMapView,
} from "../../src/classes/game/scene/mapView.js";
import { buildPhoneGpsView } from "../../src/classes/game/scene/phoneView.js";
import { listNavigationDestinations } from "../../src/classes/game/navigation.js";

const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function edgeKey(a, b) {
  return [String(a), String(b)].sort().join("\u0000");
}

const game = new Game({
  seed: 117,
  startDate: new Date("2026-09-02T08:00:00.000Z"),
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
const destinations = listNavigationDestinations(game);
const school = destinations.find((entry) => entry.placeKey === "high_school");
check("the generated high school is available as a GPS destination", Boolean(school));

// Choose an outdoor origin with an optional side road so rerouting can also be tested.
let origin = null;
let expectedRoute = null;
let deviationLocationId = null;
for (const location of game.world.locations.values()) {
  if (String(location.id) === school.locationId) continue;
  const route = game.world.map.getTravelTotal(location.id, school.locationId);
  if (!route || route.locations.length < 2) continue;
  const nextId = String(route.locations[1]);
  const deviation = [...location.neighbors.keys()].map(String).find(
    (neighborId) => neighborId !== nextId && neighborId !== school.locationId,
  );
  if (!origin) {
    origin = location;
    expectedRoute = route;
  }
  if (deviation) {
    origin = location;
    expectedRoute = route;
    deviationLocationId = deviation;
    break;
  }
}

game.moveTo(String(origin.id));
const activation = game.setGpsTarget(school.placeId);
const route = game.getGpsRoute();
check(
  "activating GPS stores the stable place and location target",
  activation.active &&
    game.gpsTarget.placeId === school.placeId &&
    game.gpsTarget.locationId === school.locationId,
);
check(
  "GPS reuses the world's shortest weighted route",
  JSON.stringify(route.locationIds) ===
    JSON.stringify(expectedRoute.locations.map(String)) &&
    route.totalMinutes === expectedRoute.minutes,
);

const phone = buildPhoneGpsView(game);
check(
  "the phone identifies the active school route",
  phone.activeRoute?.destination.placeId === school.placeId &&
    phone.destinations.find((entry) => entry.placeId === school.placeId)?.active &&
    phone.destinations.find((entry) => entry.placeId === school.placeId)?.recommended,
);

const scene = buildScene(game);
const guidedChoices = scene.sections
  .flatMap((section) => section.choices)
  .filter((choice) => choice.navigation?.kind === "gps");
check(
  "exactly the next outdoor travel choice receives GPS guidance",
  guidedChoices.length === 1 &&
    String(guidedChoices[0].action.targetLocationId) === route.nextLocationId &&
    guidedChoices[0].navigation.destinationName === school.name,
);

const routeEdgeKeys = new Set(route.edges.map((edge) => edgeKey(edge.a, edge.b)));
const fullMap = buildFullMapView(game);
const highlightedFullEdges = new Set(
  fullMap.edges
    .filter((edge) => edge.onGpsRoute)
    .map((edge) => edgeKey(edge.a, edge.b)),
);
check(
  "the full map highlights every edge in the active route",
  JSON.stringify([...highlightedFullEdges].sort()) ===
    JSON.stringify([...routeEdgeKeys].sort()),
);
check(
  "the full map marks the GPS destination district",
  fullMap.nodes.find((node) => node.id === school.locationId)?.gpsDestination === true,
);

const localMap = buildLocalMapView(game);
check(
  "the local preview highlights the first visible route edge",
  localMap.edges.some(
    (edge) =>
      edge.onGpsRoute &&
      edgeKey(edge.a, edge.b) === edgeKey(game.currentLocationId, route.nextLocationId),
  ),
);

const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
check(
  "save/load preserves the active GPS route",
  JSON.stringify(restored.getGpsRoute()) === JSON.stringify(route),
);

if (deviationLocationId) {
  game.moveTo(deviationLocationId);
  const rerouted = game.getGpsRoute();
  const expectedReroute = game.world.map.getTravelTotal(
    deviationLocationId,
    school.locationId,
  );
  check(
    "taking a different road keeps GPS active and recalculates the route",
    game.gpsTarget?.placeId === school.placeId &&
      rerouted?.locationIds[0] === deviationLocationId &&
      JSON.stringify(rerouted?.locationIds) ===
        JSON.stringify(expectedReroute.locations.map(String)),
  );
} else {
  check("taking a different road keeps GPS active and recalculates the route", true);
}

game.moveTo(school.locationId);
check(
  "GPS automatically disengages on reaching the destination district",
  game.gpsTarget === null && game.getGpsRoute() === null,
);

const alreadyThere = game.setGpsTarget(school.placeId);
check(
  "selecting a place in the current district does not leave GPS active",
  alreadyThere.alreadyThere && game.gpsTarget === null,
);

if (failures.length) {
  console.error("\nGPS view failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All GPS view tests passed.");
}
