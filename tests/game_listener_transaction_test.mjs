import { Game } from "../src/classes/game/game.js";

const START = new Date("2026-01-05T12:00:00.000Z");
const failures = [];

function check(label, condition) {
    if (condition) console.log(`PASS: ${label}`);
    else {
        console.error(`FAIL: ${label}`);
        failures.push(label);
    }
}

function catchesExpected(label, operation, expectedError) {
    try {
        operation();
        check(label, false);
    } catch (error) {
        check(label, error === expectedError);
    }
}

const directTime = new Game({ seed: 501, startDate: START, npcTemplates: [] });
const directTimeBefore = JSON.stringify(directTime);
const directTimeError = new Error("direct time listener failed");
let observedAdvancedTime = null;
const removeTimeMutationListener = directTime.on("time", (game) => {
    observedAdvancedTime = game.now.toISOString();
    game.setFlag("time-listener-side-effect");
    game.player.setMeterSkill("listener-progress", 0.75);
    game.timeListenerRuntimeProperty = true;
    game.on("location", () => {});
});
const removeThrowingTimeListener = directTime.on("time", () => {
    throw directTimeError;
});

catchesExpected(
    "direct advance rethrows its listener error",
    () => directTime.advanceMinutes(15),
    directTimeError,
);
check(
    "time listeners observe the proposed advanced clock",
    observedAdvancedTime === "2026-01-05T12:15:00.000Z",
);
check(
    "failed direct advance restores the exact persisted game state",
    JSON.stringify(directTime) === directTimeBefore,
);
check(
    "failed direct advance removes runtime properties added by listeners",
    !("timeListenerRuntimeProperty" in directTime),
);
check(
    "failed direct advance restores listener subscriptions",
    directTime._listeners.time.size === 2 && directTime._listeners.location.size === 0,
);
removeTimeMutationListener();
removeThrowingTimeListener();
check("direct-time unsubscribe functions survive rollback", directTime._listeners.time.size === 0);
directTime.advanceMinutes(15);
check(
    "direct advance succeeds after failed listeners are removed",
    directTime.now.toISOString() === "2026-01-05T12:15:00.000Z",
);

const directJump = new Game({ seed: 502, startDate: START, npcTemplates: [] });
const directJumpBefore = JSON.stringify(directJump);
const directJumpError = new Error("direct jump listener failed");
const jumpTarget = new Date("2027-07-20T15:30:00.000Z");
let observedJumpTime = null;
const removeJumpListener = directJump.on("timeJump", (game) => {
    observedJumpTime = game.now.toISOString();
    game.setFlag("jump-listener-side-effect");
    throw directJumpError;
});

catchesExpected(
    "direct jump rethrows its listener error",
    () => directJump.jumpToDate(jumpTarget),
    directJumpError,
);
check("time-jump listeners observe the proposed date", observedJumpTime === jumpTarget.toISOString());
check(
    "failed direct jump restores clock, environment, and listener side effects",
    JSON.stringify(directJump) === directJumpBefore,
);
removeJumpListener();
check("direct-jump unsubscribe functions survive rollback", directJump._listeners.timeJump.size === 0);
directJump.jumpToDate(jumpTarget);
check(
    "direct jump succeeds after the failed listener is removed",
    directJump.now.toISOString() === jumpTarget.toISOString(),
);

const directMove = new Game({ seed: 503, startDate: START, npcTemplates: [] });
const originLocationId = directMove.currentLocationId;
const targetLocationId = [...directMove.world.locations.keys()].find(
    (locationId) => locationId !== originLocationId,
);
const directMoveBefore = JSON.stringify(directMove);
const directMoveError = new Error("direct location listener failed");
let observedLocation = null;
let observedPlaceId = "not-called";
const removeLocationMutationListener = directMove.on("location", (game, locationId) => {
    observedLocation = locationId;
    observedPlaceId = game.currentPlaceId;
    game.setFlag("location-listener-side-effect");
    game.locationListenerRuntimeProperty = true;
    game.on("time", () => {});
});
const removeThrowingLocationListener = directMove.on("location", () => {
    throw directMoveError;
});

catchesExpected(
    "direct move rethrows its listener error",
    () => directMove.moveTo(targetLocationId),
    directMoveError,
);
check(
    "location listeners observe the proposed consistent position",
    observedLocation === targetLocationId && observedPlaceId === null,
);
check(
    "failed direct move restores location and listener side effects",
    JSON.stringify(directMove) === directMoveBefore,
);
check(
    "failed direct move removes runtime properties added by listeners",
    !("locationListenerRuntimeProperty" in directMove),
);
check(
    "failed direct move restores listener subscriptions",
    directMove._listeners.location.size === 2 && directMove._listeners.time.size === 0,
);
removeLocationMutationListener();
removeThrowingLocationListener();
check("direct-location unsubscribe functions survive rollback", directMove._listeners.location.size === 0);
directMove.moveTo(targetLocationId);
check(
    "direct move succeeds after failed listeners are removed",
    directMove.currentLocationId === targetLocationId &&
        directMove.currentPlaceId === null &&
        directMove.currentPlaceKey === null,
);

if (failures.length) {
    console.error("\nDirect listener transaction failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log("All direct listener transaction tests passed.");
}
