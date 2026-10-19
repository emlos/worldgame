import { controlledParticipantId, goalOwnerId } from "./roles.js";

export const MAX_HOSTILE_COMBAT_FEAR = 38;
export const MAX_HOSTILE_COMBAT_ANGER = 30;

const PRECISION = 1_000_000;
const ESCAPE_ACTIONS = new Set([
  "create-distance",
  "run",
  "wrench-free",
  "controlled-disengage",
]);
const THREATENING_ACTIONS = new Set([
  "strike-face",
  "drive-body",
  "strike-holding-arm",
  "headbutt",
  "knee-strike",
  "rough-up",
  "attack-limb",
  "grab-arm",
  "force-to-wall",
  "force-to-ground",
]);
const FEAR_RELIEF = Object.freeze({
  "player-escaped": 0.7,
  "attacker-incapacitated": 0.6,
  "mugger-incapacitated": 0.6,
  "attacker-abandoned": 0.6,
  "mugger-fled": 0.6,
  "player-rescued": 0.5,
  "player-surrendered-money": 0.35,
  "theft-completed-player-conscious": 0.25,
  "theft-completed-player-incapacitated": 0.1,
});

const rounded = (value) => Math.round(value * PRECISION) / PRECISION;

function gainEmotion(game, emotions, stat, rawAmount, cause, events, actorId) {
  if (rawAmount <= 0 || emotions.settled) return 0;
  const gainedKey = stat === "fear" ? "fearGained" : "angerGained";
  const maximumKey = stat === "fear" ? "maximumFearGain" : "maximumAngerGain";
  const remaining = Math.max(0, emotions[maximumKey] - emotions[gainedKey]);
  const stressAmplification = 1 + game.player.getStatValue("stress") / 250;
  const requested = Math.min(
    rawAmount * emotions.contextMultiplier,
    remaining / stressAmplification,
  );
  if (requested <= 0) return 0;

  const before = game.player.getStatValue(stat);
  const after = rounded(game.player.adjustStat(stat, requested));
  game.player.setStatValue(stat, after);
  const applied = rounded(after - before);
  emotions[gainedKey] = Math.min(
    emotions[maximumKey],
    rounded(emotions[gainedKey] + applied),
  );
  if (applied > 0) {
    events.push({
      type: "emotion.changed",
      actorId,
      stat,
      from: before,
      to: after,
      amount: applied,
      cause,
    });
  }
  return applied;
}

function gainOnce(game, state, marker, stat, amount, cause, events, actorId) {
  if (state.emotions.markers.includes(marker)) return 0;
  state.emotions.markers.push(marker);
  return gainEmotion(game, state.emotions, stat, amount, cause, events, actorId);
}

/** The encounter owns only the emotion it adds, so settlement preserves earlier emotion. */
export function createCombatEmotionState(
  game,
  contextMultiplier = 1,
  events = [],
) {
  const multiplier = Number(contextMultiplier);
  const emotions = {
    contextMultiplier: multiplier,
    startingFear: game.player.getStatValue("fear"),
    startingAnger: game.player.getStatValue("anger"),
    maximumFearGain: rounded(MAX_HOSTILE_COMBAT_FEAR * multiplier),
    maximumAngerGain: rounded(MAX_HOSTILE_COMBAT_ANGER * multiplier),
    fearGained: 0,
    angerGained: 0,
    fearRefunded: 0,
    markers: [],
    settled: false,
  };
  gainEmotion(game, emotions, "fear", 4, "confrontation", events, "player");
  gainEmotion(game, emotions, "anger", 1.5, "confrontation", events, "player");
  return emotions;
}

/** Apply only the canonical merged exchange, after combat stress has settled. */
export function applyCombatEmotionsForExchange(game, state, events) {
  const playerId = controlledParticipantId(state);
  const opponentId = goalOwnerId(state);
  const changes = [];
  for (const event of events) {
    if (
      event.type === "action.attempted" &&
      event.actorId === opponentId &&
      THREATENING_ACTIONS.has(event.actionId)
    ) {
      gainOnce(
        game, state, "opponent-threatened", "fear", 1.5,
        "threatened", changes, playerId,
      );
    } else if (event.type === "impact.landed" && event.targetId === playerId) {
      const damage = Math.max(0, Number(event.damage) || 0);
      gainEmotion(
        game, state.emotions, "fear", Math.min(5, 1 + damage * 0.3),
        "hit", changes, playerId,
      );
      gainEmotion(
        game, state.emotions, "anger", Math.min(3, 0.5 + damage * 0.25),
        "hit", changes, playerId,
      );
    } else if (event.type === "hold.created" && event.targetId === playerId) {
      gainOnce(game, state, "held", "fear", 1.5, "held", changes, playerId);
    } else if (event.type === "hold.pinned" && event.targetId === playerId) {
      gainOnce(game, state, "pinned", "fear", 3.5, "pinned", changes, playerId);
    } else if (
      event.type === "support.changed" &&
      event.actorId === playerId && event.to === "wall"
    ) {
      gainOnce(game, state, "forced-to-wall", "fear", 1.5, "cornered", changes, playerId);
    } else if (
      event.type === "pose.changed" &&
      event.actorId === playerId && event.to !== "standing"
    ) {
      gainOnce(game, state, "forced-down", "fear", 1.5, "forced-down", changes, playerId);
    } else if (
      event.type === "action.failed" &&
      event.actorId === playerId &&
      ESCAPE_ACTIONS.has(event.actionId)
    ) {
      gainOnce(game, state, "failed-escape", "fear", 2.5, "failed-escape", changes, playerId);
    } else if (
      event.type === "participant.unable-to-act" &&
      event.actorId === playerId
    ) {
      gainOnce(game, state, "helpless", "fear", 3, "helpless", changes, playerId);
    } else if (
      event.type === "anger.changed" &&
      event.actorId === opponentId &&
      event.from < 45 && event.to >= 45
    ) {
      gainOnce(game, state, "attacker-escalated", "fear", 3, "attacker-escalated", changes, playerId);
    } else if (event.type === "beat-down.escalated") {
      gainOnce(game, state, "attacker-escalated", "fear", 3, "attacker-escalated", changes, playerId);
    } else if (
      event.type === "theft.taken" &&
      event.actorId === opponentId &&
      event.amount > 0
    ) {
      gainOnce(game, state, "robbed", "anger", 4, "theft", changes, playerId);
    } else if (event.type === "beat-down.completed" && event.targetId === playerId) {
      gainOnce(game, state, "beaten-down", "fear", 4, "beaten-down", changes, playerId);
      gainOnce(game, state, "hurt-by-attacker", "anger", 2, "beaten-down", changes, playerId);
    }
  }
  events.push(...changes);
  return changes;
}

export function settleCombatEmotions(game, state) {
  const emotions = state.emotions;
  if (emotions.settled) return false;
  const reliefRate = FEAR_RELIEF[state.outcome?.id] || 0;
  const refundable = Math.max(0, emotions.fearGained - emotions.fearRefunded);
  const aboveStartingFear = Math.max(
    0,
    game.player.getStatValue("fear") - emotions.startingFear,
  );
  const requestedRefund = Math.min(refundable * reliefRate, aboveStartingFear);
  if (requestedRefund > 0) {
    const before = game.player.getStatValue("fear");
    const after = rounded(game.player.adjustStat("fear", -requestedRefund));
    game.player.setStatValue("fear", after);
    const applied = rounded(before - after);
    emotions.fearRefunded = Math.min(
      emotions.fearGained,
      rounded(emotions.fearRefunded + applied),
    );
    if (applied > 0) {
      state.lastEvents.push({
        type: "emotion.changed",
        actorId: controlledParticipantId(state),
        stat: "fear",
        from: before,
        to: after,
        amount: -applied,
        cause: "danger-ended",
      });
      state.lastEvents = state.lastEvents.slice(-24);
    }
  }
  emotions.settled = true;
  return true;
}
