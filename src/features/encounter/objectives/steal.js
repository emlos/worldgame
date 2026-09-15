import {
  ENCOUNTER_RANGE,
  getEncounterRange,
  setEncounterRange,
} from "../state.js";
import { goalOwnerId, goalTargetId } from "../roles.js";
import { PLAYER_RESCUED_OUTCOME_ID } from "../outcomes.js";
import {
  stealEventProse,
  stealMuggerFledProseVariants,
  stealPlayerEscapeProseVariants,
  stealPressureProse,
  stealSurrenderProseVariants,
  stealTerminalStaticProse,
  stealThreatProse,
} from "../proseData.js";
import { pickProseVariant } from "../proseVariants.js";

export const STEAL_MONEY_OBJECTIVE_ID = "steal-money";
export const STEAL_MONEY_OUTCOME = Object.freeze({
  playerRescued: PLAYER_RESCUED_OUTCOME_ID,
  playerEscaped: "player-escaped",
  playerSurrendered: "player-surrendered-money",
  muggerFled: "mugger-fled",
  muggerIncapacitated: "mugger-incapacitated",
  bothIncapacitated: "both-incapacitated",
  theftPlayerConscious: "theft-completed-player-conscious",
  theftPlayerIncapacitated: "theft-completed-player-incapacitated",
});

export function takeTheftMoney(context, events) {
  const objective = context.state.objective;
  if (objective.searched) return objective.lootAmount;

  const available = Math.max(0, Math.floor(context.game.player.money));
  const moneyTaken = Math.min(objective.amount, available);
  objective.searched = true;
  objective.lootAmount = moneyTaken;

  if (moneyTaken > 0) {
    events.push({ type: "theft.taken", actorId: goalOwnerId(context.state), amount: moneyTaken });
  } else {
    events.push({ type: "theft.empty", actorId: goalOwnerId(context.state) });
  }
  return moneyTaken;
}

export function recoverTheftMoney(context, events) {
  const objective = context.state.objective;
  const amount = objective.lootAmount;
  if (amount <= 0) return 0;

  objective.lootAmount = 0;
  events.push({ type: "theft.recovered", actorId: goalTargetId(context.state), amount });
  return amount;
}

export function outcomeForObjectiveOwnerEscape(context, events = null) {
  const objective = context.state.objective;
  const outcome = objective.searched && objective.lootAmount > 0
    ? {
      id: STEAL_MONEY_OUTCOME.theftPlayerConscious,
      moneyLost: objective.lootAmount,
    }
    : { id: STEAL_MONEY_OUTCOME.muggerFled, moneyLost: 0 };
  if (events && outcome.id === STEAL_MONEY_OUTCOME.theftPlayerConscious) {
    events.push({
      type: "theft.completed",
      actorId: goalOwnerId(context.state),
      amount: outcome.moneyLost,
    });
  }
  return outcome;
}

function releaseAllHolds(context, events) {
  for (const hold of context.state.relationships.holds) {
    events.push({
      type: "hold.broken",
      holdId: hold.id,
      controllerId: hold.controllerId,
      targetId: hold.targetId,
      targetPartId: hold.targetPartId,
      kind: hold.kind,
      reason: "encounter-ended",
    });
  }
  context.state.relationships.holds = [];
}

export function resolveSurrenderedTheft(context, events) {
  const moneyLost = takeTheftMoney(context, events);
  releaseAllHolds(context, events);
  const from = getEncounterRange(context.state);
  if (from !== ENCOUNTER_RANGE.far) {
    setEncounterRange(context.state, ENCOUNTER_RANGE.far);
    events.push({ type: "range.changed", from, to: ENCOUNTER_RANGE.far });
  }
  const ownerId = goalOwnerId(context.state);
  const targetId = goalTargetId(context.state);
  events.push({ type: "surrender.completed", actorId: targetId, amount: moneyLost });
  if (moneyLost > 0) {
    events.push({ type: "theft.completed", actorId: ownerId, amount: moneyLost });
  }
  events.push({ type: "escape.completed", actorId: ownerId });
  return {
    id: STEAL_MONEY_OUTCOME.playerSurrendered,
    moneyLost,
  };
}

/**
 * Apply the mugger's objective once the player cannot resist a search.
 * The scenario or resolver decides when that is true; this helper only applies
 * the bounded material consequence and records the mugger leaving afterward.
 */
export function resolveIncapacitatedTheft(context, events) {
  const objective = context.state.objective;
  const moneyLost = takeTheftMoney(context, events);
  releaseAllHolds(context, events);
  const from = getEncounterRange(context.state);
  if (from !== ENCOUNTER_RANGE.far) {
    setEncounterRange(context.state, ENCOUNTER_RANGE.far);
    events.push({ type: "range.changed", from, to: ENCOUNTER_RANGE.far });
  }

  if (moneyLost > 0) {
    events.push({ type: "theft.completed", actorId: goalOwnerId(context.state), amount: moneyLost });
  }
  events.push({ type: "escape.completed", actorId: goalOwnerId(context.state) });
  return {
    id: STEAL_MONEY_OUTCOME.theftPlayerIncapacitated,
    moneyLost,
  };
}

export const STEAL_MONEY_OBJECTIVE = Object.freeze({
  id: STEAL_MONEY_OBJECTIVE_ID,
  label: "Steal money",
  laboratoryConfig: Object.freeze({ id: STEAL_MONEY_OBJECTIVE_ID, maxAmount: 20 }),
  playerLossOutcomeIds: Object.freeze([
    STEAL_MONEY_OUTCOME.playerSurrendered,
    STEAL_MONEY_OUTCOME.theftPlayerConscious,
    STEAL_MONEY_OUTCOME.theftPlayerIncapacitated,
  ]),
  playerLeavesPlaceOutcomeIds: Object.freeze([
    STEAL_MONEY_OUTCOME.playerEscaped,
    STEAL_MONEY_OUTCOME.muggerIncapacitated,
  ]),
  unopposedActionId: "search-money",
  outcomePriority: Object.freeze([
    PLAYER_RESCUED_OUTCOME_ID,
    "player-surrendered-money",
    "theft-completed-player-incapacitated",
    "theft-completed-player-conscious",
    "player-escaped",
    "mugger-fled",
    "mugger-incapacitated",
  ]),

  mergeOutcomes(outcomes) {
    const ids = new Set(outcomes.map(({ id }) => id));
    if (ids.size === 1) {
      return {
        ...structuredClone(outcomes[0]),
        moneyLost: Math.max(...outcomes.map(({ moneyLost }) => moneyLost || 0)),
      };
    }
    const id = this.outcomePriority.find((candidate) => ids.has(candidate));
    const selected = outcomes.find((outcome) => outcome.id === id);
    if (!selected) {
      throw new Error("Physical encounter: theft objective cannot arbitrate simultaneous outcomes");
    }
    return structuredClone(selected);
  },

  actionIds: Object.freeze([
    "surrender-money",
    "demand-money-back",
    "search-money",
  ]),

  validateConfig(config, fail) {
    if (!Number.isSafeInteger(config.maxAmount) || config.maxAmount < 0) {
      fail("config.goal.maxAmount must be a non-negative integer");
    }
  },

  create({ game, config }) {
    const amount = Math.min(config.maxAmount, Math.max(0, Math.floor(game.player.money)));
    return {
      id: STEAL_MONEY_OBJECTIVE_ID,
      stage: "gain-control",
      amount,
      searched: false,
      lootAmount: 0,
      failedControlAttempts: 0,
      lastProgressSecond: 0,
    };
  },

  complete(context) {
    context.state.objective.stage = "complete";
  },

  validateState(state, validation) {
    const { fail, exactKeys, string, integer, boolean } = validation;
    const objective = state.objective;
    exactKeys(
      objective,
      [
        "id",
        "ownerId",
        "targetId",
        "stage",
        "amount",
        "searched",
        "lootAmount",
        "failedControlAttempts",
        "lastProgressSecond",
      ],
      "state.objective",
    );
    const stages = new Set(["gain-control", "access-money", "disengage", "complete"]);
    string(objective.stage, "state.objective.stage", stages);
    integer(objective.amount, "state.objective.amount", { min: 0 });
    boolean(objective.searched, "state.objective.searched");
    integer(objective.lootAmount, "state.objective.lootAmount", {
      min: 0,
      max: objective.amount,
    });
    if (!objective.searched && objective.lootAmount !== 0) {
      fail("state.objective.lootAmount requires a completed search");
    }
    if (state.phase === "active" && objective.stage === "disengage" && !objective.searched) {
      fail("state.objective cannot disengage before completing its search");
    }
    if (state.phase === "active" && objective.searched && objective.stage !== "disengage") {
      fail("a completed active search must be in the disengage stage");
    }
    integer(objective.failedControlAttempts, "state.objective.failedControlAttempts", { min: 0 });
    integer(objective.lastProgressSecond, "state.objective.lastProgressSecond", {
      min: 0,
      max: state.elapsedSeconds,
    });

    if (state.phase === "terminal") {
      exactKeys(state.outcome, ["id", "moneyLost"], "state.outcome");
      string(state.outcome.id, "state.outcome.id", new Set(Object.values(STEAL_MONEY_OUTCOME)));
      integer(state.outcome.moneyLost, "state.outcome.moneyLost", { min: 0 });
      if (objective.stage !== "complete") fail("a terminal encounter must have a complete objective stage");
      if ([
        STEAL_MONEY_OUTCOME.playerSurrendered,
        STEAL_MONEY_OUTCOME.theftPlayerConscious,
        STEAL_MONEY_OUTCOME.theftPlayerIncapacitated,
      ].includes(state.outcome.id)) {
        if (!objective.searched) fail("a completed theft requires a completed search");
        if (objective.lootAmount !== state.outcome.moneyLost) {
          fail("completed theft loot must match the recorded money loss");
        }
        if (state.relationships.holds.length || getEncounterRange(state) === ENCOUNTER_RANGE.clinch) {
          fail("a completed theft requires the goal owner to have escaped physical control");
        }
      }
    }
  },

  recordControlFailure(context, actorId) {
    if (actorId === goalOwnerId(context.state)) {
      context.state.objective.failedControlAttempts += 1;
    }
  },

  progress(context, { hasUsableControl }) {
    const { state } = context;
    const ownerId = goalOwnerId(state);
    const targetId = goalTargetId(state);
    const range = state.relationships.range[0].value;
    const target = state.participants[targetId];
    const holds = state.relationships.holds.filter(
      (hold) => hold.controllerId === ownerId && hold.targetId === targetId,
    );
    const rangeProgress = range === "clinch" ? 20 : range === "reach" ? 10 : 0;
    const holdProgress = Math.min(
      70,
      holds.reduce((sum, hold) => sum + hold.leverage, 0) * 0.5,
    );
    const pinProgress = holds.some(({ kind }) => kind === "limb-pin") ? 20 : 0;
    const positionProgress = (target.support === "wall" ? 15 : 0)
      + (target.pose === "standing" ? 0 : 20)
      + (state.relationships.facing.find(({ actor }) => actor === targetId)?.value === "away"
        ? 10
        : 0);
    const usableControlProgress = hasUsableControl(context, ownerId, targetId) ? 30 : 0;
    return rangeProgress + holdProgress + pinProgress + positionProgress
      + usableControlProgress + (state.objective.searched ? 200 : 0);
  },

  syncStage(context, { hasUsableControl }) {
    const objective = context.state.objective;
    if (objective.searched) objective.stage = "disengage";
    else if (hasUsableControl(
      context,
      goalOwnerId(context.state),
      goalTargetId(context.state),
    )) objective.stage = "access-money";
    else objective.stage = "gain-control";
  },

  recordProgress(context) {
    context.state.objective.lastProgressSecond = context.state.elapsedSeconds;
  },

  ai: Object.freeze({
    actionUtility(instance) {
      return instance.actionId === "search-money"
        ? { base: 10, objective: 2, risk: 0.6 }
        : null;
    },

    commitment(context) {
      const objective = context.state.objective;
      return {
        reward: objective.amount > 0 ? Math.min(20, objective.amount) * 0.5 : -45,
        failedAttempts: objective.failedControlAttempts,
        lastProgressSecond: objective.lastProgressSecond,
      };
    },

    situationalBonuses(context, instance, { tags, hasUsableControl }) {
      const state = context.state;
      const objective = state.objective;
      const ownerId = goalOwnerId(state);
      const targetId = goalTargetId(state);
      const result = { objective: 0, control: 0, pressure: 0, safety: 0, escape: 0 };
      const ownHolds = state.relationships.holds.filter(
        ({ controllerId }) => controllerId === ownerId,
      );
      if (instance.actionId === "search-money"
        && hasUsableControl(context, ownerId, targetId)) result.objective += 60;
      else if (objective.stage === "gain-control") {
        if (instance.actionId === "close-distance") result.objective += 48;
        else if (instance.actionId === "grab-arm") result.objective += ownHolds.length ? 54 : 44;
        else if (instance.actionId === "force-to-ground") {
          result.objective += state.participants[targetId].pose === "standing" ? 62 : 20;
        } else if (instance.actionId === "pin-limb") {
          result.objective += state.participants[targetId].pose === "standing" ? 8 : 48;
        } else if (instance.actionId === "force-to-wall") result.objective += 24;
        else if (instance.actionId === "turn-target-away") result.objective += 24;
        else if (instance.actionId === "tighten-hold") result.objective += 14;
        else if (tags.includes("control")) result.objective += 5;
      } else if (objective.stage === "access-money" && tags.includes("control")) {
        result.objective += 6;
      }
      if (objective.stage === "disengage" && [
        "flee",
        "create-distance",
        "shove-away",
        "wrench-free",
        "strike-holding-arm",
        "stand-up",
        "roll-toward",
      ].includes(instance.actionId)) result.objective += 60;
      if (objective.failedControlAttempts > 0 && tags.includes("attack")) {
        const previousAction = state.participants[ownerId].actionHistory.at(-1);
        if (previousAction === "grab-arm") result.pressure += 25;
        else if (previousAction === "close-distance") result.pressure += 90;
      }
      if (!context.state.relationships.holds.some(({ targetId: heldId }) => heldId === ownerId)
        && ["create-distance", "shove-away"].includes(instance.actionId)) {
        result.objective -= 12;
      }
      return result;
    },

    forceRetreat(context) {
      return context.state.objective.stage === "disengage";
    },

    allowsRetreat() {
      return true;
    },

    pursuitPool(candidates) {
      const pool = candidates.filter(({ actionId }) => !["flee", "run"].includes(actionId));
      return pool.length ? pool : candidates;
    },

    isProgressAction(tags) {
      return tags.includes("control") || tags.includes("objective") || tags.includes("theft");
    },
  }),

  take: takeTheftMoney,
  recover: recoverTheftMoney,

  mergeSimultaneous(context, branches) {
    const objective = context.state.objective;
    const baseFailedControlAttempts = objective.failedControlAttempts;
    objective.failedControlAttempts += branches.reduce(
      (sum, branch) => sum
        + branch.context.state.objective.failedControlAttempts
        - baseFailedControlAttempts,
      0,
    );
    objective.searched ||= branches.some((branch) => branch.context.state.objective.searched);
    objective.lootAmount = Math.max(
      objective.lootAmount,
      ...branches.map((branch) => branch.context.state.objective.lootAmount),
    );
    if (branches.some((branch) =>
      branch.runtime.events.some(({ type }) => type === "theft.recovered"))) {
      objective.lootAmount = 0;
    }

  },

  commitGameState(context, previousObjective) {
    const previousLoot = previousObjective?.lootAmount || 0;
    const nextLoot = context.state.objective.lootAmount;
    const newlyHeld = nextLoot - previousLoot;
    if (newlyHeld) context.game.player.adjustMoney(-newlyHeld);
  },

  outcomeForOwnerEscape: outcomeForObjectiveOwnerEscape,
  resolveSurrender: resolveSurrenderedTheft,
  resolveTargetUnable: resolveIncapacitatedTheft,
  recoverOnOwnerDefeat: recoverTheftMoney,

  outcomeForTargetEscape() {
    return { id: STEAL_MONEY_OUTCOME.playerEscaped, moneyLost: 0 };
  },

  outcomeForTargetRescue(context, events) {
    recoverTheftMoney(context, events);
    return { id: STEAL_MONEY_OUTCOME.playerRescued, moneyLost: 0 };
  },

  outcomeForOwnerDefeat(context, events) {
    recoverTheftMoney(context, events);
    return { id: STEAL_MONEY_OUTCOME.muggerIncapacitated, moneyLost: 0 };
  },

  outcomeForMutualDefeat(context, events) {
    recoverTheftMoney(context, events);
    return { id: STEAL_MONEY_OUTCOME.bothIncapacitated, moneyLost: 0 };
  },

  renderThreat(context) {
    return stealThreatProse(context);
  },

  renderPressure(context, commitment) {
    return stealPressureProse(context, commitment);
  },

  renderEvent(context, event) {
    return stealEventProse(context, event);
  },

  renderTerminal(context) {
    const { outcome } = context.state;
    const ownerId = goalOwnerId(context.state);
    const money = outcome?.moneyLost || 0;
    const unableEvent = [...context.state.lastEvents].reverse().find((event) =>
      event.type === "participant.unable-to-act"
      && event.actorId === goalTargetId(context.state));
    const unableText = unableEvent ? this.renderEvent(context, unableEvent) : null;
    let text;
    switch (outcome?.id) {
      case STEAL_MONEY_OUTCOME.playerEscaped:
        text = pickProseVariant(
          context,
          "terminal:steal:player-escaped",
          stealPlayerEscapeProseVariants(context, ownerId),
        );
        break;
      case STEAL_MONEY_OUTCOME.playerSurrendered:
        text = pickProseVariant(
          context,
          money > 0
            ? "terminal:steal:player-surrendered:money"
            : "terminal:steal:player-surrendered:empty",
          stealSurrenderProseVariants(context, ownerId, money),
        );
        break;
      case STEAL_MONEY_OUTCOME.muggerFled:
        text = [
          unableText,
          pickProseVariant(
            context,
            "terminal:steal:mugger-fled",
            stealMuggerFledProseVariants(context, ownerId),
          ),
        ].filter(Boolean).join(" ");
        break;
      default:
        text = stealTerminalStaticProse(context, outcome);
    }
    return [{ type: "paragraph", text }];
  },
});
