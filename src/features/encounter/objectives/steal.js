import {
  ENCOUNTER_OUTCOME,
  ENCOUNTER_RANGE,
  getEncounterRange,
  setEncounterRange,
} from "../state.js";

export function takeTheftMoney(context, events) {
  const objective = context.state.objective;
  if (objective.searched) return objective.lootAmount;

  const available = Math.max(0, Math.floor(context.game.player.money));
  const moneyTaken = Math.min(objective.amount, available);
  objective.searched = true;
  objective.lootAmount = moneyTaken;

  if (moneyTaken > 0) {
    context.game.player.adjustMoney(-moneyTaken);
    events.push({ type: "theft.taken", actorId: "mugger", amount: moneyTaken });
  } else {
    events.push({ type: "theft.empty", actorId: "mugger" });
  }
  return moneyTaken;
}

export function recoverTheftMoney(context, events) {
  const objective = context.state.objective;
  const amount = objective.lootAmount;
  if (amount <= 0) return 0;

  context.game.player.adjustMoney(amount);
  objective.lootAmount = 0;
  events.push({ type: "theft.recovered", actorId: "player", amount });
  return amount;
}

export function outcomeForMuggerEscape(context) {
  const objective = context.state.objective;
  return objective.searched && objective.lootAmount > 0
    ? {
      id: ENCOUNTER_OUTCOME.theftPlayerConscious,
      moneyLost: objective.lootAmount,
    }
    : { id: ENCOUNTER_OUTCOME.muggerFled, moneyLost: 0 };
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
    events.push({ type: "theft.completed", actorId: "mugger", amount: moneyLost });
  }
  events.push({ type: "escape.completed", actorId: "mugger" });
  return {
    id: ENCOUNTER_OUTCOME.theftPlayerIncapacitated,
    moneyLost,
  };
}
