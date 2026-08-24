import { Game } from "../src/classes/game/game.js";
import { BodyPartId } from "../src/shared/classes/body.js";

const START = new Date("2026-01-05T12:00:00.000Z");
const failures = [];

function check(label, condition) {
    if (condition) console.log(`PASS: ${label}`);
    else failures.push(label);
}

function catchesExpected(label, fn, expectedError) {
    try {
        fn();
        check(label, false);
    } catch (error) {
        check(label, error === expectedError);
    }
}

const successful = new Game({ seed: 101, startDate: START, npcTemplates: [] });
const successfulStart = successful.now.toISOString();
successful.runAction({
    label: "successful action",
    minutes: 30,
    apply(game) {
        game.setFlag("effect-committed");
        game.player.setMeterSkill("progress", 0.25);
    },
});
check("successful action commits gameplay effects", successful.hasFlag("effect-committed"));
check("successful action commits player changes", successful.player.getSkill("progress")?.value === 0.25);
check(
    "successful action pays its time cost",
    successful.now.getTime() === START.getTime() + 30 * 60 * 1000,
);
check("successful action writes one log entry", successful.log.length === 1);
check("successful action log records its start time", successful.log[0]?.t === successfulStart);

const callbackFailure = new Game({ seed: 202, startDate: START, npcTemplates: [] });
const callbackBefore = JSON.stringify(callbackFailure);
const callbackError = new Error("apply failed");
const originalLocationListeners = callbackFailure._listeners.location.size;
catchesExpected(
    "an apply callback error is rethrown",
    () =>
        callbackFailure.runAction({
            label: "must not commit",
            minutes: 20,
            apply(game) {
                game.setFlag("partial-flag");
                game.player.applyDamageToPart({ partId: BodyPartId.HEAD, amount: 25 });
                game.on("location", () => {});
                game.failedActionProperty = "must be removed";
                throw callbackError;
            },
        }),
    callbackError,
);
check("callback failure restores the exact persisted game state", JSON.stringify(callbackFailure) === callbackBefore);
check("callback failure removes runtime properties added by the action", !("failedActionProperty" in callbackFailure));
check(
    "callback failure restores event subscriptions",
    callbackFailure._listeners.location.size === originalLocationListeners,
);

const simulationFailure = new Game({ seed: 303, startDate: START });
const simulationBefore = JSON.stringify(simulationFailure);
let simulationError = null;
try {
    simulationFailure.runAction({
        label: "simulation must fail",
        minutes: 10,
        apply(game) {
            game.setFlag("partial-simulation-effect");
            game.player.setFlagSkill("partial-skill", true);
            for (const npc of game.npcs.values()) {
                if (!npc.brain) continue;
                for (const rule of npc.behavior.goals) rule.weight = -1;
                npc.brain.nextDecisionAt = new Date(game.now);
            }
        },
    });
} catch (error) {
    simulationError = error;
}
check(
    "NPC simulation failure reaches the action boundary",
    simulationError?.message?.includes("Invalid NPC goal weight"),
);
check(
    "simulation failure restores effects, time, NPCs, RNG and log exactly",
    JSON.stringify(simulationFailure) === simulationBefore,
);

const listenerFailure = new Game({ seed: 404, startDate: START, npcTemplates: [] });
const listenerBefore = JSON.stringify(listenerFailure);
const listenerError = new Error("time listener failed");
let listenerCalls = 0;
const unsubscribe = listenerFailure.on("time", () => {
    listenerCalls++;
    listenerFailure.setFlag("listener-side-effect");
    throw listenerError;
});
catchesExpected(
    "a time-listener error is rethrown",
    () =>
        listenerFailure.runAction({
            label: "listener failure",
            minutes: 5,
            apply(game) {
                game.setFlag("action-before-listener");
            },
        }),
    listenerError,
);
check("listener ran before its failure was handled", listenerCalls === 1);
check("listener failure restores the exact persisted state", JSON.stringify(listenerFailure) === listenerBefore);
unsubscribe();
check("pre-existing unsubscribe functions still work after rollback", listenerFailure._listeners.time.size === 0);
listenerFailure.advanceMinutes(5);
check("time can advance normally after removing the failed listener", listenerFailure.now > START);

if (failures.length) {
    console.error("\nGame action transaction failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log("All atomic game action tests passed.");
}
