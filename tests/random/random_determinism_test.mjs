import { Game } from "../../src/classes/game/game.js";
import { World } from "../../src/classes/world/world.js";
import { Weather } from "../../src/classes/world/util/weather.js";
import { RandomStreams, makeRNG, randInt } from "../../src/shared/util/random.js";
import { randomHexColor } from "../../src/shared/util/color.js";

const START = new Date("2026-08-21T08:00:00Z");
const SEED = 0x12345678;

function equal(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function check(name, condition) {
    if (!condition) throw new Error(`FAIL: ${name}`);
    console.log(`PASS: ${name}`);
}

// The old implementation returned exactly 1 for this seed.
const edge = makeRNG(653637408);
check("seeded RNG is always below 1", edge() < 1);
check("randInt cannot exceed max", randInt(1, 5, makeRNG(653637408)) === 5);

const colorA = randomHexColor(makeRNG(99));
const colorB = randomHexColor(makeRNG(99));
check("randomHexColor uses the supplied RNG", colorA === colorB);

// Named streams must not influence one another.
const streamsA = new RandomStreams(SEED);
const streamsB = new RandomStreams(SEED);
for (let i = 0; i < 100; i++) streamsA.stream("weather")();
check(
    "named streams are isolated",
    streamsA.stream("gameplay")() === streamsB.stream("gameplay")(),
);

// Temperature reads are pure.
const weather = new Weather({ seed: SEED, startDate: START });
const weatherState = JSON.stringify(weather);
const firstTemperature = weather.computeTemperature(START);
const repeatedTemperatures = Array.from({ length: 25 }, () => weather.computeTemperature(START));
check(
    "temperature is stable for one timestamp",
    repeatedTemperatures.every((value) => value === firstTemperature),
);
check("temperature reads do not mutate weather", JSON.stringify(weather) === weatherState);

// Extra environment reads on one copy must not change later simulation.
const gameA = new Game({ seed: SEED, startDate: START });
const gameB = new Game({ seed: SEED, startDate: START });
check("same seed starts identically", equal(gameA, gameB));

for (let i = 0; i < 100; i++) {
    gameA.world.getEnvironmentAt(new Date(START.getTime() + i * 60_000));
}

gameA.advanceMinutes(377);
gameB.advanceMinutes(377);
check("read-only queries do not alter future simulation", equal(gameA, gameB));

// One NPC's randomness must not shift another NPC's stream.
const npcA = gameA.npcsArray[0].id;
const npcB = gameA.npcsArray[1].id;
const gameC = new Game({ seed: SEED, startDate: START });
const gameD = new Game({ seed: SEED, startDate: START });
for (let i = 0; i < 50; i++) gameC.getRNG(`npc:${npcA}`)();
check("NPC streams are isolated", gameC.getRNG(`npc:${npcB}`)() === gameD.getRNG(`npc:${npcB}`)());

// Save/load must resume every stream, not restart from the master seed.
const game = new Game({ seed: SEED, startDate: START });
game.rnd();
game.getRNG("encounters")();
game.getRNG(`npc:${game.npcsArray[0].id}`)();
game.advanceMinutes(190);

const save = JSON.parse(JSON.stringify(game));
const expected = {
    gameplay: game.rnd(),
    encounters: game.getRNG("encounters")(),
    npc: game.getRNG(`npc:${game.npcsArray[0].id}`)(),
    worldRuntime: game.world.rnd(),
    worldMap: game.world.random.stream("map")(),
};

const loaded = Game.fromJSON(save);
const actual = {
    gameplay: loaded.rnd(),
    encounters: loaded.getRNG("encounters")(),
    npc: loaded.getRNG(`npc:${loaded.npcsArray[0].id}`)(),
    worldRuntime: loaded.world.rnd(),
    worldMap: loaded.world.random.stream("map")(),
};
check("save/load resumes all RNG streams", equal(expected, actual));

// Singleton district types keep the unsuffixed base label, repeated types get
// unique suffixes local to that district type.
let districtNamesValid = true;
for (let seed = 1; seed <= 20; seed++) {
    const world = new World({ seed, startDate: START });
    const groups = new Map();
    for (const location of world.locations.values()) {
        if (!groups.has(location.districtKey)) groups.set(location.districtKey, []);
        groups.get(location.districtKey).push(location);
    }

    for (const locations of groups.values()) {
        if (locations.length === 1) {
            const location = locations[0];
            districtNamesValid &&= location.name === (location.meta?.label || location.districtKey);
        } else {
            districtNamesValid &&=
                new Set(locations.map((location) => location.name)).size === locations.length;
        }
    }
}
check("district suffixes are used only for repeated types", districtNamesValid);

console.log("All deterministic RNG tests passed.");
