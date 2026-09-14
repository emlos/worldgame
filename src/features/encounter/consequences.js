import { PLAYER_ENERGY_DRAIN_PER_MINUTE } from "../../characters/player/stats.js";
import {
  failSave,
  requiredSaveField,
  saveFiniteNumber,
  saveRecord,
  saveString,
} from "../../shared/util/saveValidation.js";
import { controlledParticipantId } from "./roles.js";
import { requireEncounterObjective } from "./objectives/index.js";
import {
  COMBAT_SKILL_ID,
  COMBAT_SKILL_LOSS_PENALTY,
} from "./combatSkill.js";

export const POST_COMBAT_FATIGUE_DURATION_MINUTES = 30;
export const POST_COMBAT_MAX_ENERGY_DRAIN_MULTIPLIER = 3;

const STAT_PRECISION = 1_000_000;

// These costs represent sweat and contact caused by the player's own action.
// Dirt caused by the opponent or environment is accounted for from events below.
export const PLAYER_ACTION_HYGIENE_COST = Object.freeze({
  "too-tired-to-move": 0,
  "writhe-in-pain": 0,
  "surrender-money": 0,
  "scream-for-help": 0,
  "controlled-disengage": 0.04,
  "demand-money-back": 0,
  "cover-and-brace": 0.02,
  "catch-breath": 0.01,
  headbutt: 0.1,
  "knee-strike": 0.09,
  "strike-face": 0.06,
  "drive-body": 0.08,
  "shove-away": 0.07,
  "grab-arm": 0.04,
  "strike-holding-arm": 0.07,
  "wrench-free": 0.1,
  "stand-up": 0.08,
  "roll-toward": 0.25,
  "create-distance": 0.05,
  run: 0.12,
  "tighten-hold": 0.04,
  "pin-limb": 0.1,
  "force-to-ground": 0.14,
  "force-to-wall": 0.1,
  "turn-target-away": 0.06,
  "search-money": 0,
  "attack-limb": 0.08,
  flee: 0.1,
  "close-distance": 0.05,
});

function rounded(value) {
  return Math.round(value * STAT_PRECISION) / STAT_PRECISION;
}

function encounterFeatureState(game) {
  const state = game?.featureState?.encounter;
  if (!state || !Object.hasOwn(state, "postCombatFatigue")) {
    throw new Error("Physical encounter consequence state is unavailable");
  }
  return state;
}

function eventHygieneCost(event, controlledId) {
  if (event.type === "impact.landed" && event.targetId === controlledId) return 0.08;
  if (event.type === "hold.created" && event.targetId === controlledId) return 0.03;
  if (event.type === "hold.pinned" && event.targetId === controlledId) return 0.12;
  if (event.type === "support.changed"
    && event.actorId === controlledId
    && event.to === "wall") return 0.12;
  if (event.type === "pose.changed" && event.actorId === controlledId) {
    if (event.to === "kneeling") return 0.3;
    if (event.to === "supine" || event.to === "prone") return 0.75;
  }
  return 0;
}

function fatigueDrain(fatigue, minutes) {
  if (!fatigue || minutes <= 0) return { extraEnergy: 0, next: fatigue };
  const activeMinutes = Math.min(minutes, fatigue.remainingMinutes);
  const remainingFraction = (fatigue.remainingMinutes - activeMinutes)
    / fatigue.remainingMinutes;
  const startingBonus = fatigue.multiplier - 1;
  const endingBonus = startingBonus * remainingFraction;
  const averageBonus = (startingBonus + endingBonus) / 2;
  const extraEnergy = activeMinutes * PLAYER_ENERGY_DRAIN_PER_MINUTE * averageBonus;
  if (minutes >= fatigue.remainingMinutes) {
    return { extraEnergy, next: null };
  }
  return {
    extraEnergy,
    next: {
      ...fatigue,
      multiplier: rounded(1 + endingBonus),
      remainingMinutes: rounded(fatigue.remainingMinutes - minutes),
    },
  };
}

export function createEncounterFeatureState() {
  return { postCombatFatigue: null };
}

export function validateEncounterFeatureStateSave(
  data,
  { path = "save.featureState.encounter" } = {},
) {
  const state = saveRecord(data, path);
  for (const key of Object.keys(state)) {
    if (key !== "postCombatFatigue") failSave(`${path}.${key}`, "is not supported");
  }
  const fatigue = requiredSaveField(state, "postCombatFatigue", path);
  if (fatigue === null) return state;

  const record = saveRecord(fatigue, `${path}.postCombatFatigue`);
  for (const key of Object.keys(record)) {
    if (!["sourceInstanceKey", "multiplier", "remainingMinutes"].includes(key)) {
      failSave(`${path}.postCombatFatigue.${key}`, "is not supported");
    }
  }
  saveString(
    requiredSaveField(record, "sourceInstanceKey", `${path}.postCombatFatigue`),
    `${path}.postCombatFatigue.sourceInstanceKey`,
    { nonEmpty: true },
  );
  const multiplier = saveFiniteNumber(
    requiredSaveField(record, "multiplier", `${path}.postCombatFatigue`),
    `${path}.postCombatFatigue.multiplier`,
    { min: 1, max: POST_COMBAT_MAX_ENERGY_DRAIN_MULTIPLIER },
  );
  if (multiplier <= 1) failSave(`${path}.postCombatFatigue.multiplier`, "must be above 1");
  const remainingMinutes = saveFiniteNumber(
    requiredSaveField(record, "remainingMinutes", `${path}.postCombatFatigue`),
    `${path}.postCombatFatigue.remainingMinutes`,
    { min: 0, max: POST_COMBAT_FATIGUE_DURATION_MINUTES },
  );
  if (remainingMinutes <= 0) {
    failSave(`${path}.postCombatFatigue.remainingMinutes`, "must be above 0");
  }
  return state;
}

export function updatePostCombatFatigue(game, change) {
  const minutes = Number(change?.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  const state = encounterFeatureState(game);
  const fatigue = state.postCombatFatigue;
  if (!fatigue) return;
  // Settlement happens while the terminal exchange is still being processed.
  // Its time belongs to the fight, so the newly-created aftermath starts only
  // after that story is left.
  if (game.currentStory?.instanceKey === fatigue.sourceInstanceKey) return;

  const result = fatigueDrain(fatigue, minutes);
  if (change.drainPlayerEnergy && result.extraEnergy > 0) {
    const energy = game.player.adjustStat("energy", -result.extraEnergy);
    game.player.setStatValue("energy", rounded(energy));
  }
  state.postCombatFatigue = result.next;
}

export function settleEncounterConsequences(game, state, instanceKey) {
  if (state.terminalConsequencesSettled) return false;
  const controlledId = controlledParticipantId(state);
  const exertion = state.participants[controlledId].exertion;
  const featureState = encounterFeatureState(game);
  if (exertion > 0) {
    const existingBonus = Math.max(0, (featureState.postCombatFatigue?.multiplier || 1) - 1);
    const exertionBonus = (POST_COMBAT_MAX_ENERGY_DRAIN_MULTIPLIER - 1)
      * exertion / 100;
    featureState.postCombatFatigue = {
      sourceInstanceKey: String(instanceKey),
      multiplier: rounded(Math.min(
        POST_COMBAT_MAX_ENERGY_DRAIN_MULTIPLIER,
        1 + existingBonus + exertionBonus,
      )),
      remainingMinutes: POST_COMBAT_FATIGUE_DURATION_MINUTES,
    };
  }

  const lossOutcomeIds = requireEncounterObjective(state).playerLossOutcomeIds || [];
  if (lossOutcomeIds.includes(state.outcome?.id)) {
    game.player.adjustSkill(COMBAT_SKILL_ID, -COMBAT_SKILL_LOSS_PENALTY);
  }

  state.terminalConsequencesSettled = true;
  state.lastEvents.push({
    type: "consequences.settled",
    playerExertion: exertion,
    energyDrainMultiplier: featureState.postCombatFatigue?.multiplier || 1,
  });
  state.lastEvents = state.lastEvents.slice(-24);
  return true;
}

export function applyEncounterHygiene(game, state, playerActionId, events) {
  const controlledId = controlledParticipantId(state);
  const actionCost = PLAYER_ACTION_HYGIENE_COST[playerActionId];
  if (!Number.isFinite(actionCost)) {
    throw new Error(`Physical encounter hygiene cost is undefined for '${playerActionId}'`);
  }
  const eventCost = events.reduce(
    (total, event) => total + eventHygieneCost(event, controlledId),
    0,
  );
  const requested = rounded(actionCost + eventCost);
  if (requested <= 0) return 0;

  const before = game.player.getStatValue("hygiene");
  const after = game.player.adjustStat("hygiene", -requested);
  const applied = rounded(before - after);
  if (applied > 0) {
    events.push({
      type: "hygiene.lost",
      actorId: controlledId,
      actionId: playerActionId,
      actionCost,
      eventCost: rounded(eventCost),
      amount: applied,
    });
  }
  return applied;
}
