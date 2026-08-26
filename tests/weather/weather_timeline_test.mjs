import { World } from "../../src/classes/world/world.js";
import { Weather } from "../../src/classes/world/util/weather.js";
import { Season, WeatherType } from "../../src/data/world/weather.js";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const SEED = 123;
const START = new Date("2026-01-15T07:00:00Z");

function equal(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function check(name, condition) {
    if (!condition) throw new Error(`FAIL: ${name}`);
    console.log(`PASS: ${name}`);
}

function sameSnapshot(a, b) {
    return (
        a.date.getTime() === b.date.getTime() &&
        a.kind === b.kind &&
        a.runHours === b.runHours
    );
}

// Beginning exactly on an hour must not process that same boundary again.
const exactHour = new Weather({ seed: SEED, startDate: START, initial: WeatherType.CLEAR });
exactHour.step(1);
check("one minute from an exact hour performs no transition", exactHour.kind === WeatherType.CLEAR);
check("no boundary leaves runHours unchanged", exactHour.runHours === 0);
check("weather clock advances to 07:01", exactHour.date.toISOString() === "2026-01-15T07:01:00.000Z");

// A target exactly on the next boundary must include that boundary.
const beforeBoundary = new Weather({
    seed: SEED,
    startDate: new Date("2026-01-15T07:59:00Z"),
    initial: WeatherType.CLEAR,
});
const before = beforeBoundary.snapshot;
beforeBoundary.step(1);
const after = beforeBoundary.snapshot;
check(
    "landing on 08:00 performs exactly one transition",
    after.kind !== before.kind || after.runHours === before.runHours + 1,
);

// Chunk size must not affect the deterministic timeline.
const chunked = new Weather({ seed: SEED, startDate: START });
const minuteByMinute = new Weather({ seed: SEED, startDate: START });
chunked.step(377);
for (let i = 0; i < 377; i++) minuteByMinute.step(1);
check("large and minute-sized steps produce the same weather", equal(chunked, minuteByMinute));

// Queries are pure and later commits reproduce their result.
const queryWeather = new Weather({ seed: SEED, startDate: START });
const beforeQuery = JSON.stringify(queryWeather);
const futureDate = new Date(START.getTime() + 180 * 24 * HOUR_MS + 37 * MINUTE_MS);
const queried = queryWeather.stateAt(futureDate);
check("future state queries do not mutate committed weather", JSON.stringify(queryWeather) === beforeQuery);
queryWeather.advanceTo(futureDate);
check("advancing to a queried date reproduces the query", sameSnapshot(queried, queryWeather.snapshot));

// Cached history must agree with a clean replay.
const historicalDate = new Date(START.getTime() + 36 * HOUR_MS);
const historical = queryWeather.stateAt(historicalDate);
const cleanReplay = new Weather({ seed: SEED, startDate: START });
cleanReplay.advanceTo(historicalDate);
check("past queries agree with a clean replay", sameSnapshot(historical, cleanReplay.snapshot));

// Save/load continuity must match uninterrupted simulation.
const uninterrupted = new Weather({ seed: SEED, startDate: START });
uninterrupted.step(13 * 60 + 17);
const restored = Weather.fromJSON(JSON.parse(JSON.stringify(uninterrupted)));
uninterrupted.step(45 * 24 * 60 + 9);
restored.step(45 * 24 * 60 + 9);
check("save/load continues the same weather timeline", equal(uninterrupted, restored));

// World environment queries must use the requested date consistently.
const world = new World({ seed: SEED, startDate: START });
const worldBeforeQuery = JSON.stringify(world);
const july = new Date("2026-07-15T15:00:00Z");
const julyEnvironment = world.getEnvironmentAt(july);
const julyState = world.weather.stateAt(july);
check("environment query uses the requested season", julyEnvironment.season === Season.SUMMER);
check("environment query uses weather from the requested date", julyEnvironment.weather === julyState.kind);
check(
    "environment temperature uses the queried weather",
    julyEnvironment.temperature === world.weather.computeTemperature(july, julyState.kind),
);
check("environment queries do not mutate the world", JSON.stringify(world) === worldBeforeQuery);

// The intended daily temperature shape has a 04:00 minimum and 15:00 maximum.
const coldPoint = new Date("2026-07-15T04:00:00Z");
const warmPoint = new Date("2026-07-15T15:00:00Z");
check(
    "temperature is warmer at 15:00 than 04:00",
    world.weather.computeTemperature(warmPoint, WeatherType.CLEAR) >
        world.weather.computeTemperature(coldPoint, WeatherType.CLEAR),
);

// Loading a whole World should resume weather and time together.
world.advance(9 * 24 * 60 + 23);
const loadedWorld = World.fromJSON(JSON.parse(JSON.stringify(world)));
world.advance(31 * 24 * 60 + 41);
loadedWorld.advance(31 * 24 * 60 + 41);
check("world save/load preserves weather continuation", equal(world, loadedWorld));

console.log("All deterministic weather timeline tests passed.");
