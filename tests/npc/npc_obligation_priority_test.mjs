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

const lowerRule = {
    id: "morning_errand",
    type: GOAL_TYPE.visit,
    priority: 100,
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
    id: "priority-test-npc",
    locationId: "home",
    currentPlaceId: null,
    homeLocationId: "home",
    homePlaceId: null,
    setLocationAndPlace(locationId, placeId = null) {
        this.locationId = String(locationId);
        this.currentPlaceId = placeId;
    },
};

const game = {
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
const obligationInterval = {
    start: new Date("2026-08-24T11:00:00.000Z"),
    end: new Date("2026-08-24T12:00:00.000Z"),
};
const obligationTiming = brain._obligationTiming(obligationRule, obligationInterval, game);
const obligationDepartureAt = new Date(
    obligationTiming.requiredArrivalAt.getTime() - 10 * 60_000,
);
const lowerTravelStartedAt = new Date(obligationDepartureAt.getTime() - 12 * 60_000);
brain.restoreJSON({
    currentGoal: {
        ruleId: lowerRule.id,
        type: lowerRule.type,
        priority: lowerRule.priority,
        startedAt: "2026-08-24T10:00:00.000Z",
        windowStart: "2026-08-24T10:00:00.000Z",
        windowEnd: "2026-08-24T11:00:00.000Z",
        targetLocationId: "errand",
        targetPlaceId: "errand-place",
    },
    currentAction: {
        type: NPC_ACTION_TYPE.travel,
        startedAt: lowerTravelStartedAt.toISOString(),
        arrivalAt: obligationDepartureAt.toISOString(),
        fromLocationId: "home",
        fromPlaceId: null,
        targetLocationId: "errand",
        targetPlaceId: "errand-place",
        leavePlaceMinutes: 0,
        enterPlaceMinutes: 2,
        route: {
            locations: ["home", "errand"],
            legMinutes: [10],
            currentLegIndex: 0,
        },
    },
    nextDecisionAt: obligationDepartureAt.toISOString(),
    lastUpdatedAt: new Date(obligationDepartureAt.getTime() - 60_000).toISOString(),
});

brain.updateTo(obligationDepartureAt, game);

check("an obligation wins a priority tie against the completed discretionary goal", brain.currentGoal?.ruleId === obligationRule.id);
check("NPC departs for the obligation at its required departure time", brain.currentAction?.startedAt === obligationDepartureAt.toISOString());
check("NPC is scheduled to arrive at its early-arrival time", brain.currentAction?.arrivalAt === obligationTiming.requiredArrivalAt.toISOString());
check("replacement action is travel", brain.currentAction?.type === NPC_ACTION_TYPE.travel);
check("departure begins the busy departing phase", brain.getScheduleStatus().phase === "departing");
check(
    "NPC travel records the same leave and enter costs as player movement",
    brain.currentAction?.leavePlaceMinutes === 1 &&
        brain.currentAction?.enterPlaceMinutes === 2,
);

brain.updateTo(new Date(obligationDepartureAt.getTime() + 30_000), game);
check(
    "NPC remains inside while paying the one-minute leaving cost",
    npc.locationId === "errand" && npc.currentPlaceId === "errand-place",
);
brain.updateTo(new Date(obligationDepartureAt.getTime() + 60_000), game);
check(
    "NPC is outside after leaving and before street travel completes",
    npc.locationId === "errand" &&
        npc.currentPlaceId === null &&
        brain.getScheduleStatus().phase === "travelling",
);
brain.updateTo(new Date(obligationDepartureAt.getTime() + 8 * 60_000), game);
check(
    "NPC spends the final two minutes entering the destination",
    npc.locationId === "office" && npc.currentPlaceId === null,
);
brain.updateTo(obligationTiming.requiredArrivalAt, game);
check(
    "NPC enters the obligation place only after the full transition cost",
    npc.locationId === "office" &&
        npc.currentPlaceId === "office-place" &&
        brain.currentAction?.type === NPC_ACTION_TYPE.stay &&
        brain.getScheduleStatus().phase === "early",
);

if (failures.length) {
    console.error("\nNPC obligation priority failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log("All NPC obligation priority tests passed.");
}
