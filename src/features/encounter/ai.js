import { BodyPartId } from "../../characters/core/body.js";
import { keyedRandom01 } from "../../shared/util/random.js";
import { getEncounterAction } from "./actions/index.js";
import { getMovementCapacity, hasUsableControl } from "./affordances.js";
import { getBodyPain, getPartCapacity, hostileHoldsOn } from "./combatants.js";
import { actionDurationSeconds, getAvailableActionInstances } from "./availability.js";
import { getMuggerPersonality } from "./personality.js";

export const RETREAT_COMMITMENT_THRESHOLD = 22;

// Design-level motives. Keeping them separate from resolution makes policy tuning inspectable.
const ACTION_UTILITY = Object.freeze({
  "cover-and-brace": { base: 8, safety: 1 },
  "strike-face": { base: 8, pressure: 1, control: 0.25, risk: 0.25 },
  "drive-body": { base: 8, pressure: 0.85, risk: 0.15 },
  "strike-holding-arm": { base: 10, pressure: 0.5, escape: 0.9, safety: 0.5, risk: 0.15 },
  headbutt: { base: 7, pressure: 1.1, control: 0.3, risk: 0.8 },
  "knee-strike": { base: 8, pressure: 0.9, control: 0.2, risk: 0.45 },
  "shove-away": { base: 9, control: 0.35, escape: 0.75, safety: 0.4, risk: 0.15 },
  "create-distance": { base: 8, escape: 1, safety: 0.6, risk: 0.1 },
  "stand-up": { base: 10, safety: 1, escape: 0.45, risk: 0.1 },
  "roll-toward": { base: 9, safety: 0.85, escape: 0.35, risk: 0.15 },
  "close-distance": { base: 8, objective: 0.5, control: 0.6, risk: 0.2 },
  run: { base: 12, escape: 1.5, safety: 1, risk: 0.1 },
  flee: { base: 12, escape: 1.5, safety: 1, risk: 0.1 },
  "grab-arm": { base: 9, objective: 0.5, control: 1, risk: 0.2 },
  "wrench-free": { base: 11, escape: 1, safety: 0.7, risk: 0.2 },
  "tighten-hold": { base: 7, objective: 0.5, control: 1, risk: 0.1 },
  "force-to-wall": { base: 8, objective: 0.8, control: 1.1, risk: 0.35 },
  "force-to-ground": { base: 8, objective: 0.8, control: 1.2, risk: 0.5 },
  "turn-target-away": { base: 7, objective: 0.8, control: 0.8, risk: 0.2 },
  "pin-limb": { base: 9, objective: 1, control: 1.3, risk: 0.2 },
  "search-money": { base: 10, objective: 2, risk: 0.6 },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function commitmentBandFor(value) {
  if (value <= RETREAT_COMMITMENT_THRESHOLD) return "ready to run";
  if (value < 40) return "hesitating";
  if (value < 65) return "frustrated but committed";
  return "confident";
}

export function getMuggerCommitmentDiagnostics(context) {
  const { state } = context;
  const mugger = state.participants.mugger;
  const personality = getMuggerPersonality(mugger.personalityId);
  const reward = state.objective.amount > 0
    ? Math.min(20, state.objective.amount) * 0.5
    : -45;
  const bestArm = Math.max(
    getPartCapacity(context, "mugger", BodyPartId.HAND_L),
    getPartCapacity(context, "mugger", BodyPartId.HAND_R),
  );
  const impairment = (1 - Math.max(bestArm, getMovementCapacity(context, "mugger"))) * 22;
  const components = {
    base: mugger.commitmentBase,
    reward,
    elapsed: -state.elapsedSeconds * personality.commitmentTimeSensitivity,
    pain: -getBodyPain(context, "mugger") * personality.commitmentPainSensitivity,
    exertion: -mugger.exertion * personality.commitmentExertionSensitivity,
    failedControl: -state.objective.failedControlAttempts * 3,
    impairment: -impairment,
  };
  const value = Math.round(clamp(Object.values(components).reduce((sum, part) => sum + part, 0), 0, 100));
  return { value, band: commitmentBandFor(value), components };
}

export const getMuggerCommitment = (context) => getMuggerCommitmentDiagnostics(context).value;
export const getCommitmentBand = (context) => commitmentBandFor(getMuggerCommitment(context));

export function intentToActionInstance(intent) {
  const { targetId, ...parameters } = intent.parameters;
  return { actorId: intent.actorId, actionId: intent.actionId, targetId, parameters };
}

function storedIntent(instance) {
  return { actorId: instance.actorId, actionId: instance.actionId, parameters: { targetId: instance.targetId, ...instance.parameters } };
}

function stableInstanceKey(instance) {
  return `${instance.actionId}:${instance.targetId}:${JSON.stringify(instance.parameters || {})}`;
}

function repetitionPenalty(history, actionId, noveltyWeight) {
  const immediate = history.at(-1) === actionId ? 12 : 0;
  return (immediate + history.filter((id) => id === actionId).length * 1.5) * noveltyWeight;
}

function situationalBonuses(context, instance) {
  const { state } = context;
  const tags = getEncounterAction(instance.actionId)?.tags || [];
  const held = hostileHoldsOn(context, "mugger").length > 0;
  const result = { objective: 0, control: 0, pressure: 0, safety: 0, escape: 0 };
  const ownHolds = state.relationships.holds.filter(({ controllerId }) => controllerId === "mugger");
  if (instance.actionId === "search-money" && hasUsableControl(context, "mugger", "player")) result.objective += 60;
  else if (state.objective.stage === "gain-control") {
    if (instance.actionId === "close-distance") result.objective += 48;
    else if (instance.actionId === "grab-arm") result.objective += ownHolds.length ? 54 : 44;
    else if (instance.actionId === "force-to-ground") {
      result.objective += state.participants.player.pose === "standing" ? 62 : 20;
    } else if (instance.actionId === "pin-limb") {
      result.objective += state.participants.player.pose === "standing" ? 8 : 48;
    } else if (instance.actionId === "force-to-wall") result.objective += 24;
    else if (instance.actionId === "turn-target-away") result.objective += 24;
    else if (instance.actionId === "tighten-hold") result.objective += 14;
    else if (tags.includes("control")) result.objective += 5;
  } else if (state.objective.stage === "access-money" && tags.includes("control")) result.objective += 6;
  if (state.objective.stage === "disengage" && ["flee", "create-distance", "shove-away"].includes(instance.actionId)) {
    result.objective += 45;
  }
  if (held) {
    const freesSelf = tags.includes("disrupt-hold") || instance.actionId === "wrench-free";
    result.escape += freesSelf ? 20 : 0;
    result.safety -= freesSelf ? 0 : 10;
  }
  if (state.objective.failedControlAttempts > 0 && tags.includes("attack")) {
    const previousAction = state.participants.mugger.actionHistory.at(-1);
    if (previousAction === "grab-arm") result.pressure += 25;
    else if (previousAction === "close-distance") result.pressure += 90;
  }
  if (tags.includes("attack")) {
    result.pressure += Math.min(35, Math.max(0, (getBodyPain(context, "player") - 40) * 1.5));
  }
  if (!held && ["create-distance", "shove-away"].includes(instance.actionId)) result.objective -= 12;
  if (getBodyPain(context, "mugger") > 35 && (tags.includes("defense") || tags.includes("movement"))) result.safety += 7;
  if (state.participants.mugger.pose !== "standing" && instance.actionId === "stand-up") result.safety += 12;
  return result;
}

export function scoreNpcActions(context) {
  syncTheftObjectiveStage(context);
  const candidates = getAvailableActionInstances(context, "mugger");
  const participant = context.state.participants.mugger;
  const personality = getMuggerPersonality(participant.personalityId);
  const commitment = getMuggerCommitmentDiagnostics(context);
  const retreatIds = new Set(["flee", "run", "create-distance", "shove-away", "stand-up", "wrench-free", "strike-holding-arm", "cover-and-brace"]);
  const retreating = commitment.value <= RETREAT_COMMITMENT_THRESHOLD;
  const retreatPool = retreating
    ? candidates.filter(({ actionId }) => retreatIds.has(actionId))
    : candidates.filter(({ actionId }) => !["flee", "run"].includes(actionId));
  const pool = retreatPool.length ? retreatPool : candidates;

  return pool.map((instance) => {
    const profile = ACTION_UTILITY[instance.actionId] || { base: 0 };
    const situation = situationalBonuses(context, instance);
    const motives = {};
    for (const motive of ["objective", "control", "pressure", "safety", "escape"]) {
      motives[motive] = ((profile[motive] || 0) * 10 + situation[motive]) * personality.weights[motive];
    }
    const duration = -actionDurationSeconds(instance) * 1.5 * personality.weights.speed;
    const exertionRisk = -(profile.risk || 0) * (10 + participant.exertion * 0.12) / Math.max(0.35, personality.weights.safety);
    const repetition = -repetitionPenalty(participant.actionHistory, instance.actionId, personality.weights.novelty);
    const variation = (keyedRandom01(
      context.game.seed,
      `encounter-utility-v1:${context.instanceKey}:${context.state.exchange}:${personality.id}:${stableInstanceKey(instance)}`,
    ) - 0.5) * 5;
    const retreatPriority = retreating ? (profile.escape || 0) * 35 : 0;
    const total = profile.base + Object.values(motives).reduce((sum, value) => sum + value, 0)
      + duration + exertionRisk + repetition + variation + retreatPriority;
    const rounded = Object.fromEntries(Object.entries({ base: profile.base, ...motives, duration, exertionRisk, repetition, variation, retreatPriority })
      .map(([key, value]) => [key, Math.round(value * 100) / 100]));
    return { instance, score: Math.round(total * 100) / 100, breakdown: rounded };
  }).sort((left, right) => right.score - left.score || stableInstanceKey(left.instance).localeCompare(stableInstanceKey(right.instance)));
}

export function getNpcDecisionDiagnostics(context) {
  const commitment = getMuggerCommitmentDiagnostics(context);
  const personality = getMuggerPersonality(context.state.participants.mugger.personalityId);
  const candidates = scoreNpcActions(context);
  return { personality, commitment, candidates, selected: candidates[0] || null };
}

export function syncTheftObjectiveStage(context) {
  const objective = context.state.objective;
  if (objective.hasLoot) objective.stage = "disengage";
  else if (hasUsableControl(context, "mugger", "player")) objective.stage = "access-money";
  else objective.stage = "gain-control";
}

export function selectNpcIntent(context) {
  const { selected } = getNpcDecisionDiagnostics(context);
  if (!selected) throw new Error("Physical encounter: the mugger has no legal action or retreat fallback");
  return storedIntent(selected.instance);
}
