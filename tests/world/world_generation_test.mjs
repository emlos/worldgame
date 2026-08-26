import { World } from "../../src/classes/world/world.js";
import { WorldMap } from "../../src/classes/world/util/worldmap.js";
import { LOCATION_REGISTRY } from "../../src/data/world/location.js";
import { PLACE_REGISTRY } from "../../src/data/world/place.js";
import { makeRNG } from "../../src/shared/util/random.js";

const failures = [];
const check = (label, condition) => {
    if (condition) console.log(`PASS: ${label}`);
    else {
        console.error(`FAIL: ${label}`);
        failures.push(label);
    }
};

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

    check(
        `seed ${seed} places every registered key exactly once`,
        places.length === PLACE_REGISTRY.length &&
            [...placeCounts.values()].every((count) => count === 1),
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
    console.log("All exact-place world generation tests passed.");
}
