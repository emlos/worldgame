import { keyedRandom01 } from "../../shared/util/random.js";
import { hasUsableControl } from "./affordances.js";
import {
  getBodyPain,
  getEffectiveHoldLeverage,
  holdsControlledBy,
  hostileHoldsOn,
} from "./combatants.js";
import { getAvailableActionInstances } from "./availability.js";

export const RETREAT_COMMITMENT_THRESHOLD = 22;

export function getMuggerCommitment(context) {
  const state = context.state;
  const mugger = state.participants.mugger;
  const reward = Math.min(20, state.objective.amount) * 0.5;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        mugger.commitmentBase
        + reward
        - state.elapsedSeconds * 0.8
        - getBodyPain(context, "mugger") * 0.8
        - mugger.exertion * 0.35
        - state.objective.failedControlAttempts * 8,
      ),
    ),
  );
}

export function getCommitmentBand(context) {
  const commitment = getMuggerCommitment(context);
  if (commitment <= RETREAT_COMMITMENT_THRESHOLD) return "looking for a way out";
  if (commitment < 40) return "hesitating";
  if (commitment < 65) return "frustrated but committed";
  return "confident";
}

export function intentToActionInstance(intent) {
  const { targetId, ...parameters } = intent.parameters;
  return {
    actorId: intent.actorId,
    actionId: intent.actionId,
    targetId,
    parameters,
  };
}

function storedIntent(instance) {
  return {
    actorId: instance.actorId,
    actionId: instance.actionId,
    parameters: { targetId: instance.targetId, ...instance.parameters },
  };
}

function byAction(candidates, actionId) {
  return candidates.find((candidate) => candidate.actionId === actionId) || null;
}

function firstAvailable(candidates, actionIds) {
  for (const actionId of actionIds) {
    const candidate = byAction(candidates, actionId);
    if (candidate) return candidate;
  }
  return null;
}

function fallbackChoice(context, candidates) {
  const preferred = candidates.filter(({ actionId }) =>
    ["strike-face", "drive-body", "shove-away", "cover-and-brace"].includes(actionId));
  const pool = preferred.length ? preferred : candidates;
  const roll = keyedRandom01(
    context.game.seed,
    `encounter-intent-v1:${context.instanceKey}:${context.state.exchange}`,
  );
  return pool[Math.floor(roll * pool.length)] || null;
}

export function syncTheftObjectiveStage(context) {
  const objective = context.state.objective;
  if (objective.hasLoot) objective.stage = "disengage";
  else if (hasUsableControl(context, "mugger", "player")) objective.stage = "access-money";
  else objective.stage = "gain-control";
}

export function selectNpcIntent(context) {
  syncTheftObjectiveStage(context);
  const candidates = getAvailableActionInstances(context, "mugger");
  if (!candidates.length) {
    throw new Error("Physical encounter: the mugger has no legal action or retreat fallback");
  }

  let selected = null;
  if (getMuggerCommitment(context) <= RETREAT_COMMITMENT_THRESHOLD) {
    selected = firstAvailable(candidates, ["flee", "create-distance", "shove-away"]);
  }

  if (!selected && hasUsableControl(context, "mugger", "player")) {
    selected = byAction(candidates, "search-money");
  }

  if (!selected) {
    const hostileHold = hostileHoldsOn(context, "mugger")[0];
    if (hostileHold) {
      selected = firstAvailable(candidates, ["wrench-free", "strike-holding-arm", "shove-away"]);
    }
  }

  if (!selected) selected = byAction(candidates, "close-distance");

  const ownHold = holdsControlledBy(context, "mugger")[0];
  if (!selected && ownHold && getEffectiveHoldLeverage(context, ownHold) < 48) {
    selected = byAction(candidates, "tighten-hold");
  }
  if (
    !selected
    && ownHold
    && context.state.participants.player.support === "free"
    && context.state.objective.failedControlAttempts > 0
    && context.state.exchange % 2 === 0
  ) {
    selected = firstAvailable(candidates, ["drive-body", "strike-face"]);
  }
  if (!selected && ownHold && context.state.participants.player.support === "free") {
    selected = byAction(candidates, "force-to-wall");
  }
  if (
    !selected
    && !context.state.relationships.holds.length
    && context.state.objective.failedControlAttempts > 0
    && context.state.exchange % 3 !== 0
  ) {
    selected = context.state.exchange % 2 === 0
      ? firstAvailable(candidates, ["drive-body", "strike-face"])
      : firstAvailable(candidates, ["strike-face", "drive-body"]);
  }
  if (!selected && !context.state.relationships.holds.length) {
    selected = byAction(candidates, "grab-arm");
  }
  if (!selected) selected = fallbackChoice(context, candidates);
  if (!selected) throw new Error("Physical encounter: the mugger has no selectable intent");
  return storedIntent(selected);
}
