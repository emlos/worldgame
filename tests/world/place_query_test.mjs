import { WorldMap } from "../../src/classes/world/util/worldmap.js";
import { Location } from "../../src/classes/world/util/location.js";
import { Place } from "../../src/classes/world/util/place.js";

function check(name, condition) {
    if (!condition) throw new Error(`FAIL: ${name}`);
    console.log(`PASS: ${name}`);
}

const map = Object.create(WorldMap.prototype);
map.locations = new Map();
map.rnd = () => 0;

const origin = new Location({ id: "origin", name: "Origin" });
const destination = new Location({ id: "destination", name: "Destination" });
origin.neighbors.set(destination.id, { minutes: 5 });
destination.neighbors.set(origin.id, { minutes: 5 });

const place = new Place({
    id: "bank",
    key: "bank",
    name: "Bank",
    locationId: destination.id,
    props: {
        openingHours: {
            mon: [{ from: "09:00", to: "17:00" }],
        },
    },
});
destination.places.push(place);
map.locations.set(origin.id, origin);
map.locations.set(destination.id, destination);

const matchBank = (candidate) => candidate.key === "bank";
const nearClosing = new Date("2026-08-24T16:59:00Z");
check(
    "nearest query excludes a place closed on arrival",
    map.findNearestPlace(matchBank, origin.id, nearClosing, true) === null,
);
check(
    "random query excludes a place closed on arrival",
    map.findRandomPlace(matchBank, origin.id, nearClosing, true) === null,
);

const beforeClosing = new Date("2026-08-24T16:50:00Z");
check(
    "nearest query keeps a place open on arrival",
    map.findNearestPlace(matchBank, origin.id, beforeClosing, true)?.placeId === place.id,
);
check(
    "random query keeps a place open on arrival",
    map.findRandomPlace(matchBank, origin.id, beforeClosing, true)?.placeId === place.id,
);

console.log("All place query tests passed.");
