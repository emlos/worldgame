import { getEncounterAction } from "./actions/index.js";
import {
  actionDurationSeconds,
  getAvailableActionInstances,
  sameActionInstance,
} from "./availability.js";
import { selectNpcIntent, intentToActionInstance, syncTheftObjectiveStage } from "./ai.js";
import {
  createCombatContext,
  holdsControlledBy,
  isEncounterIncapacitated,
  persistCombatantBodies,
  validateCombatantInvariants,
} from "./combatants.js";
import {
  ENCOUNTER_OUTCOME,
  ENCOUNTER_PHASE,
  validateEncounterState,
} from "./state.js";
import { removeHold, tickAcuteEffects } from "./actions/helpers.js";

function fail(message) {
  throw new Error(`Physical encounter: ${message}`);
}

function resolveOne(context, instance, runtime, { revalidate = true } = {}) {
  const definition = getEncounterAction(instance.actionId);
  if (!definition) fail(`unknown action '${String(instance.actionId)}'`);
  runtime.events.push({
    type: "action.attempted",
    actorId: instance.actorId,
    targetId: instance.targetId,
    actionId: instance.actionId,
  });
  const history = context.state.participants[instance.actorId].actionHistory;
  history.push(instance.actionId);
  if (history.length > 8) history.splice(0, history.length - 8);
  if (revalidate && !definition.isAvailable(context, instance)) {
    runtime.events.push({
      type: "action.spoiled",
      actorId: instance.actorId,
      actionId: instance.actionId,
    });
    if (instance.actorId === "mugger" && definition.tags.includes("control")) {
      context.state.objective.failedControlAttempts += 1;
    }
    return;
  }
  definition.resolve(context, instance, runtime);
}

function applyIncapacitatedTheft(context, runtime) {
  const objective = context.state.objective;
  const available = Math.max(0, Math.floor(context.game.player.money));
  const moneyLost = Math.min(objective.amount, available);
  if (moneyLost > 0) {
    context.game.player.adjustMoney(-moneyLost);
    objective.hasLoot = true;
    runtime.events.push({ type: "theft.completed", actorId: "mugger", amount: moneyLost });
  } else {
    runtime.events.push({ type: "theft.empty", actorId: "mugger" });
  }
  runtime.outcome = {
    id: ENCOUNTER_OUTCOME.theftPlayerIncapacitated,
    moneyLost,
  };
}

function checkPhysicalTerminalState(context, runtime) {
  if (isEncounterIncapacitated(context, "mugger")) {
    for (const hold of [...holdsControlledBy(context, "mugger")]) {
      removeHold(context, hold, runtime, "controller-incapacitated");
    }
    runtime.outcome = { id: ENCOUNTER_OUTCOME.muggerIncapacitated, moneyLost: 0 };
    return;
  }
  if (isEncounterIncapacitated(context, "player")) applyIncapacitatedTheft(context, runtime);
}

function finalizeOutcome(context, runtime) {
  const outcome = runtime.outcome;
  if (!outcome) return false;
  context.state.phase = ENCOUNTER_PHASE.terminal;
  context.state.npcIntent = null;
  context.state.objective.stage = "complete";
  context.state.outcome = {
    id: outcome.id,
    moneyLost: Number.isSafeInteger(outcome.moneyLost) ? outcome.moneyLost : 0,
  };
  runtime.events.push({
    type: "encounter.ended",
    outcomeId: context.state.outcome.id,
    moneyLost: context.state.outcome.moneyLost,
  });
  return true;
}

export function validateEncounterRuntime(context) {
  validateEncounterState(context.state);
  validateCombatantInvariants(context);
  if (context.state.phase !== ENCOUNTER_PHASE.active) return context.state;

  const playerActions = getAvailableActionInstances(context, "player");
  if (!playerActions.length) fail("active player state has no legal response");
  const npcActions = getAvailableActionInstances(context, "mugger");
  if (!npcActions.length) fail("active theft objective has no action or retreat fallback");
  const intent = intentToActionInstance(context.state.npcIntent);
  if (!npcActions.some((candidate) => sameActionInstance(candidate, intent))) {
    fail(`stored NPC intent '${intent.actionId}' is no longer legal`);
  }
  return context.state;
}

export function resolveEncounterExchange({
  game,
  state,
  instanceKey,
  playerAction,
}) {
  const next = structuredClone(state);
  const context = createCombatContext({ game, state: next, instanceKey });
  validateEncounterRuntime(context);

  const availablePlayerAction = getAvailableActionInstances(context, "player")
    .find((candidate) => sameActionInstance(candidate, playerAction));
  if (!availablePlayerAction) fail(`player action '${String(playerAction?.actionId)}' is unavailable`);
  const npcAction = intentToActionInstance(next.npcIntent);
  const playerSeconds = actionDurationSeconds(availablePlayerAction);
  const npcSeconds = actionDurationSeconds(npcAction);
  const runtime = {
    events: [],
    guarded: new Set(),
    evading: new Set(),
    outcome: null,
  };

  // Reactions chosen for this exchange influence it from the outset, even when their
  // movement completes after the opponent's action.
  for (const instance of [availablePlayerAction, npcAction]) {
    if (instance.actionId === "cover-and-brace") runtime.guarded.add(instance.actorId);
    if (instance.actionId === "create-distance") runtime.evading.add(instance.actorId);
  }

  if (playerSeconds === npcSeconds) {
    resolveOne(context, availablePlayerAction, runtime, { revalidate: false });
    resolveOne(context, npcAction, runtime, { revalidate: false });
  } else {
    const ordered = playerSeconds < npcSeconds
      ? [availablePlayerAction, npcAction]
      : [npcAction, availablePlayerAction];
    resolveOne(context, ordered[0], runtime, { revalidate: false });
    checkPhysicalTerminalState(context, runtime);
    if (!runtime.outcome) resolveOne(context, ordered[1], runtime, { revalidate: true });
    else {
      runtime.events.push({
        type: "action.spoiled",
        actorId: ordered[1].actorId,
        actionId: ordered[1].actionId,
      });
    }
  }

  tickAcuteEffects(context);
  next.elapsedSeconds += Math.max(playerSeconds, npcSeconds);
  next.exchange += 1;
  checkPhysicalTerminalState(context, runtime);
  finalizeOutcome(context, runtime);
  next.lastEvents = runtime.events.slice(-24);
  persistCombatantBodies(context);

  if (next.phase === ENCOUNTER_PHASE.active) {
    syncTheftObjectiveStage(context);
    next.npcIntent = selectNpcIntent(context);
  }
  validateEncounterRuntime(context);
  return next;
}

export function encounterExchangeDurationSeconds(state, playerAction) {
  return Math.max(
    actionDurationSeconds(playerAction),
    actionDurationSeconds(intentToActionInstance(state.npcIntent)),
  );
}
