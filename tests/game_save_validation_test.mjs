import { Game, SaveValidationError, validateGameSave } from "../src/classes/game/game.js";

const START = new Date("2026-01-05T00:00:00.000Z");
const failures = [];

function check(label, condition, detail = "") {
    if (condition) {
        console.log(`PASS: ${label}`);
        return;
    }
    failures.push(`${label}${detail ? ` (${detail})` : ""}`);
}

function makeSave(seed = 44) {
    return JSON.parse(JSON.stringify(new Game({ seed, startDate: START })));
}

function rejects(label, mutate, expectedPath, saveFactory = makeSave) {
    const save = saveFactory();
    mutate(save);
    try {
        Game.fromJSON(save);
        check(label, false, "load unexpectedly succeeded");
    } catch (error) {
        check(
            label,
            error instanceof SaveValidationError && error.path.includes(expectedPath),
            `${error.name}: ${error.message}`,
        );
    }
}

const validSave = makeSave();
check("current v11 save validates directly", validateGameSave(validSave) === validSave);
check(
    "world-map saves no longer contain density",
    !Object.prototype.hasOwnProperty.call(validSave.world.map, "density"),
);
check(
    "validated v11 save round-trips exactly",
    JSON.stringify(Game.fromJSON(validSave)) === JSON.stringify(validSave),
);

rejects(
    "unknown player temperature comfort is rejected",
    (save) => {
        save.player.temperature = "lukewarm-ish";
    },
    "save.player.temperature",
);
rejects(
    "non-finite player money is rejected",
    (save) => {
        save.player.money = Number.NaN;
    },
    "save.player.money",
);

const validTraitSave = makeSave();
validTraitSave.player.traits.push({
    id: "valid-modifiers",
    description: "",
    statMods: { strength: { add: [2], mult: [1.5] } },
});
check(
    "well-formed trait modifiers validate",
    validateGameSave(validTraitSave) === validTraitSave,
);
rejects(
    "trait additive modifiers must be arrays",
    (save) => {
        save.player.traits.push({
            id: "bad-add",
            description: "",
            statMods: { strength: { add: "not-an-array" } },
        });
    },
    "save.player.traits[0].statMods.strength.add",
);
rejects(
    "NPC trait multipliers must contain finite numbers",
    (save) => {
        save.npcs[0].traits.push({
            id: "bad-mult",
            description: "",
            statMods: { strength: { mult: [1, "not-a-number"] } },
        });
    },
    "save.npcs[0].traits[0].statMods.strength.mult[1]",
);

rejects("missing required world state is rejected", (save) => delete save.world, "save.world");
rejects(
    "non-finite values are rejected before hydration",
    (save) => {
        save.player.body.parts[0].health = NaN;
    },
    "save.player.body.parts[0].health",
);
rejects(
    "game and world clock disagreement is rejected",
    (save) => {
        save.time = new Date(Date.parse(save.time) + 60_000).toISOString();
    },
    "save.world.time.date",
);
rejects(
    "game RNG seed disagreement is rejected",
    (save) => {
        save.random.seed = (save.random.seed + 1) >>> 0;
    },
    "save.random.seed",
);
rejects(
    "world RNG seed disagreement is rejected",
    (save) => {
        save.world.random.seed = (save.world.random.seed + 1) >>> 0;
    },
    "save.world.random.seed",
);
rejects(
    "missing initialized RNG streams are rejected",
    (save) => {
        delete save.world.random.states.map;
    },
    "save.world.random.states.map",
);
rejects(
    "weather and world clock disagreement is rejected",
    (save) => {
        save.world.weather.current.date = new Date(
            Date.parse(save.world.weather.current.date) + 60_000,
        ).toISOString();
    },
    "save.world.weather.current.date",
);
rejects(
    "moon and world clock disagreement is rejected",
    (save) => {
        save.world.moon.date = new Date(Date.parse(save.world.moon.date) + 60_000).toISOString();
    },
    "save.world.moon.date",
);
rejects(
    "calendar and world year disagreement is rejected",
    (save) => {
        save.world.calendar.year += 1;
    },
    "save.world.calendar.year",
);
rejects(
    "temperature inconsistent with weather is rejected",
    (save) => {
        save.world.temperatureC += 1;
    },
    "save.world.temperatureC",
);

rejects(
    "duplicate location IDs are rejected",
    (save) => {
        save.world.map.locations[1].id = save.world.map.locations[0].id;
    },
    "save.world.map.locations[1].id",
);
rejects(
    "edges with missing endpoints are rejected",
    (save) => {
        save.world.map.edges[0].a = "missing-location";
    },
    "save.world.map.edges[0].a",
);
rejects(
    "a disconnected world graph is rejected",
    (save) => {
        save.world.map.edges = [];
    },
    "save.world.map.edges",
);
rejects(
    "duplicate place IDs are rejected globally",
    (save) => {
        const places = save.world.map.locations.flatMap((location) => location.places);
        places[1].id = places[0].id;
    },
    ".id",
);
rejects(
    "a place in the wrong containing location is rejected",
    (save) => {
        const location = save.world.map.locations.find((candidate) => candidate.places.length);
        const other = save.world.map.locations.find((candidate) => candidate.id !== location.id);
        location.places[0].locationId = other.id;
    },
    ".locationId",
);
rejects(
    "invalid opening-hour text is rejected",
    (save) => {
        const place = save.world.map.locations.flatMap((location) => location.places)[0];
        place.props.openingHours.mon[0].from = "not-a-time";
    },
    ".props.openingHours.mon[0].from",
);
rejects(
    "invalid edge duration is rejected",
    (save) => {
        save.world.map.edges[0].minutes = 0;
    },
    "save.world.map.edges[0].minutes",
);

rejects(
    "missing player location is rejected",
    (save) => {
        save.currentLocationId = "missing-location";
    },
    "save.currentLocationId",
);
rejects(
    "missing player place is rejected",
    (save) => {
        save.currentPlaceId = "missing-place";
    },
    "save.currentPlaceId",
);
rejects(
    "mismatched current place key is rejected",
    (save) => {
        save.currentPlaceKey = "wrong-key";
    },
    "save.currentPlaceKey",
);
rejects(
    "duplicate story flags are rejected",
    (save) => {
        save.flags = ["same", "same"];
    },
    "save.flags[1]",
);
rejects(
    "saves must retain every registered place",
    (save) => {
        const location = save.world.map.locations.find((candidate) =>
            candidate.places.some((place) => place.key === "player_home"),
        );
        location.places = location.places.filter((place) => place.key !== "player_home");
    },
    "save.world.map.locations",
);
rejects(
    "saves reject duplicate registered place keys",
    (save) => {
        const place = save.world.map.locations
            .flatMap((location) => location.places)
            .find((candidate) => candidate.key === "town_square");
        place.key = "player_home";
    },
    "save.world.map.locations",
);
rejects(
    "saves must retain the derived bus-stop count",
    (save) => {
        const location = save.world.map.locations.find((candidate) =>
            candidate.places.some((place) => place.key === "bus_stop"),
        );
        const index = location.places.findIndex((place) => place.key === "bus_stop");
        location.places.splice(index, 1);
    },
    "save.world.map.locations",
);
rejects(
    "saves reject excess distributed bus stops",
    (save) => {
        const location = save.world.map.locations.find((candidate) =>
            candidate.places.some((place) => place.key === "bus_stop"),
        );
        const existing = location.places.find((place) => place.key === "bus_stop");
        location.places.push({
            ...existing,
            id: `bus_stop#extra@${location.id}`,
            name: "Extra Bus Stop",
        });
    },
    "save.world.map.locations",
);
rejects(
    "saves reject bus stops clustered outside their coverage rule",
    (save) => {
        const busStops = [];
        for (const location of save.world.map.locations) {
            const retained = [];
            for (const place of location.places) {
                if (place.key === "bus_stop") busStops.push(place);
                else retained.push(place);
            }
            location.places = retained;
        }
        const destination = save.world.map.locations[0];
        for (const busStop of busStops) {
            busStop.locationId = destination.id;
            destination.places.push(busStop);
        }
    },
    "save.world.map.locations",
);
rejects(
    "story state must be an object",
    (save) => {
        save.story = [];
    },
    "save.story",
);
rejects(
    "story scene revisions cannot be negative",
    (save) => {
        save.storySceneRevision = -1;
    },
    "save.storySceneRevision",
);
rejects(
    "future action log entries are rejected",
    (save) => {
        save.log.push({
            t: new Date(Date.parse(save.time) + 60_000).toISOString(),
            label: "future action",
        });
    },
    "save.log[0].t",
);

rejects(
    "duplicate NPC IDs are rejected",
    (save) => {
        save.npcs[1].id = save.npcs[0].id;
    },
    "save.npcs[1].id",
);
rejects(
    "NPC locations must exist",
    (save) => {
        save.npcs[0].locationId = "missing-location";
    },
    "save.npcs[0].locationId",
);
rejects(
    "NPC homes must exist in their declared location",
    (save) => {
        save.npcs[0].homePlaceId = "missing-home";
    },
    "save.npcs[0].homePlaceId",
);
rejects(
    "NPC home ownership must agree",
    (save) => {
        const npc = save.npcs[0];
        const homeLocation = save.world.map.locations.find(
            (location) => location.id === npc.homeLocationId,
        );
        const home = homeLocation.places.find((place) => place.id === npc.homePlaceId);
        home.props.ownerNpcId = save.npcs[1].id;
    },
    "save.npcs[0].homePlaceId",
);
rejects(
    "NPC saves require body state",
    (save) => {
        delete save.npcs[0].body;
    },
    "save.npcs[0].body",
);
rejects(
    "body health outside its valid range is rejected",
    (save) => {
        const part = save.npcs[0].body.parts[0];
        part.health = part.maxHealth + 1;
    },
    "save.npcs[0].body.parts[0].health",
);
rejects(
    "NPC brain clocks must agree with game time",
    (save) => {
        save.npcs[0].brain.lastUpdatedAt = new Date(
            Date.parse(save.npcs[0].brain.lastUpdatedAt) - 60_000,
        ).toISOString();
    },
    "save.npcs[0].brain.lastUpdatedAt",
);
rejects(
    "NPC brain goals must reference saved behavior rules",
    (save) => {
        const npc = save.npcs.find((candidate) => candidate.brain.currentGoal);
        npc.brain.currentGoal.ruleId = "missing-rule";
    },
    ".brain.currentGoal.ruleId",
);
const makeObligationSave = () =>
    JSON.parse(JSON.stringify(new Game({
        seed: 117,
        startDate: new Date("2026-08-24T08:45:00.000Z"),
    })));
rejects(
    "obligation goals require a valid early-arrival duration",
    (save) => {
        const npc = save.npcs.find((candidate) => candidate.brain.currentGoal?.type === "obligation");
        npc.brain.currentGoal.earlyArrivalMinutes = 31;
    },
    ".brain.currentGoal.earlyArrivalMinutes",
    makeObligationSave,
);
rejects(
    "obligation required-arrival time must match its early duration",
    (save) => {
        const npc = save.npcs.find((candidate) => candidate.brain.currentGoal?.type === "obligation");
        npc.brain.currentGoal.requiredArrivalAt = npc.brain.currentGoal.windowStart;
    },
    ".brain.currentGoal.requiredArrivalAt",
    makeObligationSave,
);
rejects(
    "NPC brain goals must target an allowed place",
    (save) => {
        const npc = save.npcs.find(
            (candidate) =>
                candidate.brain.currentGoal && candidate.brain.currentGoal.type !== "home",
        );
        const rule = npc.behavior.goals.find(
            (candidate) => candidate.id === npc.brain.currentGoal.ruleId,
        );
        if (rule.target) rule.target.candidates = ["no-such-place-key"];
        for (const target of rule.targets || []) target.candidates = ["no-such-place-key"];
    },
    ".brain.currentGoal.targetPlaceId",
);
rejects(
    "NPC travel routes cannot reference missing locations",
    (save) => {
        const npc = save.npcs.find((candidate) => candidate.brain.currentGoal);
        const targetLocationId = npc.brain.currentGoal.targetLocationId;
        const edge = save.world.map.edges.find(
            (candidate) => candidate.a === targetLocationId || candidate.b === targetLocationId,
        );
        const fromLocationId = edge.a === targetLocationId ? edge.b : edge.a;
        const startedAt = save.time;

        npc.locationId = fromLocationId;
        npc.currentPlaceId = null;
        npc.brain.currentAction = {
            type: "travel",
            startedAt,
            arrivalAt: new Date(
                Date.parse(startedAt) + (edge.minutes + 2) * 60_000,
            ).toISOString(),
            fromLocationId,
            fromPlaceId: null,
            targetLocationId,
            targetPlaceId: npc.brain.currentGoal.targetPlaceId,
            leavePlaceMinutes: 0,
            enterPlaceMinutes: 2,
            route: {
                locations: [fromLocationId, "missing-location"],
                legMinutes: [edge.minutes],
                currentLegIndex: 0,
            },
        };
    },
    ".brain.currentAction.route.locations[1]",
);
rejects(
    "player relationships cannot reference missing NPCs",
    (save) => {
        save.player.relationships.push([
            "missing-npc",
            { npcId: "missing-npc", met: true, score: 0 },
        ]);
    },
    "save.player.relationships[0][0]",
);

if (failures.length) {
    console.error("\nGame save validation failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log("All strict game save validation tests passed.");
}
