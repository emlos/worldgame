import {
  COMBAT_SKILL_MAX_POINTS,
  COMBAT_SKILL_POINTS_PER_RANK,
  COMBAT_SKILL_RANK_COUNT,
} from "../../characters/player/stats.js";

export const COMBAT_SKILL_ID = "combat";
export const COMBAT_SKILL_SUCCESS_GAIN = 1.5;
export const COMBAT_SKILL_LOSS_PENALTY = 1;

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
  "strike-holding-arm": 2,
  "shove-away": 2,
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
  const maximumRank = COMBAT_SKILL_RANK_COUNT - 1;
  const rank = Math.min(maximumRank, Math.floor(total / COMBAT_SKILL_POINTS_PER_RANK));
  return {
    rank,
    points: total - rank * COMBAT_SKILL_POINTS_PER_RANK,
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
  if (!tags.has("impact") && !tags.has("control") && !tags.has("hold")) return false;
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
  return events.some((event) =>
    event.type === "action.attempted"
      && event.actorId === controlledId
      && event.actionId === action.id);
}

export function awardCombatSkillForExchange(player, action, controlledId, events) {
  if (!successfulCombatLearningAction(action, controlledId, events)) return 0;
  const before = player.getSkillValue(COMBAT_SKILL_ID);
  const after = player.adjustSkill(COMBAT_SKILL_ID, COMBAT_SKILL_SUCCESS_GAIN);
  return after - before;
}
