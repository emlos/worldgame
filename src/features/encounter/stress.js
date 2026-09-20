import { controlledParticipantId, goalOwnerId } from "./roles.js";

export const DEFAULT_COMBAT_STRESS_MULTIPLIER = 1;
export const MAX_HOSTILE_COMBAT_STRESS = 35;

const STRESS_PRECISION = 1_000_000;
const CONDITION_STAGE_STRESS = Object.freeze([0, 1, 2, 4, 6, 8]);
const OUTCOME_RELIEF = Object.freeze({
  "player-escaped": 0.7,
  "attacker-incapacitated": 0.6,
  "mugger-incapacitated": 0.6,
  "attacker-abandoned": 0.6,
  "mugger-fled": 0.6,
  "player-rescued": 0.25,
  "both-incapacitated": 0.1,
});

function rounded(value) {
  return Math.round(value * STRESS_PRECISION) / STRESS_PRECISION;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function conditionStage(player) {
  if (player.isIncapacitated()) return 5;
  const score = player.getBodyConditionScore();
  if (score >= 90) return 0;
  if (score >= 70) return 1;
  if (score >= 45) return 2;
  if (score >= 20) return 3;
  return 4;
}

function resolveStressMultiplier(player) {
  const resolve = clamp(Number(player.getSkillValue("resolve")) || 0, 0, 10);
  return rounded(1.15 - resolve * 0.05);
}

function applyGain(game, stress, rawAmount) {
  if (rawAmount <= 0 || stress.settled) return 0;
  const remaining = Math.max(0, stress.maximumGain - stress.gained);
  const requested = Math.min(
    remaining,
    rounded(rawAmount * stress.contextMultiplier * stress.resolveMultiplier),
  );
  if (requested <= 0) return 0;
  const before = game.player.getStatValue("stress");
  const after = rounded(game.player.adjustStat("stress", requested));
  game.player.setStatValue("stress", after);
  const applied = rounded(after - before);
  stress.gained = rounded(stress.gained + applied);
  return applied;
}

function applyMarkerGain(game, stress, marker, rawAmount) {
  if (stress.markers.includes(marker)) return 0;
  stress.markers.push(marker);
  return applyGain(game, stress, rawAmount);
}

function conditionStressIncrease(fromStage, toStage) {
  let amount = 0;
  for (let stage = fromStage + 1; stage <= toStage; stage += 1) {
    amount += CONDITION_STAGE_STRESS[stage] || 0;
  }
  return amount;
}

function eventStress(game, state, events) {
  const stress = state.stress;
  const playerId = controlledParticipantId(state);
  const ownerId = goalOwnerId(state);
  let gained = 0;

  for (const event of events) {
    if (event.type === "hold.created" && event.targetId === playerId) {
      gained += applyMarkerGain(game, stress, "held", 1);
    } else if (event.type === "hold.pinned" && event.targetId === playerId) {
      gained += applyMarkerGain(game, stress, "pinned", 3);
    } else if (
      event.type === "support.changed" &&
      event.actorId === playerId &&
      event.to === "wall"
    ) {
      gained += applyMarkerGain(game, stress, "forced-to-wall", 2);
    } else if (
      event.type === "pose.changed" &&
      event.actorId === playerId &&
      event.to !== "standing"
    ) {
      gained += applyMarkerGain(game, stress, "forced-down", 2);
    } else if (
      event.type === "action.attempted" &&
      event.actorId === playerId &&
      ["too-tired-to-move", "writhe-in-pain"].includes(event.actionId)
    ) {
      gained += applyMarkerGain(game, stress, "helpless", 3);
    } else if (event.type === "action.failed" && event.actorId === playerId) {
      if (
        [
          "create-distance",
          "run",
          "wrench-free",
          "controlled-disengage",
        ].includes(event.actionId)
      ) {
        gained += applyMarkerGain(game, stress, "failed-escape", 1);
      }
    } else if (
      event.type === "anger.changed" &&
      event.actorId === ownerId &&
      event.from < 45 &&
      event.to >= 45
    ) {
      gained += applyMarkerGain(game, stress, "attacker-escalated", 2);
    }
  }
  return rounded(gained);
}

function outcomeConsequence(outcome) {
  if (!outcome) return 0;
  if (outcome.id === "player-beaten-down") return 8;
  if (outcome.id === "both-incapacitated") return 6;
  if (outcome.id === "player-rescued") return 2;
  if (
    [
      "player-surrendered-money",
      "theft-completed-player-conscious",
      "theft-completed-player-incapacitated",
    ].includes(outcome.id) &&
    outcome.moneyLost > 0
  )
    return 3;
  return 0;
}

export function createCombatStressState(
  game,
  contextMultiplier = DEFAULT_COMBAT_STRESS_MULTIPLIER,
) {
  const multiplier = Number(contextMultiplier);
  const stress = {
    contextMultiplier: multiplier,
    resolveMultiplier: resolveStressMultiplier(game.player),
    startingStress: game.player.getStatValue("stress"),
    maximumGain: rounded(MAX_HOSTILE_COMBAT_STRESS * multiplier),
    gained: 0,
    refunded: 0,
    lastPain: game.player.getBodyPain(),
    conditionStage: conditionStage(game.player),
    markers: [],
    settled: false,
  };
  applyGain(game, stress, 3);
  return stress;
}

export function applyCombatStressForExchange(game, state, events) {
  const stress = state.stress;
  const currentPain = game.player.getBodyPain();
  const painIncrease = Math.max(0, currentPain - stress.lastPain);
  const painStress = painIncrease * 0.18 * (1 + stress.lastPain / 100);
  let gained = applyGain(game, stress, painStress);

  const nextConditionStage = conditionStage(game.player);
  if (nextConditionStage > stress.conditionStage) {
    gained += applyGain(
      game,
      stress,
      conditionStressIncrease(stress.conditionStage, nextConditionStage),
    );
  }
  gained += eventStress(game, state, events);
  stress.lastPain = rounded(currentPain);
  stress.conditionStage = nextConditionStage;
  return rounded(gained);
}

export function settleCombatStress(game, state) {
  const stress = state.stress;
  if (stress.settled) return false;

  applyGain(game, stress, outcomeConsequence(state.outcome));
  const reliefRate = OUTCOME_RELIEF[state.outcome?.id] || 0;
  const refundable = Math.max(0, stress.gained - stress.refunded);
  const aboveStartingStress = Math.max(
    0,
    game.player.getStatValue("stress") - stress.startingStress,
  );
  const requestedRefund = Math.min(
    refundable * reliefRate,
    aboveStartingStress,
  );
  if (requestedRefund > 0) {
    const before = game.player.getStatValue("stress");
    const after = rounded(game.player.adjustStat("stress", -requestedRefund));
    game.player.setStatValue("stress", after);
    stress.refunded = rounded(stress.refunded + before - after);
  }
  stress.settled = true;
  return true;
}
