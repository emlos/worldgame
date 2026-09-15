import { calculateSkillCheckChance } from "../../../game/scene/skillChecks.js";
import {
  getEffectiveHoldLeverage,
  getParticipant,
  getStat,
  getUsableHands,
  holdsControlledBy,
} from "../combatants.js";
import {
  canBeginPhysicalAction,
  canMove,
  hasActionGeometry,
  hasUsableControl,
} from "../affordances.js";
import {
  ENCOUNTER_POSE,
  ENCOUNTER_RANGE,
  ENCOUNTER_SUPPORT,
} from "../state.js";
import {
  actionInstance,
  addExertion,
  chanceRoll,
  changeRange,
  clamp,
  failAction,
  proposeOutcome,
  removeHold,
} from "./helpers.js";
import { requireEncounterObjective } from "../objectives/index.js";
import { controlledParticipantId, goalOwnerId, goalTargetId } from "../roles.js";
import { actionIntentProse } from "../proseData.js";

export const CONTROLLED_DISENGAGE_MIN_EXERTION = 35;
export const COMPLETE_CONTROL_MIN_WRIST_LEVERAGE = 30;
export const COMPLETE_CONTROL_MIN_TOTAL_LEVERAGE = 72;

function playerHasCompleteWristControl(context) {
  const playerId = controlledParticipantId(context.state);
  const opponentId = goalOwnerId(context.state);
  const strongestByWrist = new Map();
  for (const hold of holdsControlledBy(context, playerId)) {
    if (hold.targetId !== opponentId) continue;
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

function opponentIsConstrained(context) {
  const opponent = getParticipant(context, goalOwnerId(context.state));
  return opponent.support === ENCOUNTER_SUPPORT.wall
    || opponent.pose !== ENCOUNTER_POSE.standing;
}

function hasControlPosition(context) {
  return playerHasCompleteWristControl(context) && opponentIsConstrained(context);
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
  usableBy: "controlled",
  playerOrder: 0,
  availabilityHint: "Available until the attacker has abandoned the theft after returning the money.",

  enumerateTargets(context, actorId) {
    return [actionInstance(this.id, actorId, goalOwnerId(context.state))];
  },

  isAvailable(context, instance) {
    const objective = context.state.objective;
    return instance.actorId === controlledParticipantId(context.state)
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

  intentLabel(context, intent) {
    return actionIntentProse(context, { ...intent, actionId: this.id });
  },

  resolve(context, _instance, runtime) {
    const outcome = requireEncounterObjective(context.state)
      .resolveSurrender(context, runtime.events);
    proposeOutcome(runtime, outcome);
  },
});

export const CONTROLLED_DISENGAGE = Object.freeze({
  id: "controlled-disengage",
  tags: Object.freeze(["escape", "movement", "disrupt-hold"]),
  durationSeconds: 1,
  usableBy: "controlled",
  playerOrder: 2,
  availabilityHint: "Requires secure effective control of both opposing wrists, the opponent against a wall or on the ground, standing mobility, and at least medium exhaustion.",

  enumerateTargets(context, actorId) {
    return [actionInstance(this.id, actorId, goalOwnerId(context.state))];
  },

  isAvailable(context, instance) {
    const playerId = controlledParticipantId(context.state);
    const opponentId = goalOwnerId(context.state);
    return instance.actorId === playerId
      && canMove(context, playerId)
      && hasActionGeometry(context, instance)
      && hasControlPosition(context)
      && getParticipant(context, opponentId).exertion >= CONTROLLED_DISENGAGE_MIN_EXERTION;
  },

  label() {
    return "Release them and suddenly spring away";
  },

  intentLabel(context, intent) {
    return actionIntentProse(context, { ...intent, actionId: this.id });
  },

  resolve(context, instance, runtime) {
    const exertion = getParticipant(context, goalOwnerId(context.state)).exertion;
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
    runtime.events.push({
      type: "escape.disengaged",
      actorId: controlledParticipantId(context.state),
    });
  },
});

export const DEMAND_MONEY_BACK = Object.freeze({
  id: "demand-money-back",
  tags: Object.freeze(["escape", "objective"]),
  durationSeconds: 1,
  usableBy: "controlled",
  playerOrder: 3,
  availabilityHint: "Requires stolen money, secure effective control of both opposing wrists, and the opponent against a wall or on the ground.",

  enumerateTargets(context, actorId) {
    return [actionInstance(this.id, actorId, goalOwnerId(context.state))];
  },

  isAvailable(context, instance) {
    return instance.actorId === controlledParticipantId(context.state)
      && context.state.objective.searched
      && context.state.objective.lootAmount > 0
      && hasControlPosition(context);
  },

  label() {
    return "Demand your money back (Speech)";
  },

  intentLabel(context, intent) {
    return actionIntentProse(context, { ...intent, actionId: this.id });
  },

  resolve(context, instance, runtime) {
    const playerId = controlledParticipantId(context.state);
    const speech = getStat(context, playerId, "speech");
    const chance = calculateSkillCheckChance(speech, "tricky");
    if (!chanceRoll(context, instance, runtime, "speech-demand", chance, {
      skillId: "speech",
      skillValue: speech,
      difficultyId: "tricky",
    })) {
      failAction(runtime, instance, "demand-refused");
      return;
    }

    const amount = requireEncounterObjective(context.state).recover(context, runtime.events);
    runtime.events.push({ type: "demand.succeeded", actorId: playerId, amount });
  },
});

export const SEARCH_MONEY = Object.freeze({
  id: "search-money",
  tags: Object.freeze(["objective", "theft"]),
  durationSeconds: 4,
  usableBy: "goal-owner",
  playerOrder: 100,
  availabilityHint: "Requires sufficient usable control over the target.",

  enumerateTargets(context, actorId) {
    return [actionInstance(this.id, actorId, goalTargetId(context.state))];
  },

  isAvailable(context, instance) {
    return instance.actorId === goalOwnerId(context.state)
      && canBeginPhysicalAction(context, instance.actorId)
      && hasActionGeometry(context, instance)
      && getUsableHands(context, instance.actorId).length > 0
      && hasUsableControl(context, instance.actorId, instance.targetId);
  },

  label() {
    return "Take the money";
  },

  intentLabel(context, intent) {
    return actionIntentProse(context, { ...intent, actionId: this.id });
  },

  resolve(context, instance, runtime) {
    addExertion(context, instance.actorId, 6);
    requireEncounterObjective(context.state).take(context, runtime.events);
    context.state.objective.stage = "disengage";
  },
});
