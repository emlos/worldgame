import { World } from "../../src/classes/world/world.js";
import { WorldMap } from "../../src/classes/world/util/worldmap.js";
import { LOCATION_REGISTRY } from "../../src/data/world/location.js";
import {
    getPlaceInstanceTarget,
    PLACE_REGISTRY,
} from "../../src/data/world/place.js";
import { makeRNG } from "../../src/shared/util/random.js";

const failures = [];
const check = (label, condition) => {
    if (condition) console.log(`PASS: ${label}`);
    else {
        console.error(`FAIL: ${label}`);
        failures.push(label);
    }
};

function orientation(a, b, c) {
    const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return value === 0 ? 0 : value > 0 ? 1 : -1;
}

function edgesCross(a, b, c, d) {
    return (
        orientation(a, b, c) !== orientation(a, b, d) &&
        orientation(c, d, a) !== orientation(c, d, b)
    );
}

function hasCrossingEdges(map) {
    for (let left = 0; left < map.edges.length; left++) {
        const first = map.edges[left];
        for (let right = left + 1; right < map.edges.length; right++) {
            const second = map.edges[right];
            if (
                first.a === second.a ||
                first.a === second.b ||
                first.b === second.a ||
                first.b === second.b
            ) {
                continue;
            }
            if (
                edgesCross(
                    map.getLocation(first.a),
                    map.getLocation(first.b),
                    map.getLocation(second.a),
                    map.getLocation(second.b),
                )
            ) {
                return true;
            }
        }
    }
    return false;
}

function maxHopsToPlace(map, placeKey) {
    const targetIds = new Set(
        [...map.locations.values()]
            .filter((location) =>
                location.places.some((place) => place.key === placeKey),
            )
            .map((location) => String(location.id)),
    );
    let maximum = 0;

    for (const location of map.locations.values()) {
        const startId = String(location.id);
        const queue = [[startId, 0]];
        const seen = new Set([startId]);
        let distance = Infinity;
        while (queue.length) {
            const [currentId, hops] = queue.shift();
            if (targetIds.has(currentId)) {
                distance = hops;
                break;
            }
            for (const neighborId of map.getLocation(currentId).neighbors.keys()) {
                const id = String(neighborId);
                if (seen.has(id)) continue;
                seen.add(id);
                queue.push([id, hops + 1]);
            }
        }
        maximum = Math.max(maximum, distance);
    }
    return maximum;
}

for (const seed of [1, 2, 3, 4, 5, 44, 117, 801]) {
    const map = new WorldMap({ rnd: makeRNG(seed) });
    const locations = [...map.locations.values()];
    const places = locations.flatMap((location) => location.places || []);
    const placeCounts = new Map(PLACE_REGISTRY.map((definition) => [definition.key, 0]));
    for (const place of places) {
        if (placeCounts.has(place.key)) {
            placeCounts.set(place.key, placeCounts.get(place.key) + 1);
        }
    }

    const expectedPlaceCounts = new Map(
        PLACE_REGISTRY.map((definition) => [
            definition.key,
            getPlaceInstanceTarget(definition, locations.length),
        ]),
    );
    const expectedPlaceTotal = [...expectedPlaceCounts.values()].reduce(
        (total, count) => total + count,
        0,
    );
    check(
        `seed ${seed} meets every registered place instance target`,
        places.length === expectedPlaceTotal &&
            [...placeCounts].every(
                ([key, count]) => count === expectedPlaceCounts.get(key),
            ),
    );
    check(
        `seed ${seed} distributes bus stops across the graph`,
        placeCounts.get("bus_stop") === 7 && maxHopsToPlace(map, "bus_stop") <= 2,
    );
    check(
        `seed ${seed} represents every registered district`,
        locations.length === LOCATION_REGISTRY.length &&
            new Set(locations.map((location) => location.districtKey)).size ===
                LOCATION_REGISTRY.length,
    );
    check(
        `seed ${seed} respects place location tags and capacity`,
        locations.every((location) => (location.places || []).length <= 10) &&
            places.every((place) => {
                const definition = PLACE_REGISTRY.find(
                    (candidate) => candidate.key === place.key,
                );
                const allowed = (definition.allowedTags || []).filter(
                    (tag) => tag != null,
                );
                const location = map.getLocation(place.locationId);
                return !allowed.length ||
                    allowed.some((tag) => location.tags.includes(tag));
            }),
    );

    const nearestDistances = locations.map((location) =>
        Math.min(
            ...locations
                .filter((candidate) => candidate !== location)
                .map((candidate) =>
                    Math.hypot(location.x - candidate.x, location.y - candidate.y),
                ),
        ),
    );
    check(
        `seed ${seed} uses bounded organic spacing`,
        locations.every(
            (location) =>
                location.x > 0 && location.x < 100 && location.y > 0 && location.y < 50,
        ) && Math.min(...nearestDistances) > 5,
    );

    const graph = map.getGraphMetrics();
    check(
        `seed ${seed} builds a connected graph with useful loops`,
        graph.componentCount === 1 &&
            graph.edgeCount >= Math.round(locations.length * 1.3) &&
            graph.cycleCount >= 8,
    );
    check(
        `seed ${seed} limits leaves, hubs, and linear corridors`,
        graph.leafCount <= 3 &&
            graph.maxDegree <= 5 &&
            graph.longestCorridor <= 4,
    );
    check(
        `seed ${seed} creates non-branching geometry-aware street runs`,
        graph.branchingStreetCount === 0 && graph.longestStreetLength <= 4,
    );
    check(`seed ${seed} keeps the graph planar`, !hasCrossingEdges(map));

    const serialized = map.toJSON();
    check(
        `seed ${seed} omits density and round-trips exactly`,
        !Object.prototype.hasOwnProperty.call(serialized, "density") &&
            JSON.stringify(WorldMap.fromJSON(serialized).toJSON()) ===
                JSON.stringify(serialized),
    );
}

const world = new World({ seed: 99, startDate: new Date("2026-08-24T08:00:00Z") });
check(
    "environment snapshots no longer expose density",
    !Object.prototype.hasOwnProperty.call(world.getEnvironmentAt(), "density"),
);

if (failures.length) {
    console.error("\nWorld generation failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log("All world generation tests passed.");
}
