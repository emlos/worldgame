import { Game } from "../../src/classes/game/game.js";
import { createWGRuntimeContext } from "../../src/classes/game/scene/wg/runtimeContext.js";
import { NPC_ACTION_TYPE, NPC_SCHEDULE_PHASE } from "../../src/data/npc/behavior.js";

const failures = [];
const check = (label, condition) => {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
};

const START = new Date("2026-09-02T08:15:00.000Z");
const makeGame = () => new Game({ seed: 117, startDate: START });
const largeStep = makeGame();
const minuteSteps = makeGame();
largeStep.advanceMinutes(40);
for (let minute = 0; minute < 40; minute++) minuteSteps.advanceMinutes(1);

const taylor = largeStep.npcs.get("taylor");
const minuteTaylor = minuteSteps.npcs.get("taylor");
const goal = taylor.brain.currentGoal;
const status = taylor.brain.getScheduleStatus(largeStep.now);

check(
  "Taylor receives a deterministic early-arrival duration in the configured range",
  Number.isInteger(goal?.earlyArrivalMinutes) &&
    goal.earlyArrivalMinutes >= 5 &&
    goal.earlyArrivalMinutes <= 30,
);
check(
  "required arrival is exactly the early duration before school",
  Date.parse(goal?.requiredArrivalAt) ===
    Date.parse(goal?.windowStart) - goal?.earlyArrivalMinutes * 60_000,
);
check(
  "Taylor loiters inside the obligation place before school starts",
  status.phase === NPC_SCHEDULE_PHASE.early &&
    taylor.currentPlaceId === goal?.targetPlaceId &&
    taylor.brain.currentAction?.type === NPC_ACTION_TYPE.stay,
);
check("the early window remains generic busy time", taylor.brain.isBusyWithObligation);

const wgTaylor = createWGRuntimeContext(largeStep).npc.taylor;
check(
  "WG exposes authored early-arrival timing",
  wgTaylor.schedule.phase === "early" &&
    wgTaylor.schedule.obligationId === "school" &&
    wgTaylor.schedule.requiredArrivalAt === goal.requiredArrivalAt,
);
check(
  "large and minute time advances preserve the same early schedule",
  JSON.stringify(taylor) === JSON.stringify(minuteTaylor),
);

const loaded = Game.fromJSON(JSON.parse(JSON.stringify(largeStep)));
check(
  "save/load preserves the deterministic early schedule",
  JSON.stringify(loaded.npcs.get("taylor")) === JSON.stringify(taylor),
);

largeStep.advanceMinutes(5);
check(
  "the early phase becomes active when school begins",
  taylor.brain.getScheduleStatus(largeStep.now).phase === NPC_SCHEDULE_PHASE.active,
);

if (failures.length) {
  console.error("\nNPC early-arrival failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All NPC early-arrival tests passed.");
}
