import { BodyPartId } from "../../../characters/core/body.js";
import {
  calculatePainTolerance,
  getBodyPain,
  getBodyPart,
} from "../combatants.js";
import { goalOwnerId, goalTargetId } from "../roles.js";
import { PLAYER_RESCUED_OUTCOME_ID } from "../outcomes.js";
import {
  beatDownEscapeProseVariants,
  beatDownEventProse,
  beatDownPressureProse,
  beatDownTerminalStaticProse,
  beatDownThreatProse,
} from "../proseData.js";
import { pickProseVariant } from "../proseVariants.js";

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
  const restrainedStop = context.state.objective.stage === "restrained";
  if ((allowPainCompletion || restrainedStop)
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
  laboratoryConfig: Object.freeze({
    id: BEAT_DOWN_OBJECTIVE_ID,
    painTarget: 50,
    escalatedPainTarget: 85,
    angerThreshold: 45,
  }),
  playerLossOutcomeIds: Object.freeze([BEAT_DOWN_OUTCOME.targetBeatenDown]),
  playerLeavesPlaceOutcomeIds: Object.freeze([
    BEAT_DOWN_OUTCOME.targetEscaped,
    BEAT_DOWN_OUTCOME.ownerIncapacitated,
  ]),
  unopposedActionId: "rough-up",
  actionIds: Object.freeze(["rough-up", "attack-limb"]),
  excludedActionIds: Object.freeze([]),
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
      if (!["id", "painTarget", "escalatedPainTarget", "angerThreshold"].includes(key)) {
        fail(`config.goal.${key} is not supported by beat-down`);
      }
    }
    for (const key of ["painTarget", "escalatedPainTarget", "angerThreshold"]) {
      if (config[key] === undefined) continue;
      if (!Number.isFinite(config[key]) || config[key] < 1 || config[key] > 100) {
        fail(`config.goal.${key} must be a number from 1 through 100`);
      }
    }
    if (config.painTarget === 100) {
      fail("config.goal.painTarget must leave room for escalation");
    }
    if (config.escalatedPainTarget !== undefined
      && config.escalatedPainTarget <= (config.painTarget ?? 50)) {
      fail("config.goal.escalatedPainTarget must exceed config.goal.painTarget");
    }
  },

  create({ game, config }) {
    const resolve = Number(game.player.getSkillValue("resolve")) || 0;
    const calmPainThreshold = config.painTarget ?? 50;
    const escalatedPainThreshold = config.escalatedPainTarget
      ?? Math.min(100, Math.max(calmPainThreshold + 1, calculatePainTolerance(resolve)));
    return {
      id: BEAT_DOWN_OBJECTIVE_ID,
      stage: "restrained",
      painThreshold: calmPainThreshold,
      calmPainThreshold,
      escalatedPainThreshold,
      angerThreshold: config.angerThreshold ?? 45,
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
      [
        "id",
        "ownerId",
        "targetId",
        "stage",
        "painThreshold",
        "calmPainThreshold",
        "escalatedPainThreshold",
        "angerThreshold",
        "lastProgressSecond",
      ],
      "state.objective",
    );
    string(objective.stage, "state.objective.stage", new Set(["restrained", "escalated", "complete"]));
    for (const key of ["painThreshold", "calmPainThreshold", "escalatedPainThreshold", "angerThreshold"]) {
      if (!Number.isFinite(objective[key]) || objective[key] < 1 || objective[key] > 100) {
        fail(`state.objective.${key} must be a number from 1 through 100`);
      }
    }
    if (objective.escalatedPainThreshold <= objective.calmPainThreshold) {
      fail("state.objective.escalatedPainThreshold must exceed calmPainThreshold");
    }
    if (objective.stage === "restrained" && objective.painThreshold !== objective.calmPainThreshold) {
      fail("a restrained beat-down must use its calm pain threshold");
    }
    if (objective.stage === "escalated" && objective.painThreshold !== objective.escalatedPainThreshold) {
      fail("an escalated beat-down must use its escalated pain threshold");
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

  syncStage(context, { events = [] } = {}) {
    const { state } = context;
    const objective = state.objective;
    if (state.phase !== "active" || objective.stage !== "restrained") return;
    const ownerId = goalOwnerId(state);
    if (state.participants[ownerId].anger < objective.angerThreshold) return;
    objective.stage = "escalated";
    objective.painThreshold = objective.escalatedPainThreshold;
    events.push({
      type: "beat-down.escalated",
      actorId: ownerId,
      targetId: goalTargetId(state),
      anger: state.participants[ownerId].anger,
      painThreshold: objective.painThreshold,
    });
  },

  recordProgress(context) {
    context.state.objective.lastProgressSecond = context.state.elapsedSeconds;
  },

  recordControlFailure() {},

  ai: Object.freeze({
    actionUtility(instance) {
      if (instance.actionId === "rough-up") {
        return { base: 12, objective: 1.6, pressure: 0.65, risk: 0.1 };
      }
      return instance.actionId === "attack-limb"
        ? { base: 11, objective: 1.5, pressure: 1.1, risk: 0.35 }
        : null;
    },

    commitment(context) {
      return {
        reward: context.state.objective.stage === "escalated" ? 8 : 0,
        failedAttempts: 0,
        lastProgressSecond: context.state.objective.lastProgressSecond,
      };
    },

    situationalBonuses(context, instance, { tags }) {
      const result = { objective: 0, control: 0, pressure: 0, safety: 0, escape: 0 };
      if (instance.actionId === "rough-up") {
        result.objective += context.state.objective.stage === "restrained" ? 75 : 10;
        result.pressure += 18;
      } else if (instance.actionId === "attack-limb") {
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
      return true;
    },

    forceRetreat() {
      return false;
    },

    pursuitPool(candidates, context, { getEncounterAction }) {
      const restrained = context.state.objective.stage === "restrained";
      return candidates.filter(({ actionId }) => {
        if (["flee", "run"].includes(actionId)) return false;
        if (!restrained) return true;
        const action = getEncounterAction(actionId);
        return !action?.tags.includes("attack") || action.severity === "light";
      });
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
    return beatDownThreatProse(context);
  },

  renderPressure(context) {
    return beatDownPressureProse(context);
  },

  playerStatMarkers(context) {
    return [{
      stat: "pain",
      value: context.state.objective.painThreshold,
      min: 0,
      max: 100,
      label: "Beaten-down threshold",
    }];
  },

  renderEvent(context, event) {
    return beatDownEventProse(context, event);
  },

  renderTerminal(context) {
    const { outcome } = context.state;
    const ownerId = goalOwnerId(context.state);
    const text = outcome?.id === BEAT_DOWN_OUTCOME.targetEscaped
      ? pickProseVariant(
        context,
        "terminal:beat-down:target-escaped",
        beatDownEscapeProseVariants(context, ownerId),
      )
      : beatDownTerminalStaticProse(context, outcome);
    return [{ type: "paragraph", text }];
  },
});
