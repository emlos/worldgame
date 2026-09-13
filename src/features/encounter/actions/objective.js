import { calculateSkillCheckChance } from "../../../game/scene/skillChecks.js";
import {
  getEffectiveHoldLeverage,
  getParticipant,
  getStat,
  holdsControlledBy,
} from "../combatants.js";
import { canMove } from "../affordances.js";
import {
  ENCOUNTER_POSE,
  ENCOUNTER_RANGE,
  ENCOUNTER_SUPPORT,
} from "../state.js";
import {
  actionInstance,
  chanceRoll,
  changeRange,
  clamp,
  failAction,
  proposeOutcome,
  removeHold,
} from "./helpers.js";
import {
  recoverTheftMoney,
  resolveSurrenderedTheft,
} from "../objectives/steal.js";

export const CONTROLLED_DISENGAGE_MIN_EXERTION = 35;
export const COMPLETE_CONTROL_MIN_WRIST_LEVERAGE = 30;
export const COMPLETE_CONTROL_MIN_TOTAL_LEVERAGE = 72;

function playerHasCompleteWristControl(context) {
  const strongestByWrist = new Map();
  for (const hold of holdsControlledBy(context, "player")) {
    if (hold.targetId !== "mugger") continue;
    const effective = getEffectiveHoldLeverage(context, hold);
    strongestByWrist.set(
      hold.targetPartId,
      Math.max(strongestByWrist.get(hold.targetPartId) || 0, effective),
    );
  }

  const left = strongestByWrist.get("lower_arm_l") || 0;
  const right = strongestByWrist.get("lower_arm_r") || 0;
  return left >= COMPLETE_CONTROL_MIN_WRIST_LEVERAGE
    && right >= COMPLETE_CONTROL_MIN_WRIST_LEVERAGE
    && left + right >= COMPLETE_CONTROL_MIN_TOTAL_LEVERAGE;
}

function muggerIsConstrained(context) {
  const mugger = getParticipant(context, "mugger");
  return mugger.support === ENCOUNTER_SUPPORT.wall
    || mugger.pose !== ENCOUNTER_POSE.standing;
}

function hasControlPosition(context) {
  return playerHasCompleteWristControl(context) && muggerIsConstrained(context);
}

function releaseAllHolds(context, runtime, reason) {
  for (const hold of [...context.state.relationships.holds]) {
    removeHold(context, hold, runtime, reason);
  }
}

export const SURRENDER_MONEY = Object.freeze({
  id: "surrender-money",
  tags: Object.freeze(["escape", "objective", "terminal"]),
  durationSeconds: 0,
  usableBy: Object.freeze(["player"]),
  playerOrder: 0,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, "mugger")];
  },

  isAvailable(context, instance) {
    const objective = context.state.objective;
    return instance.actorId === "player"
      && (!objective.searched || objective.lootAmount > 0);
  },

  label(context) {
    const objective = context.state.objective;
    if (objective.searched) {
      return `Give up and let them leave with £${objective.lootAmount}`;
    }
    return objective.amount > 0
      ? `Give up and hand over £${objective.amount}`
      : "Give up and show your empty pockets";
  },

  intentLabel() {
    return "offers to hand over the money";
  },

  resolve(context, _instance, runtime) {
    const outcome = resolveSurrenderedTheft(context, runtime.events);
    proposeOutcome(runtime, outcome.id, outcome.moneyLost);
  },
});

export const CONTROLLED_DISENGAGE = Object.freeze({
  id: "controlled-disengage",
  tags: Object.freeze(["escape", "movement", "disrupt-hold"]),
  durationSeconds: 1,
  usableBy: Object.freeze(["player"]),
  playerOrder: 2,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, "mugger")];
  },

  isAvailable(context, instance) {
    return instance.actorId === "player"
      && canMove(context, "player")
      && hasControlPosition(context)
      && getParticipant(context, "mugger").exertion >= CONTROLLED_DISENGAGE_MIN_EXERTION;
  },

  label() {
    return "Release them and suddenly spring away";
  },

  intentLabel() {
    return "prepares to release the hold and spring away";
  },

  resolve(context, instance, runtime) {
    const exertion = getParticipant(context, "mugger").exertion;
    const chance = clamp(
      0.5 + (exertion - CONTROLLED_DISENGAGE_MIN_EXERTION) * 0.006,
      0.5,
      0.88,
    );
    if (!chanceRoll(context, instance, runtime, "controlled-disengage", chance, {
      targetExertion: exertion,
    })) {
      failAction(runtime, instance, "disengage-anticipated");
      return;
    }

    releaseAllHolds(context, runtime, "controlled-disengage");
    changeRange(context, ENCOUNTER_RANGE.far, runtime);
    runtime.events.push({ type: "escape.disengaged", actorId: "player" });
  },
});

export const DEMAND_MONEY_BACK = Object.freeze({
  id: "demand-money-back",
  tags: Object.freeze(["escape", "objective"]),
  durationSeconds: 1,
  usableBy: Object.freeze(["player"]),
  playerOrder: 3,

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, "mugger")];
  },

  isAvailable(context, instance) {
    return instance.actorId === "player"
      && context.state.objective.searched
      && context.state.objective.lootAmount > 0
      && hasControlPosition(context);
  },

  label() {
    return "Demand your money back (Speech)";
  },

  intentLabel() {
    return "demands the stolen money back";
  },

  resolve(context, instance, runtime) {
    const speech = getStat(context, "player", "speech");
    const chance = calculateSkillCheckChance(speech, "tricky");
    if (!chanceRoll(context, instance, runtime, "speech-demand", chance, {
      skillId: "speech",
      skillValue: speech,
      difficultyId: "tricky",
    })) {
      failAction(runtime, instance, "demand-refused");
      return;
    }

    const amount = recoverTheftMoney(context, runtime.events);
    runtime.events.push({ type: "demand.succeeded", actorId: "player", amount });
  },
});
