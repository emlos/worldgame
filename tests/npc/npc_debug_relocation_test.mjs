import { teleportNPCToPlayer } from "../../src/classes/game/debugCommands.js";
import { Game } from "../../src/classes/game/game.js";
import { performChoice } from "../../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import { NPC_ACTION_TYPE } from "../../src/data/npc/behavior.js";

const failures = [];
const check = (label, condition) => {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
};

const freeGame = new Game({
  seed: 117,
  startDate: new Date("2026-08-24T08:00:00.000Z"),
});
const freeTaylor = freeGame.npcs.get("taylor");
const freeResult = teleportNPCToPlayer(freeGame, "taylor");

check("free Taylor is not marked busy", freeResult.busyWithObligation === false);
check(
  "free Taylor teleports to the player's exact position",
  String(freeTaylor.locationId) === String(freeGame.currentLocationId) &&
    String(freeTaylor.currentPlaceId) === String(freeGame.currentPlaceId),
);
check(
  "free Taylor receives a 30-minute temporary stay",
  freeTaylor.brain.currentAction?.type === NPC_ACTION_TYPE.temporaryStay &&
    freeTaylor.brain.currentAction?.until === "2026-08-24T08:30:00.000Z",
);

const freeSave = JSON.parse(JSON.stringify(freeGame));
const loadedFreeGame = Game.fromJSON(freeSave);
const loadedFreeTaylor = loadedFreeGame.npcs.get("taylor");
check(
  "temporary relocation survives save validation and hydration",
  loadedFreeTaylor.brain.currentAction?.type === NPC_ACTION_TYPE.temporaryStay,
);
let loadedScene = buildScene(loadedFreeGame);
check(
  "temporary relocation does not create a placeholder greeting",
  !loadedScene.sections
    .flatMap((section) => section.choices)
    .some((choice) => choice.id === "greet:taylor"),
);
const leaveChoice = loadedScene.sections
  .flatMap((section) => section.choices)
  .find((choice) => choice.id === "leave");
performChoice(loadedFreeGame, {
  sceneId: loadedScene.id,
  choiceId: leaveChoice.id,
});
check(
  "authored choices still work during a temporary relocation",
  loadedFreeGame.currentPlaceId === null &&
    loadedFreeGame.now.toISOString() === "2026-08-24T08:01:00.000Z",
);

const noSchoolStayEndsAt = new Date(freeTaylor.brain.nextDecisionAt);
freeGame.advanceMinutes(
  (noSchoolStayEndsAt.getTime() - freeGame.now.getTime()) / 60_000 - 1,
);
check(
  "temporary relocation remains in force on a no-school morning",
  freeTaylor.brain.currentAction?.type === NPC_ACTION_TYPE.temporaryStay &&
    !freeTaylor.brain.isBusyWithObligation,
);
freeGame.advanceMinutes(1);
check(
  "a no-school temporary relocation expires without creating an obligation",
  freeTaylor.brain.currentAction?.type !== NPC_ACTION_TYPE.temporaryStay &&
    !freeTaylor.brain.isBusyWithObligation,
);

const schoolDepartureGame = new Game({
  seed: 117,
  startDate: new Date("2026-09-02T07:30:00.000Z"),
});
const schoolDepartureTaylor = schoolDepartureGame.npcs.get("taylor");
teleportNPCToPlayer(schoolDepartureGame, "taylor", { stayMinutes: 90 });
const schoolDepartureAt = new Date(schoolDepartureTaylor.brain.nextDecisionAt);
schoolDepartureGame.advanceMinutes(
  (schoolDepartureAt.getTime() - schoolDepartureGame.now.getTime()) / 60_000 - 1,
);
check(
  "temporary relocation remains in force before a school departure",
  schoolDepartureTaylor.brain.currentAction?.type === NPC_ACTION_TYPE.temporaryStay &&
    !schoolDepartureTaylor.brain.isBusyWithObligation,
);
schoolDepartureGame.advanceMinutes(1);
check(
  "a school departure interrupts the temporary relocation",
  schoolDepartureTaylor.brain.currentAction?.type !== NPC_ACTION_TYPE.temporaryStay &&
    schoolDepartureTaylor.brain.currentGoal?.ruleId === "school",
);

const busyGame = new Game({
  seed: 117,
  startDate: new Date("2026-09-02T08:45:00.000Z"),
  playerOptions: { startPlaceId: null },
});
const busyTaylor = busyGame.npcs.get("taylor");
const obligationTarget = busyTaylor.brain.currentGoal?.targetLocationId;
const busyResult = teleportNPCToPlayer(busyGame, "taylor");

check("active obligation survives debug relocation", busyResult.busyWithObligation === true);
check(
  "busy Taylor replans travel from the player's location",
  busyTaylor.brain.currentGoal?.type === "obligation" &&
    busyTaylor.brain.currentGoal?.targetLocationId === obligationTarget &&
    busyTaylor.brain.currentAction?.type === "travel" &&
    busyTaylor.brain.currentAction?.fromLocationId === busyGame.currentLocationId,
);
check(
  "busy Taylor is authoritatively unavailable for interaction",
  busyGame.getNPCInteractionAccess(busyTaylor).code === "busy-obligation",
);

const busyScene = buildScene(busyGame);
check(
  "busy NPCs do not create placeholder greeting choices",
  !busyScene.sections
    .flatMap((section) => section.choices)
    .some((choice) => choice.id === "greet:taylor"),
);

const arrivalAt = new Date(busyTaylor.brain.currentAction.arrivalAt);
busyGame.advanceMinutes((arrivalAt.getTime() - busyGame.now.getTime()) / 60_000);
check(
  "busy Taylor continues to the obligation destination",
  String(busyTaylor.locationId) === String(obligationTarget) &&
    busyTaylor.brain.currentGoal?.type === "obligation",
);

if (failures.length) {
  console.error("\nNPC debug relocation failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All NPC debug relocation tests passed.");
}
