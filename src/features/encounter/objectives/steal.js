import { ENCOUNTER_OUTCOME } from "../state.js";

/**
 * Apply the mugger's objective once the player cannot resist a search.
 * The scenario or resolver decides when that is true; this helper only applies
 * the bounded material consequence and records the mugger leaving afterward.
 */
export function resolveIncapacitatedTheft(context, events) {
  const objective = context.state.objective;
  const available = Math.max(0, Math.floor(context.game.player.money));
  const moneyLost = Math.min(objective.amount, available);

  if (moneyLost > 0) {
    context.game.player.adjustMoney(-moneyLost);
    objective.hasLoot = true;
    events.push({ type: "theft.completed", actorId: "mugger", amount: moneyLost });
  } else {
    events.push({ type: "theft.empty", actorId: "mugger" });
  }

  events.push({ type: "escape.completed", actorId: "mugger" });
  return {
    id: ENCOUNTER_OUTCOME.theftPlayerIncapacitated,
    moneyLost,
  };
}
