import { BodyPartId } from "../../../characters/core/body.js";
import {
  calculatePainTolerance,
  getBodyPain,
  getBodyPart,
} from "../combatants.js";
import { controlledParticipantId, goalOwnerId, goalTargetId } from "../roles.js";
import { encounterPronoun, encounterVerb } from "../language.js";
import { PLAYER_RESCUED_OUTCOME_ID } from "../outcomes.js";

export const BEAT_DOWN_OBJECTIVE_ID = "beat-down";
export const BEAT_DOWN_OUTCOME = Object.freeze({
  targetRescued: PLAYER_RESCUED_OUTCOME_ID,
  targetEscaped: "player-escaped",
  targetBeatenDown: "player-beaten-down",
  ownerAbandoned: "attacker-abandoned",
  ownerIncapacitated: "attacker-incapacitated",
  mutualIncapacitation: "both-incapacitated",
});

const BEAT_DOWN_CAUSES = new Set([
  "pain-threshold",
  "already-incapacitated",
  "incapacitated",
  "no-legal-response",
  "energy-exhausted",
]);

function completedCause(context, fallback = null, { allowPainCompletion = true } = {}) {
  if (allowPainCompletion
    && getBodyPain(context, goalTargetId(context.state)) >= context.state.objective.painThreshold) {
    return "pain-threshold";
  }
  return fallback;
}

function beatenDownOutcome(context, cause) {
  return {
    id: BEAT_DOWN_OUTCOME.targetBeatenDown,
    cause,
    pain: Math.round(getBodyPain(context, goalTargetId(context.state)) * 100) / 100,
    painThreshold: context.state.objective.painThreshold,
  };
}

function recordCompletion(context, events, cause) {
  const outcome = beatenDownOutcome(context, cause);
  events.push({
    type: "beat-down.completed",
    actorId: goalOwnerId(context.state),
    targetId: goalTargetId(context.state),
    cause,
    pain: outcome.pain,
    painThreshold: outcome.painThreshold,
  });
  return outcome;
}

export const BEAT_DOWN_OBJECTIVE = Object.freeze({
  id: BEAT_DOWN_OBJECTIVE_ID,
  label: "Beat down",
  laboratoryConfig: Object.freeze({ id: BEAT_DOWN_OBJECTIVE_ID }),
  playerLossOutcomeIds: Object.freeze([BEAT_DOWN_OUTCOME.targetBeatenDown]),
  playerLeavesPlaceOutcomeIds: Object.freeze([
    BEAT_DOWN_OUTCOME.targetEscaped,
    BEAT_DOWN_OUTCOME.ownerIncapacitated,
  ]),
  unopposedActionId: "attack-limb",
  actionIds: Object.freeze(["attack-limb"]),
  excludedActionIds: Object.freeze(["flee"]),
  outcomePriority: Object.freeze([
    BEAT_DOWN_OUTCOME.targetRescued,
    BEAT_DOWN_OUTCOME.mutualIncapacitation,
    BEAT_DOWN_OUTCOME.ownerIncapacitated,
    BEAT_DOWN_OUTCOME.targetBeatenDown,
    BEAT_DOWN_OUTCOME.targetEscaped,
    BEAT_DOWN_OUTCOME.ownerAbandoned,
  ]),

  validateConfig(config, fail) {
    for (const key of Object.keys(config)) {
      if (key !== "id") fail(`config.goal.${key} is not supported by beat-down`);
    }
  },

  create({ game }) {
    const resolve = Number(game.player.getSkillValue("resolve")) || 0;
    const painThreshold = calculatePainTolerance(resolve);
    return {
      id: BEAT_DOWN_OBJECTIVE_ID,
      stage: "attack",
      painThreshold,
      lastProgressSecond: 0,
    };
  },

  complete(context) {
    context.state.objective.stage = "complete";
  },

  validateState(state, validation) {
    const { fail, exactKeys, string, integer } = validation;
    const objective = state.objective;
    exactKeys(
      objective,
      ["id", "ownerId", "targetId", "stage", "painThreshold", "lastProgressSecond"],
      "state.objective",
    );
    string(objective.stage, "state.objective.stage", new Set(["attack", "complete"]));
    if (!Number.isFinite(objective.painThreshold)
      || objective.painThreshold < 1
      || objective.painThreshold > 100) {
      fail("state.objective.painThreshold must be a number from 1 through 100");
    }
    integer(objective.lastProgressSecond, "state.objective.lastProgressSecond", {
      min: 0,
      max: state.elapsedSeconds,
    });

    if (state.phase !== "terminal") return;
    if (objective.stage !== "complete") fail("a terminal beat-down must have a complete objective stage");
    string(state.outcome.id, "state.outcome.id", new Set(Object.values(BEAT_DOWN_OUTCOME)));
    if (state.outcome.id === BEAT_DOWN_OUTCOME.targetBeatenDown) {
      exactKeys(state.outcome, ["id", "cause", "pain", "painThreshold"], "state.outcome");
      string(state.outcome.cause, "state.outcome.cause", BEAT_DOWN_CAUSES);
      if (!Number.isFinite(state.outcome.pain) || state.outcome.pain < 0 || state.outcome.pain > 100) {
        fail("state.outcome.pain must be a number from 0 through 100");
      }
      if (!Number.isFinite(state.outcome.painThreshold)
        || state.outcome.painThreshold < 1
        || state.outcome.painThreshold > 100) {
        fail("state.outcome.painThreshold must be a number from 1 through 100");
      }
      if (state.outcome.painThreshold !== objective.painThreshold) {
        fail("state.outcome.painThreshold must match the beat-down objective");
      }
    } else {
      exactKeys(state.outcome, ["id"], "state.outcome");
    }
  },

  progress(context) {
    const targetId = goalTargetId(context.state);
    return getBodyPain(context, targetId);
  },

  syncStage(context) {
    if (context.state.phase === "active") context.state.objective.stage = "attack";
  },

  recordProgress(context) {
    context.state.objective.lastProgressSecond = context.state.elapsedSeconds;
  },

  recordControlFailure() {},

  ai: Object.freeze({
    actionUtility(instance) {
      return instance.actionId === "attack-limb"
        ? { base: 11, objective: 1.5, pressure: 1.1, risk: 0.35 }
        : null;
    },

    commitment(context) {
      return {
        reward: 0,
        failedAttempts: 0,
        lastProgressSecond: context.state.objective.lastProgressSecond,
        minimum: 100,
      };
    },

    situationalBonuses(context, instance, { tags }) {
      const result = { objective: 0, control: 0, pressure: 0, safety: 0, escape: 0 };
      if (instance.actionId === "attack-limb") {
        const targetPart = getBodyPart(
          context,
          goalTargetId(context.state),
          instance.parameters.targetPartId,
        );
        result.objective += 70 + (1 - targetPart.integrityRatio) * 35;
        result.pressure += 30;
      } else if (tags.includes("attack")) {
        result.objective += 50;
        result.pressure += 20;
      } else if (instance.actionId === "close-distance") {
        result.objective += 65;
      } else if (tags.includes("control")) {
        result.control += 10;
      }
      if (["create-distance", "shove-away"].includes(instance.actionId)) {
        result.objective -= 25;
      }
      return result;
    },

    allowsRetreat() {
      return false;
    },

    forceRetreat() {
      return false;
    },

    pursuitPool(candidates) {
      return candidates.filter(({ actionId }) => !["flee", "run"].includes(actionId));
    },

    isProgressAction(tags) {
      return tags.includes("attack") || tags.includes("limb-damage");
    },
  }),

  mergeSimultaneous() {},
  commitGameState() {},

  mergeOutcomes(outcomes) {
    const ids = new Set(outcomes.map(({ id }) => id));
    if (ids.size === 1) return structuredClone(outcomes[0]);
    const id = this.outcomePriority.find((candidate) => ids.has(candidate));
    const selected = outcomes.find((outcome) => outcome.id === id);
    if (!selected) throw new Error("Physical encounter: beat-down objective cannot arbitrate outcomes");
    return structuredClone(selected);
  },

  outcomeForCompletion(context, events, options) {
    const cause = completedCause(context, null, options);
    return cause ? recordCompletion(context, events, cause) : null;
  },

  resolveTargetUnable(context, events, { reason = "incapacitated" } = {}) {
    return recordCompletion(context, events, reason);
  },

  outcomeForTargetEscape() {
    return { id: BEAT_DOWN_OUTCOME.targetEscaped };
  },

  outcomeForTargetRescue() {
    return { id: BEAT_DOWN_OUTCOME.targetRescued };
  },

  outcomeForOwnerEscape() {
    return { id: BEAT_DOWN_OUTCOME.ownerAbandoned };
  },

  outcomeForOwnerDefeat() {
    return { id: BEAT_DOWN_OUTCOME.ownerIncapacitated };
  },

  outcomeForMutualDefeat() {
    return { id: BEAT_DOWN_OUTCOME.mutualIncapacitation };
  },

  renderThreat(context) {
    const ownerId = goalOwnerId(context.state);
    return `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "intends", "intend")} to keep hurting you until you cannot fight back.`;
  },

  renderPressure(context) {
    const ownerId = goalOwnerId(context.state);
    const targetPain = Math.round(getBodyPain(context, goalTargetId(context.state)));
    const ownerPain = getBodyPain(context, ownerId);
    const persistence = ownerPain >= 45
      ? `Even badly hurt, ${encounterPronoun(context, ownerId, "subject")} ${encounterVerb(context, ownerId, "shows", "show")} no sign of backing off.`
      : `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "shows", "show")} no sign of backing off.`;
    return `Your pain is ${targetPain} of ${context.state.objective.painThreshold}. ${persistence}`;
  },

  renderEvent(context, event) {
    const ownerId = goalOwnerId(context.state);
    switch (event.type) {
      case "encounter.started":
        return `${context.combatants[ownerId].title} advances with the clear intent of beating you down.`;
      case "participant.unable-to-act":
        if (event.actorId !== goalTargetId(context.state)) return null;
        if (event.reason === "energy-exhausted") {
          return "Your remaining energy gives out, leaving you unable to defend yourself.";
        }
        return event.reason === "already-incapacitated"
          ? "You are already unable to defend yourself when the attacker closes in."
          : "Your injuries leave you unable to continue defending yourself.";
      case "beat-down.completed":
        if (event.cause === "pain-threshold") {
          return "The accumulated pain finally overwhelms your ability to fight back.";
        }
        return "You can no longer continue the fight.";
      case "escape.completed":
        return event.actorId === controlledParticipantId(context.state)
          ? "You get clear before the attacker can finish the beating."
          : null;
      default:
        return null;
    }
  },

  renderTerminal(context) {
    const { outcome } = context.state;
    const ownerId = goalOwnerId(context.state);
    const subject = encounterPronoun(context, ownerId, "subject", { sentence: true });
    let text;
    switch (outcome?.id) {
      case BEAT_DOWN_OUTCOME.targetEscaped:
        text = `You escape before ${encounterPronoun(context, ownerId, "subject")} can finish beating you down.`;
        break;
      case BEAT_DOWN_OUTCOME.targetRescued:
        text = `Your call is answered. ${subject} ${encounterVerb(context, ownerId, "breaks", "break")} off the attack as help approaches.`;
        break;
      case BEAT_DOWN_OUTCOME.targetBeatenDown:
        if (outcome.cause === "pain-threshold") {
          text = `Your pain reaches its limit. ${subject} ${encounterVerb(context, ownerId, "has", "have")} beaten you down.`;
          break;
        }
        text = `You can no longer defend yourself. ${subject} ${encounterVerb(context, ownerId, "has", "have")} beaten you down.`;
        break;
      case BEAT_DOWN_OUTCOME.ownerAbandoned:
        text = `${subject} abandons the attack and leaves.`;
        break;
      case BEAT_DOWN_OUTCOME.ownerIncapacitated:
        text = `${subject} can no longer continue the attack. You are safe to leave.`;
        break;
      case BEAT_DOWN_OUTCOME.mutualIncapacitation:
        text = "The fight leaves both of you unable to continue.";
        break;
      default:
        text = "The fight is over.";
    }
    return [{ type: "paragraph", text }];
  },
});
