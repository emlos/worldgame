import { Game } from "../../src/classes/game/game.js";
import { createWGRuntimeContext } from "../../src/classes/game/scene/wg/runtimeContext.js";
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

const visitRule = {
  id: "errand",
  type: GOAL_TYPE.visit,
  priority: 30,
  when: { from: "10:00", to: "11:00" },
  stayMinutes: { min: 20, max: 20 },
  target: { type: TARGET_TYPE.placeKeys, candidates: ["errand"] },
};
const obligationRule = {
  id: "office-shift",
  type: GOAL_TYPE.obligation,
  priority: 100,
  when: { from: "11:00", to: "12:00" },
  target: { type: TARGET_TYPE.placeKeys, candidates: ["office"] },
};
const locations = new Map([
  [
    "errand",
    {
      id: "errand",
      places: [
        { id: "errand-place", key: "errand", props: { category: [] } },
        { id: "coffee-place", key: "coffee", props: { category: [] } },
      ],
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
const controlledNpc = {
  id: "interaction-test-npc",
  locationId: "errand",
  currentPlaceId: "errand-place",
  homeLocationId: "errand",
  homePlaceId: "errand-place",
  setLocationAndPlace(locationId, placeId = null) {
    this.locationId = String(locationId);
    this.currentPlaceId = placeId;
  },
};
const controlledGame = {
  seed: 1,
  world: {
    map: {
      locations,
      getTravelMinutes(from, to) {
        return String(from) === String(to) ? 0 : 7;
      },
      getTravelTotal(from, to) {
        const minutes = String(from) === String(to) ? 0 : 7;
        return {
          locations: String(from) === String(to) ? [String(from)] : [String(from), String(to)],
          edges: minutes ? [{ minutes }] : [],
          minutes,
        };
      },
    },
    getLocation(id) {
      return locations.get(String(id));
    },
  },
  getRNG() {
    return () => 0.5;
  },
};

const brain = new NPCBrain(controlledNpc, { goals: [visitRule, obligationRule] });
const obligationInterval = {
  start: new Date("2026-08-24T11:00:00.000Z"),
  end: new Date("2026-08-24T12:00:00.000Z"),
};
const obligationTiming = brain._obligationTiming(
  obligationRule,
  obligationInterval,
  controlledGame,
);
const latestDepartureAt = new Date(
  obligationTiming.requiredArrivalAt.getTime() - 10 * 60_000,
);
const now = new Date(latestDepartureAt.getTime() - 4 * 60_000);
brain.restoreJSON({
  currentGoal: {
    ruleId: visitRule.id,
    type: visitRule.type,
    priority: visitRule.priority,
    startedAt: "2026-08-24T10:00:00.000Z",
    windowStart: "2026-08-24T10:00:00.000Z",
    windowEnd: "2026-08-24T11:00:00.000Z",
    targetLocationId: "errand",
    targetPlaceId: "errand-place",
  },
  currentAction: {
    type: NPC_ACTION_TYPE.stay,
    startedAt: "2026-08-24T10:00:00.000Z",
    until: "2026-08-24T10:55:00.000Z",
    locationId: "errand",
    placeId: "errand-place",
  },
  nextDecisionAt: "2026-08-24T10:55:00.000Z",
  lastUpdatedAt: now.toISOString(),
});

const beforeQuery = JSON.stringify(brain.toJSON());
check(
  "a four-minute conversation may end at the exact latest departure time",
  brain.getInteractionObligationConflict(controlledGame, {
    at: now,
    durationMinutes: 4,
  }) === null,
);
const conflict = brain.getInteractionObligationConflict(controlledGame, {
  at: now,
  durationMinutes: 5,
});
check(
  "a conversation is rejected when it would make the NPC one minute late",
  conflict?.ruleId === obligationRule.id &&
    conflict.latestDepartureAt === latestDepartureAt.toISOString() &&
    conflict.requiredArrivalAt === obligationTiming.requiredArrivalAt.toISOString() &&
    conflict.earlyArrivalMinutes === obligationTiming.earlyArrivalMinutes &&
    conflict.projectedArrivalAt === new Date(
      obligationTiming.requiredArrivalAt.getTime() + 60_000,
    ).toISOString(),
);
check(
  "interaction forecasting includes leaving, street travel, and entering",
  conflict?.travelMinutes === 10,
);
check(
  "interaction forecasting is a pure query",
  JSON.stringify(brain.toJSON()) === beforeQuery,
);

const sameLocationNpc = {
  ...controlledNpc,
  id: "same-location-test-npc",
  currentPlaceId: "errand-place",
};
const sameLocationBrain = new NPCBrain(sameLocationNpc, {
  goals: [
    {
      id: "get-coffee",
      type: GOAL_TYPE.visit,
      priority: 30,
      when: { from: "10:00", to: "11:00" },
      stayMinutes: { min: 20, max: 20 },
      target: { type: TARGET_TYPE.placeKeys, candidates: ["coffee"] },
    },
  ],
});
sameLocationBrain.restoreJSON({
  currentGoal: null,
  currentAction: { type: NPC_ACTION_TYPE.idle, startedAt: "2026-08-24T09:59:00.000Z" },
  nextDecisionAt: "2026-08-24T10:00:00.000Z",
  lastUpdatedAt: "2026-08-24T09:59:00.000Z",
});
sameLocationBrain.updateTo(new Date("2026-08-24T10:00:00.000Z"), controlledGame);
check(
  "same-location place changes still cost one minute out and two minutes in",
  sameLocationBrain.currentAction?.type === NPC_ACTION_TYPE.travel &&
    sameLocationBrain.currentAction?.arrivalAt === "2026-08-24T10:03:00.000Z" &&
    sameLocationBrain.currentAction?.route.locations.length === 1,
);
sameLocationBrain.updateTo(new Date("2026-08-24T10:01:00.000Z"), controlledGame);
check(
  "same-location NPC movement reaches the street after leaving",
  sameLocationNpc.locationId === "errand" && sameLocationNpc.currentPlaceId === null,
);
sameLocationBrain.updateTo(new Date("2026-08-24T10:03:00.000Z"), controlledGame);
check(
  "same-location NPC movement enters its destination after three minutes",
  sameLocationNpc.locationId === "errand" && sameLocationNpc.currentPlaceId === "coffee-place",
);

const game = new Game({
  seed: 117,
  startDate: new Date("2026-08-24T08:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});
const taylor = game.npcs.get("taylor");
taylor.setLocationAndPlace(game.currentLocationId, game.currentPlaceId);
taylor.brain.currentGoal = null;
taylor.brain.currentAction = null;
let requestedDuration = null;
taylor.brain.getInteractionObligationConflict = (_game, options) => {
  requestedDuration = options.durationMinutes;
  return options.durationMinutes > 4 ? conflict : null;
};

check(
  "Game permits a shorter interaction that still meets the deadline",
  game.getNPCInteractionAccess(taylor, { durationMinutes: 4 }).allowed,
);
const access = game.getNPCInteractionAccess(taylor);
check(
  "Game exposes a distinct obligation-deadline rejection",
  !access.allowed && access.code === "obligation-deadline" && access.conflict === conflict,
);
check("Game uses five minutes for a normal NPC interaction", requestedDuration === 5);
check(
  "WG npc.available observes the deadline-aware interaction query",
  createWGRuntimeContext(game).npc.taylor.available === false,
);

taylor.brain.currentGoal = { type: GOAL_TYPE.obligation };
check(
  "an active obligation retains its higher-precedence rejection code",
  game.getNPCInteractionAccess(taylor).code === "busy-obligation",
);

if (failures.length) {
  console.error("\nNPC interaction deadline failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All NPC interaction deadline tests passed.");
}
