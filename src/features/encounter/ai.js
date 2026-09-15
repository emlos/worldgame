import { BodyPartId } from "../../characters/core/body.js";
import { keyedRandom01 } from "../../shared/util/random.js";
import { getEncounterAction } from "./actions/index.js";
import { getMovementCapacity, hasUsableControl } from "./affordances.js";
import {
  getBodyPain,
  getPartCapacity,
  hostileHoldsOn,
} from "./combatants.js";
import { actionDurationSeconds, getAvailableActionInstances } from "./availability.js";
import { getActionEffortStatus } from "./effort.js";
import { getAiPersonality } from "./personality.js";
import { goalOwnerId, goalTargetId } from "./roles.js";
import { requireEncounterObjective } from "./objectives/index.js";
import { angerBandFor } from "./anger.js";

export const RETREAT_COMMITMENT_THRESHOLD = 22;
export const EXHAUSTED_RETREAT_SECONDS = 45;
export const PROLONGED_ENCOUNTER_RETREAT_SECONDS = 66;

// Design-level motives. Keeping them separate from resolution makes policy tuning inspectable.
const ACTION_UTILITY = Object.freeze({
  "cover-and-brace": { base: 8, safety: 1 },
  "catch-breath": { base: 6, safety: 1.2 },
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
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function commitmentBandFor(value) {
  if (value <= RETREAT_COMMITMENT_THRESHOLD) return "ready to run";
  if (value < 40) return "hesitating";
  if (value < 65) return "frustrated but committed";
  return "confident";
}

export function getObjectiveProgress(context) {
  return requireEncounterObjective(context.state).progress(context, { hasUsableControl });
}

export function getAiCommitmentDiagnostics(context) {
  const { state } = context;
  const ownerId = goalOwnerId(state);
  const owner = state.participants[ownerId];
  const personality = getAiPersonality(owner.controller.personalityId);
  const objective = requireEncounterObjective(state);
  const objectiveCommitment = objective.ai.commitment(context);
  const bestArm = Math.max(
    getPartCapacity(context, ownerId, BodyPartId.HAND_L),
    getPartCapacity(context, ownerId, BodyPartId.HAND_R),
  );
  const impairment = (1 - Math.max(bestArm, getMovementCapacity(context, ownerId))) * 22;
  const stalledSeconds = Math.max(
    0,
    state.elapsedSeconds - objectiveCommitment.lastProgressSecond - 8,
  );
  const pacingLimitReached = (owner.exertion >= 95
    && state.elapsedSeconds >= EXHAUSTED_RETREAT_SECONDS)
    || state.elapsedSeconds >= PROLONGED_ENCOUNTER_RETREAT_SECONDS;
  const components = {
    base: owner.controller.commitmentBase,
    reward: objectiveCommitment.reward,
    elapsed: -stalledSeconds * personality.commitmentTimeSensitivity,
    pain: -getBodyPain(context, ownerId) * personality.commitmentPainSensitivity,
    exertion: -owner.exertion * personality.commitmentExertionSensitivity,
    anger: owner.anger / 100 * personality.anger.commitmentBiasAtMax,
    failedControl: -objectiveCommitment.failedAttempts * 2,
    impairment: -impairment,
    pacingLimit: pacingLimitReached ? -100 : 0,
  };
  const beforeMinimum = Object.values(components).reduce((sum, part) => sum + part, 0);
  components.objectiveMinimum = Math.max(
    0,
    (objectiveCommitment.minimum || 0) - beforeMinimum,
  );
  const value = Math.round(clamp(Object.values(components).reduce((sum, part) => sum + part, 0), 0, 100));
  return { value, band: commitmentBandFor(value), components };
}

export const getAiCommitment = (context) => getAiCommitmentDiagnostics(context).value;
export const getCommitmentBand = (context) => commitmentBandFor(getAiCommitment(context));

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
  const ownerId = goalOwnerId(state);
  const targetId = goalTargetId(state);
  const tags = getEncounterAction(instance.actionId)?.tags || [];
  const held = hostileHoldsOn(context, ownerId).length > 0;
  const result = { objective: 0, control: 0, pressure: 0, safety: 0, escape: 0 };
  const playerHistory = state.participants[targetId].actionHistory;
  const recentPlayerActions = playerHistory.slice(-3);
  const repeatedBrace = recentPlayerActions.filter(
    (actionId) => actionId === "cover-and-brace",
  ).length >= 2;
  const repeatedRetreat = recentPlayerActions.filter(
    (actionId) => actionId === "create-distance",
  ).length >= 2;
  if (instance.actionId === "catch-breath") {
    const participant = state.participants[ownerId];
    const winded = participant.acute.find(({ id }) => id === "winded")?.severity || 0;
    const dazed = participant.acute.find(({ id }) => id === "dazed")?.severity || 0;
    result.safety += Math.max(0, participant.exertion - 55) * 1.2
      + winded * 24
      + dazed * 16;
  }
  const objectiveBonuses = requireEncounterObjective(state).ai.situationalBonuses(
    context,
    instance,
    { tags, hasUsableControl },
  );
  for (const motive of Object.keys(result)) result[motive] += objectiveBonuses[motive] || 0;
  if (held) {
    const freesSelf = tags.includes("disrupt-hold") || instance.actionId === "wrench-free";
    result.escape += freesSelf ? 20 : 0;
    result.safety -= freesSelf ? 0 : 10;
  }
  if (tags.includes("attack")) {
    result.pressure += Math.min(35, Math.max(0, (getBodyPain(context, targetId) - 40) * 1.5));
  }
  if (repeatedBrace && tags.includes("control")) {
    result.control += 18;
    if (instance.actionId === "grab-arm") result.objective += 12;
  }
  if (repeatedRetreat) {
    if (instance.actionId === "close-distance") result.objective += 15;
    if (instance.actionId === "grab-arm") result.control += 10;
  }
  if (getBodyPain(context, ownerId) > 35 && (tags.includes("defense") || tags.includes("movement"))) result.safety += 7;
  if (state.participants[ownerId].pose !== "standing" && instance.actionId === "stand-up") result.safety += 12;
  return result;
}

export function scoreAiActions(context) {
  syncObjectiveStage(context);
  const ownerId = goalOwnerId(context.state);
  const candidates = getAvailableActionInstances(context, ownerId);
  const participant = context.state.participants[ownerId];
  const personality = getAiPersonality(participant.controller.personalityId);
  const commitment = getAiCommitmentDiagnostics(context);
  const objectiveAi = requireEncounterObjective(context.state).ai;
  const retreatIds = new Set(["flee", "run", "create-distance", "shove-away", "stand-up", "wrench-free", "strike-holding-arm", "catch-breath", "cover-and-brace"]);
  const retreating = objectiveAi.allowsRetreat(context)
    && commitment.value <= RETREAT_COMMITMENT_THRESHOLD;
  let pool;
  if (objectiveAi.forceRetreat(context)) {
    const executable = candidates.filter((instance) => getActionEffortStatus(context, instance).allowed);
    const disengageCandidates = executable.length ? executable : candidates;
    const priorityBands = [
      ["flee"],
      ["create-distance"],
      ["wrench-free", "strike-holding-arm", "shove-away"],
      ["stand-up", "roll-toward"],
      ["catch-breath"],
      ["cover-and-brace"],
    ];
    pool = priorityBands
      .map((actionIds) => disengageCandidates.filter(({ actionId }) => actionIds.includes(actionId)))
      .find((matches) => matches.length) || disengageCandidates;
  } else {
    if (retreating) {
      const retreatCandidates = candidates.filter(({ actionId }) => retreatIds.has(actionId));
      const executable = retreatCandidates.filter(
        (instance) => getActionEffortStatus(context, instance).allowed,
      );
      const usableRetreats = executable.length ? executable : retreatCandidates;
      const priorityBands = [
        ["flee"],
        ["create-distance"],
        ["wrench-free", "strike-holding-arm", "shove-away"],
        ["stand-up", "roll-toward"],
        ["catch-breath"],
        ["cover-and-brace"],
      ];
      pool = priorityBands
        .map((actionIds) => usableRetreats.filter(({ actionId }) => actionIds.includes(actionId)))
        .find((matches) => matches.length)
        || (usableRetreats.length ? usableRetreats : candidates);
    } else {
      pool = objectiveAi.pursuitPool(candidates, context, { getEncounterAction });
    }
  }

  return pool.map((instance) => {
    const profile = objectiveAi.actionUtility(instance)
      || ACTION_UTILITY[instance.actionId]
      || { base: 0 };
    const situation = situationalBonuses(context, instance);
    const motives = {};
    for (const motive of ["objective", "control", "pressure", "safety", "escape"]) {
      motives[motive] = ((profile[motive] || 0) * 10 + situation[motive]) * personality.weights[motive];
    }
    const duration = -actionDurationSeconds(instance) * 1.5 * personality.weights.speed;
    const exertionRisk = -(profile.risk || 0) * (10 + participant.exertion * 0.12) / Math.max(0.35, personality.weights.safety);
    const effort = getActionEffortStatus(context, instance);
    const overextension = effort.allowed
      ? 0
      : -45
        - Math.max(0, effort.requiredReadiness - effort.readiness) * 1.5
        - Math.max(0, effort.blockers.length - 1) * 15;
    const repetition = -repetitionPenalty(participant.actionHistory, instance.actionId, personality.weights.novelty);
    const variation = (keyedRandom01(
      context.game.seed,
      `encounter-utility-v1:${context.instanceKey}:${context.state.exchange}:${personality.id}:${stableInstanceKey(instance)}`,
    ) - 0.5) * 5;
    const retreatPriority = retreating ? (profile.escape || 0) * 35 : 0;
    const action = getEncounterAction(instance.actionId);
    const severityWeight = { light: 0.45, moderate: 0.75, severe: 1 }[action?.severity] || 0;
    const angerAggression = action?.tags.includes("attack")
      ? participant.anger / 100 * personality.anger.attackBiasAtMax * severityWeight
      : 0;
    const total = profile.base + Object.values(motives).reduce((sum, value) => sum + value, 0)
      + duration + exertionRisk + overextension + repetition + variation + retreatPriority
      + angerAggression;
    const rounded = Object.fromEntries(Object.entries({ base: profile.base, ...motives, duration, exertionRisk, overextension, repetition, variation, retreatPriority, angerAggression })
      .map(([key, value]) => [key, Math.round(value * 100) / 100]));
    return { instance, score: Math.round(total * 100) / 100, breakdown: rounded };
  }).sort((left, right) => right.score - left.score || stableInstanceKey(left.instance).localeCompare(stableInstanceKey(right.instance)));
}

export function getAiDecisionDiagnostics(context) {
  const commitment = getAiCommitmentDiagnostics(context);
  const personality = getAiPersonality(
    context.state.participants[goalOwnerId(context.state)].controller.personalityId,
  );
  const candidates = scoreAiActions(context);
  const owner = context.state.participants[goalOwnerId(context.state)];
  const anger = { value: owner.anger, band: angerBandFor(owner.anger) };
  return { personality, anger, commitment, candidates, selected: candidates[0] || null };
}

export function syncObjectiveStage(context, events = []) {
  requireEncounterObjective(context.state).syncStage(context, { hasUsableControl, events });
}

export function selectAiIntent(context) {
  const { selected } = getAiDecisionDiagnostics(context);
  if (!selected) throw new Error("Physical encounter: the AI participant has no legal action or retreat fallback");
  return storedIntent(selected.instance);
}
