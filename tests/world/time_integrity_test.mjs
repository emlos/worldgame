import { Game } from "../../src/classes/game/game.js";
import { World } from "../../src/classes/world/world.js";
import { WorldTime } from "../../src/classes/world/util/time.js";

const START_ISO = "2026-01-15T07:00:00.000Z";
const START = new Date(START_ISO);

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

// Constructor input and Date-valued reads must never expose the authoritative instant.
const suppliedDate = new Date(START);
const clock = new WorldTime({ startDate: suppliedDate });
suppliedDate.setUTCFullYear(2040);
check("constructor copies its Date input", clock.date.toISOString() === START_ISO);

const leakedClockDate = clock.date;
leakedClockDate.setUTCMonth(6);
check("mutating a clock Date snapshot cannot change the clock", clock.date.toISOString() === START_ISO);
check("each clock Date read returns a fresh snapshot", clock.date !== clock.date);
check("numeric timestamp exposes the current instant", clock.timestamp === START.getTime());

throws("the Date snapshot property cannot be assigned", () => {
    clock.date = new Date("2040-01-01T00:00:00Z");
});
check("failed Date assignment leaves the clock unchanged", clock.date.toISOString() === START_ISO);

// Clock mutations are validated and report UTC calendar crossings in either direction.
const crossingClock = new WorldTime({ startDate: "2026-01-15T23:59:00Z" });
check("advancing over UTC midnight reports one day", crossingClock.advanceMinutes(2) === 1);
check("rewinding over UTC midnight reports minus one day", crossingClock.advanceMinutes(-2) === -1);

const beforeInvalidMutation = crossingClock.timestamp;
throws("invalid absolute dates are rejected", () => crossingClock.setDate("not-a-date"));
throws("non-finite minute changes are rejected", () => crossingClock.advanceMinutes(Infinity));
check("rejected mutations leave the clock unchanged", crossingClock.timestamp === beforeInvalidMutation);
throws("malformed saved clocks are rejected", () => WorldTime.fromJSON({}));

const restoredClock = WorldTime.fromJSON(JSON.parse(JSON.stringify(clock)));
check("clock save/load preserves the exact instant", restoredClock.timestamp === clock.timestamp);

// World and Game expose snapshots too, preventing bypasses around synchronized setDate().
const world = new World({ seed: 123, startDate: START });
const worldBeforeLeak = JSON.stringify(world);
world.time.date.setUTCMonth(6);
check("mutating world.time.date cannot desynchronize world systems", JSON.stringify(world) === worldBeforeLeak);

const game = new Game({
    seed: 123,
    startDate: START,
    npcTemplates: [],
});
const gameBeforeLeak = JSON.stringify(game);
game.now.setUTCFullYear(2040);
check("mutating game.now cannot change game time", JSON.stringify(game) === gameBeforeLeak);

const gameStart = game.now.getTime();
game.advanceMinutes("60");
check("Game.advanceMinutes accepts numeric strings", game.now.getTime() === gameStart + 60 * 60 * 1000);

const beforeInvalidAction = JSON.stringify(game);
throws("Game.advanceMinutes rejects invalid durations", () => game.advanceMinutes("not-a-number"));
throws("runAction rejects invalid durations", () =>
    game.runAction({
        label: "invalid",
        minutes: "not-a-number",
        apply: () => {
            throw new Error("action should not be applied");
        },
    }),
);
check("invalid runAction leaves game unchanged", JSON.stringify(game) === beforeInvalidAction);

// A same-time jump must not rebuild NPC schedules or emit a time-jump event.
// Advance first so the NPCs have meaningful sequential simulation state that
// differs from a freshly reconstructed snapshot at the same timestamp.
const noOpJumpGame = new Game({
    seed: 117,
    startDate: new Date("2026-08-24T08:00:00.000Z"),
});
noOpJumpGame.advanceMinutes(10 * 60);
const beforeNoOpJump = JSON.stringify(noOpJumpGame);
let noOpJumpEvents = 0;
noOpJumpGame.on("timeJump", () => {
    noOpJumpEvents += 1;
});
const noOpJumpResult = noOpJumpGame.jumpToDate(noOpJumpGame.now);
check("same-time jumps report a zero-minute change", noOpJumpResult.minutes === 0);
check("same-time jumps preserve the complete game state", JSON.stringify(noOpJumpGame) === beforeNoOpJump);
check("same-time jumps do not emit time-jump events", noOpJumpEvents === 0);

const target = new Date("2027-07-20T15:30:00Z");
const returnedDate = world.setDate(target);
target.setUTCFullYear(2040);
returnedDate.setUTCFullYear(2041);
const savedWorld = world.toJSON();
check("World.setDate updates the authoritative clock", world.time.timestamp === Date.parse("2027-07-20T15:30:00Z"));
check("World.setDate synchronizes weather", savedWorld.weather.date === savedWorld.time.date);
check("World.setDate synchronizes the moon", savedWorld.moon.date === savedWorld.time.date);
check("World.setDate synchronizes the calendar year", savedWorld.calendar.year === 2027);

const loadedWorld = World.fromJSON(JSON.parse(JSON.stringify(world)));
check("world save/load preserves synchronized clock state", equal(world, loadedWorld));

console.log("All world clock integrity tests passed.");
