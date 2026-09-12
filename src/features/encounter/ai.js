import { keyedRandom01 } from "../../shared/util/random.js";
import { getMovementCapacity, hasUsableControl, isGrounded } from "./affordances.js";
import {
  getBodyPain,
  getEffectiveHoldLeverage,
  getPartCapacity,
  holdsControlledBy,
  hostileHoldsOn,
} from "./combatants.js";
import { getAvailableActionInstances } from "./availability.js";
import { BodyPartId } from "../../characters/core/body.js";

export const RETREAT_COMMITMENT_THRESHOLD = 22;

export function getMuggerCommitment(context) {
  const state = context.state;
  const mugger = state.participants.mugger;
  const reward = Math.min(20, state.objective.amount) * 0.5;
  const bestArm = Math.max(
    getPartCapacity(context, "mugger", BodyPartId.HAND_L),
    getPartCapacity(context, "mugger", BodyPartId.HAND_R),
  );
  const impairment = (1 - Math.max(bestArm, getMovementCapacity(context, "mugger"))) * 22;
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
        - state.objective.failedControlAttempts * 4
        - impairment,
      ),
    ),
  );
}

export function getCommitmentBand(context) {
  const commitment = getMuggerCommitment(context);
  if (commitment <= RETREAT_COMMITMENT_THRESHOLD) return "ready to run";
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
    ["headbutt", "knee-strike", "strike-face", "drive-body", "shove-away", "cover-and-brace"]
      .includes(actionId));
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
    selected = firstAvailable(candidates, ["flee", "create-distance", "shove-away", "stand-up"]);
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

  const ownHolds = holdsControlledBy(context, "mugger");
  const ownHold = ownHolds[0];
  if (!selected && ownHold && isGrounded(context, "player")) {
    selected = firstAvailable(candidates, ["pin-limb", "turn-target-away", "strike-face"]);
  }
  if (!selected && ownHold && context.state.participants.player.support === "wall") {
    selected = firstAvailable(candidates, ["pin-limb", "turn-target-away"]);
  }
  if (!selected && ownHold && ownHolds.length === 1) {
    selected = byAction(candidates, "grab-arm");
  }
  if (!selected && ownHold && context.state.participants.player.pose === "standing") {
    selected = firstAvailable(candidates, ["force-to-ground", "force-to-wall"]);
  }
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
    selected = firstAvailable(candidates, ["knee-strike", "headbutt", "drive-body", "strike-face"]);
  }
  if (
    !selected
    && !context.state.relationships.holds.length
    && context.state.objective.failedControlAttempts > 0
    && context.state.exchange % 3 !== 0
  ) {
    selected = context.state.exchange % 2 === 0
      ? firstAvailable(candidates, ["knee-strike", "drive-body", "strike-face"])
      : firstAvailable(candidates, ["headbutt", "strike-face", "drive-body"]);
  }
  if (!selected && !context.state.relationships.holds.length) {
    selected = byAction(candidates, "grab-arm");
  }
  if (!selected) selected = fallbackChoice(context, candidates);
  if (!selected) throw new Error("Physical encounter: the mugger has no selectable intent");
  return storedIntent(selected);
}
