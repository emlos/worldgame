import { Game } from "../../src/classes/game/game.js";
import { NPC } from "../../src/classes/npc/npc.js";
import { GOAL_TYPE, TARGET_TYPE } from "../../src/data/npc/behavior.js";
import { PLACE_TAGS } from "../../src/data/world/place.js";

const START = new Date("2026-08-17T07:00:00Z");

function equal(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function check(name, condition) {
    if (!condition) throw new Error(`FAIL: ${name}`);
    console.log(`PASS: ${name}`);
}

function throws(name, fn) {
    let didThrow = false;
    try {
        fn();
    } catch {
        didThrow = true;
    }
    check(name, didThrow);
}

const behavior = {
    goals: [
        {
            id: "night_home",
            type: GOAL_TYPE.home,
            priority: 90,
            when: { from: "22:00", to: "08:00" },
        },
        {
            id: "day_in_town",
            type: GOAL_TYPE.visit,
            priority: 30,
            weight: 1,
            when: { from: "08:00", to: "22:00" },
            stayMinutes: { min: 20, max: 40 },
            target: {
                type: TARGET_TYPE.placeKeys,
                candidates: ["town_square"],
            },
        },
    ],
};

const customTemplate = {
    key: "custom-night-guard",
    name: "Custom Guard",
    homePreference: {
        withPlaceCategory: [PLACE_TAGS.housing],
        // Template functions are used during creation but are intentionally not
        // required to hydrate an already-created NPC.
        nameFn: () => "The Guard House",
    },
    behavior,
};

const game = new Game({
    seed: 77,
    startDate: START,
    npcTemplates: [customTemplate],
});
const originalNpc = game.npcsArray[0];

check("custom NPC starts with its configured brain", originalNpc.brain?.rules.length === 2);
behavior.goals[0].priority = 999;
check(
    "running NPC behavior is isolated from template mutations",
    originalNpc.brain.rules[0].priority === 90,
);

const save = JSON.parse(JSON.stringify(game));
check("game writes the self-contained save schema", save.saveVersion === 6);
check("NPC behavior is present in the save", equal(save.npcs[0].behavior, originalNpc.behavior));

// No npcTemplates argument is supplied: hydration must rely only on save data.
const loaded = Game.fromJSON(save);
const loadedNpc = loaded.npcsArray[0];
check("custom NPC reloads without its source template", loadedNpc.name === "Custom Guard");
check("custom NPC brain survives save/load", loadedNpc.brain?.rules.length === 2);
check("saved behavior survives exactly", equal(loadedNpc.behavior, originalNpc.behavior));
check("brain runtime state survives exactly", equal(loadedNpc.brain, originalNpc.brain));
check("whole-game save data round-trips exactly", equal(loaded, game));

save.npcs[0].behavior.goals[0].priority = -500;
check(
    "loaded behavior is isolated from later save-object mutations",
    loadedNpc.brain.rules[0].priority === 90,
);

// Both timelines must make the same target and duration choices after hydration.
game.advanceMinutes(12 * 60 + 17);
loaded.advanceMinutes(12 * 60 + 17);
check("custom NPC continues identically after loading", equal(loaded, game));

const secondLoad = Game.fromJSON(JSON.parse(JSON.stringify(loaded)));
loaded.advanceMinutes(24 * 60 + 31);
secondLoad.advanceMinutes(24 * 60 + 31);
check("repeated save/load preserves custom NPC continuation", equal(secondLoad, loaded));

throws("behavior functions are rejected instead of silently disappearing", () =>
    new NPC({
        name: "Invalid Function NPC",
        behavior: { goals: [], chooseTarget: () => "somewhere" },
    }),
);
throws("non-finite behavior values are rejected", () =>
    new NPC({
        name: "Invalid Number NPC",
        behavior: { goals: [{ id: "bad", weight: Infinity }] },
    }),
);

const weightedNpc = new NPC({
    id: "weighted-npc",
    name: "Weighted NPC",
    homeLocationId: "home",
    behavior: {
        goals: [
            { id: "disabled", type: GOAL_TYPE.home, weight: 0, when: { from: "00:00", to: "08:00" } },
            { id: "enabled", type: GOAL_TYPE.home, weight: 1, when: { from: "00:00", to: "08:00" } },
        ],
    },
});
const weightedCandidates = weightedNpc.brain._getDecisionCandidates(START, null);
check("zero NPC goal weights remain disabled", weightedCandidates[0].weight === 0);

const invalidWeightNpc = new NPC({
    id: "invalid-weight-npc",
    name: "Invalid Weight NPC",
    homeLocationId: "home",
    behavior: {
        goals: [{ id: "bad", type: GOAL_TYPE.home, weight: -1, when: { from: "00:00", to: "08:00" } }],
    },
});
throws("negative NPC goal weights are rejected", () =>
    invalidWeightNpc.brain._getDecisionCandidates(START, null),
);

const missingBehavior = JSON.parse(JSON.stringify(game.npcsArray[0]));
delete missingBehavior.behavior;
throws("NPC saves missing behavior are rejected", () => NPC.fromJSON(missingBehavior));

console.log("All self-contained NPC save tests passed.");
