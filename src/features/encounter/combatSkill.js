import {
  COMBAT_SKILL_MAX_POINTS,
  COMBAT_SKILL_RANK_COUNT,
  COMBAT_SKILL_RANK_THRESHOLDS,
} from "../../characters/player/stats.js";

export const COMBAT_SKILL_ID = "combat";
export const COMBAT_SKILL_ENCOUNTER_CAP = 10;
export const COMBAT_SKILL_PARTICIPATION_GAIN = 2;
export const COMBAT_SKILL_SUCCESS_OUTCOME_GAIN = 3;
export const COMBAT_SKILL_LOSS_OUTCOME_GAIN = 1;
export const COMBAT_SKILL_EXPERT_EXERTION_MULTIPLIER = 0.85;

const LEARNING_CATEGORIES = Object.freeze([
  "attack",
  "control",
  "escape",
  "defense",
]);

export const COMBAT_ACTION_MINIMUM_RANK = Object.freeze({
  "too-tired-to-move": 0,
  "writhe-in-pain": 0,
  "surrender-money": 0,
  "scream-for-help": 0,
  "demand-money-back": 0,
  "cover-and-brace": 0,
  "catch-breath": 0,
  "drive-body": 0,
  "rough-up": 0,
  "wrench-free": 0,
  "stand-up": 0,
  "roll-toward": 0,
  "create-distance": 0,
  run: 0,
  "search-money": 0,
  flee: 0,
  "close-distance": 0,
  "strike-face": 2,
  "strike-holding-arm": 1,
  "shove-away": 1,
  "grab-arm": 2,
  "tighten-hold": 2,
  "force-to-wall": 2,
  "attack-limb": 2,
  headbutt: 3,
  "knee-strike": 3,
  "controlled-disengage": 3,
  "force-to-ground": 3,
  "turn-target-away": 3,
  "pin-limb": 3,
});

export function combatSkillProgress(value) {
  const numeric = Number(value);
  const total = Number.isFinite(numeric)
    ? Math.min(COMBAT_SKILL_MAX_POINTS, Math.max(0, numeric))
    : 0;
  let rank = 0;
  for (let index = 1; index < COMBAT_SKILL_RANK_THRESHOLDS.length; index += 1) {
    if (total < COMBAT_SKILL_RANK_THRESHOLDS[index]) break;
    rank = index;
  }
  const rankStart = COMBAT_SKILL_RANK_THRESHOLDS[rank];
  const rankEnd = rank === COMBAT_SKILL_RANK_COUNT - 1
    ? COMBAT_SKILL_MAX_POINTS
    : COMBAT_SKILL_RANK_THRESHOLDS[rank + 1];
  return {
    rank,
    points: total - rankStart,
    pointsForRank: rankEnd - rankStart,
    total,
  };
}

export function getPlayerCombatRank(player) {
  return combatSkillProgress(player?.getSkillValue(COMBAT_SKILL_ID)).rank;
}

export function minimumCombatRankForAction(actionId) {
  const id = String(actionId);
  if (!Object.hasOwn(COMBAT_ACTION_MINIMUM_RANK, id)) {
    throw new Error(`Combat action '${id}' has no configured minimum rank`);
  }
  return COMBAT_ACTION_MINIMUM_RANK[id];
}

export function isCombatActionUnlocked(player, actionId) {
  return getPlayerCombatRank(player) >= minimumCombatRankForAction(actionId);
}

export function successfulCombatLearningAction(action, controlledId, events) {
  const tags = new Set(action?.tags || []);
  if (action?.id === "surrender-money") return false;
  if (!LEARNING_CATEGORIES.some((category) => tags.has(category))) return false;
  if (events.some((event) =>
    ["action.failed", "action.spoiled"].includes(event.type)
      && event.actorId === controlledId
      && event.actionId === action.id)) return false;
  if (action.id === "grab-arm" && events.some((event) =>
    event.type === "hold.priority-resolved" && event.winnerId !== controlledId)) return false;
  if (tags.has("impact")) {
    return events.some((event) =>
      event.type === "impact.landed"
        && event.actorId === controlledId
        && event.targetId !== controlledId);
  }
  if (tags.has("escape")) {
    return events.some((event) =>
      ["range.changed", "escape.completed", "help.heard", "hold.broken"].includes(event.type));
  }
  return events.some((event) =>
    event.type === "action.attempted"
      && event.actorId === controlledId
      && event.actionId === action.id);
}

function learningCategory(action) {
  const tags = new Set(action?.tags || []);
  if (tags.has("impact")) return "attack";
  if (tags.has("control") || tags.has("hold")) return "control";
  if (tags.has("escape")) return "escape";
  if (tags.has("defense")) return "defense";
  return null;
}

function awardCombatPoints(player, learning, requested, source) {
  const remaining = Math.max(0, COMBAT_SKILL_ENCOUNTER_CAP - learning.pointsAwarded);
  const amount = Math.min(remaining, requested);
  if (amount <= 0) return 0;
  const before = player.getSkillValue(COMBAT_SKILL_ID);
  const after = player.adjustSkill(COMBAT_SKILL_ID, amount);
  const applied = after - before;
  learning.pointsAwarded += applied;
  learning.breakdown[source] += applied;
  return applied;
}

export function createCombatLearningState(player) {
  return {
    startingTotal: player.getSkillValue(COMBAT_SKILL_ID),
    pointsAwarded: 0,
    successfulCategories: [],
    difficultyBonus: 0,
    breakdown: {
      practice: 0,
      participation: 0,
      outcome: 0,
      difficulty: 0,
    },
  };
}

export function combatDifficultyBonus(context, controlledId, opponentId) {
  const stats = ["strength", "endurance", "fitness", "resolve"];
  const average = (actorId) => stats.reduce(
    (total, stat) => total + Number(context.combatants[actorId].stat(stat) || 0),
    0,
  ) / stats.length;
  const difference = average(opponentId) - average(controlledId);
  if (difference >= 3) return 2;
  if (difference >= 1) return 1;
  return 0;
}

export function awardCombatSkillForExchange(player, learning, action, controlledId, events) {
  if (!successfulCombatLearningAction(action, controlledId, events)) return 0;
  const category = learningCategory(action);
  if (!category || learning.successfulCategories.includes(category)) return 0;
  learning.successfulCategories.push(category);
  return awardCombatPoints(player, learning, 1, "practice");
}

export function settleCombatSkillProgress(player, state, playerLossOutcomeIds) {
  const learning = state.combatLearning;
  if (state.exchange <= 0) return 0;
  const before = learning.pointsAwarded;
  awardCombatPoints(player, learning, COMBAT_SKILL_PARTICIPATION_GAIN, "participation");
  const isLoss = playerLossOutcomeIds.includes(state.outcome?.id)
    || String(state.outcome?.id).includes("both-incapacitated");
  awardCombatPoints(
    player,
    learning,
    isLoss ? COMBAT_SKILL_LOSS_OUTCOME_GAIN : COMBAT_SKILL_SUCCESS_OUTCOME_GAIN,
    "outcome",
  );
  awardCombatPoints(player, learning, learning.difficultyBonus, "difficulty");
  return learning.pointsAwarded - before;
}

export function combatSkillRewardSummary(state) {
  const learning = state.combatLearning;
  if (!learning || learning.pointsAwarded <= 0) return "";
  const before = combatSkillProgress(learning.startingTotal);
  const after = combatSkillProgress(learning.startingTotal + learning.pointsAwarded);
  const rankText = after.rank > before.rank ? ` You reached Combat rank ${after.rank}.` : "";
  return `Combat experience: +${learning.pointsAwarded}.${rankText}`;
}
