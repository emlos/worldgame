import { Game } from "../../src/classes/game/game.js";
import { NPCBrain } from "../../src/classes/npc/npcBrain.js";
import { GOAL_TYPE, NPC_ACTION_TYPE, TARGET_TYPE } from "../../src/data/npc/behavior.js";

const failures = [];
const check = (label, condition) => {
    if (condition) console.log(`PASS: ${label}`);
    else {
        console.error(`FAIL: ${label}`);
        failures.push(label);
    }
};

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const lowerRule = {
    id: "morning_errand",
    type: GOAL_TYPE.visit,
    priority: 30,
    when: { from: "10:00", to: "11:00" },
    stayMinutes: { min: 20, max: 20 },
    target: { type: TARGET_TYPE.placeKeys, candidates: ["errand"] },
};
const obligationRule = {
    id: "office_shift",
    type: GOAL_TYPE.obligation,
    priority: 100,
    when: { from: "11:00", to: "12:00" },
    target: { type: TARGET_TYPE.placeKeys, candidates: ["office"] },
};

const locations = new Map([
    ["home", { id: "home", places: [] }],
    [
        "errand",
        {
            id: "errand",
            places: [{ id: "errand-place", key: "errand", props: { category: [] } }],
        },
    ],
    [
        "office",
        {
            id: "office",
            places: [{ id: "office-place", key: "office", props: { category: [] } }],
        },
    ],
]);

const travelMinutes = (from, to) => {
    if (String(from) === String(to)) return 0;
    if (String(from) === "errand" && String(to) === "office") return 7;
    return 10;
};

const worldMap = {
    locations,
    getTravelMinutes: travelMinutes,
    getTravelTotal(from, to) {
        const minutes = travelMinutes(from, to);
        return {
            locations: [String(from), String(to)],
            edges: [{ minutes }],
            minutes,
        };
    },
};

const npc = {
    id: "deadline-test-npc",
    locationId: "home",
    currentPlaceId: null,
    homeLocationId: "home",
    homePlaceId: null,
    setLocationAndPlace(locationId, placeId = null) {
        this.locationId = String(locationId);
        this.currentPlaceId = placeId;
    },
};

const controlledGame = {
    seed: 1,
    world: {
        map: worldMap,
        getLocation(id) {
            return locations.get(String(id));
        },
    },
    getRNG() {
        return () => 0.5;
    },
};

const brain = new NPCBrain(npc, { goals: [lowerRule, obligationRule] });
brain.restoreJSON({
    currentGoal: null,
    currentAction: { type: NPC_ACTION_TYPE.idle, startedAt: "2026-08-24T10:39:00.000Z" },
    nextDecisionAt: "2026-08-24T10:40:00.000Z",
    lastUpdatedAt: "2026-08-24T10:39:00.000Z",
});

brain.updateTo(new Date("2026-08-24T10:40:00.000Z"), controlledGame);

check(
    "optional trip is rejected when travel, minimum stay, and onward travel miss the deadline",
    brain.currentGoal === null && brain.currentAction?.type === NPC_ACTION_TYPE.idle,
);
check(
    "rejected optional trip leaves the NPC at the safe origin",
    npc.locationId === "home" && npc.currentPlaceId === null,
);
check(
    "planner wakes at the obligation departure time",
    brain.nextDecisionAt?.toISOString() === "2026-08-24T10:48:00.000Z",
);

brain.updateTo(new Date("2026-08-24T11:00:00.000Z"), controlledGame);

check("controlled NPC reaches the obligation on time", npc.locationId === "office");
check("controlled NPC starts the obligation goal", brain.currentGoal?.ruleId === obligationRule.id);
check("controlled NPC is staying at work", brain.currentAction?.type === NPC_ACTION_TYPE.stay);

function placeKeyFor(game, npcId) {
    const currentNpc = game.npcs.get(npcId);
    const location = game.world.getLocation(currentNpc.locationId);
    return location?.places?.find((place) => place.id === currentNpc.currentPlaceId)?.key ?? null;
}

const vincent = new Game({ seed: 19, startDate: new Date("2026-08-24T09:00:00Z") });
vincent.advanceMinutes(120);
check(
    "Vincent seed 19 reaches the office by 11:00",
    placeKeyFor(vincent, "vincent") === "office_block",
);

const vega = new Game({ seed: 117, startDate: new Date("2026-08-24T10:00:00Z") });
vega.advanceMinutes(360);
check(
    "Vega seed 117 reaches the police station by 16:00",
    placeKeyFor(vega, "officer_vega") === "police_station",
);

const vegaLargeStep = new Game({ seed: 117, startDate: new Date("2026-08-24T10:00:00Z") });
const vegaMinuteSteps = new Game({ seed: 117, startDate: new Date("2026-08-24T10:00:00Z") });
vegaLargeStep.advanceMinutes(360);
for (let minute = 0; minute < 360; minute++) vegaMinuteSteps.advanceMinutes(1);
check(
    "large and minute-by-minute time advances produce the same Vega state",
    equal(vegaLargeStep.npcs.get("officer_vega"), vegaMinuteSteps.npcs.get("officer_vega")),
);

const vegaCheckpoint = new Game({ seed: 117, startDate: new Date("2026-08-24T10:00:00Z") });
vegaCheckpoint.advanceMinutes(300);
const vegaLoaded = Game.fromJSON(JSON.parse(JSON.stringify(vegaCheckpoint)));
vegaCheckpoint.advanceMinutes(60);
vegaLoaded.advanceMinutes(60);
check(
    "save/load preserves deadline-aware NPC planning",
    equal(vegaCheckpoint.npcs.get("officer_vega"), vegaLoaded.npcs.get("officer_vega")),
);
check(
    "Vega still reaches the station after a 15:00 save/load",
    placeKeyFor(vegaLoaded, "officer_vega") === "police_station",
);

if (failures.length) {
    console.error("\nNPC obligation deadline failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log("All NPC obligation deadline tests passed.");
}
