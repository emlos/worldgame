import { getActionAvailabilityDiagnostics, getAvailableActionInstances, sameActionInstance } from "./availability.js";
import { getAiDecisionDiagnostics, intentToActionInstance } from "./ai.js";
import {
  createCombatContext,
  getBalanceCapacity,
  getBodyPain,
  getBodyPerformance,
  getCombatant,
  getEffectiveHoldLeverage,
  getStat,
  getUsableHands,
  getUsableKnees,
  holdsControlledBy,
  hostileHoldsOn,
  isDazed,
  isEncounterIncapacitated,
  isOffBalance,
  isWinded,
  validateCombatantInvariants,
} from "./combatants.js";
import {
  canBeginPhysicalAction,
  canMove,
  getDisengagementHoldState,
  getMovementCapacity,
} from "./affordances.js";
import { calculatePhysicalReadiness } from "./effort.js";
import { ENCOUNTER_PHASE, validateEncounterState } from "./state.js";
import { ENCOUNTER_PHYSICAL_SYSTEM_ID } from "./system.js";
import { requireDebugPlaceByKey } from "../../game/debugCommands.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../../story/wg/runtime/sceneExposure.js";
import { controlledParticipantId, goalOwnerId, participantIds } from "./roles.js";

export const ALLEYWAY_PLACE_KEY = "alleyway";

export function teleportPlayerToAlley(game) {
  const destination = requireDebugPlaceByKey(game, ALLEYWAY_PLACE_KEY);
  game.runAction({
    label: `[Debug] Teleport player to ${destination.place.name}`,
    apply(currentGame) {
      currentGame.moveTo(destination.location.id);
      currentGame.setCurrentPlace({ placeId: destination.place.id });
    },
    after(currentGame) {
      resolveWGAutomaticScene(currentGame, WG_AUTO_TRIGGER.enterPlace);
    },
  });
  return destination;
}

function check(id, label, callback) {
  try {
    const result = callback();
    return { id, label, valid: result !== false, message: result === false ? "Check returned false." : "OK" };
  } catch (error) {
    return { id, label, valid: false, message: error.message };
  }
}

export function collectEncounterInvariantDiagnostics(context) {
  const active = context.state.phase === ENCOUNTER_PHASE.active;
  const checks = [
    check("state-schema", "Canonical state schema", () => validateEncounterState(context.state)),
    check("body-relations", "Body and relationship invariants", () => validateCombatantInvariants(context)),
  ];
  if (active) {
    const controlledId = controlledParticipantId(context.state);
    const ownerId = goalOwnerId(context.state);
    checks.push(
      check("player-affordance", "Player has a legal response", () => getAvailableActionInstances(context, controlledId).length > 0),
      check("npc-affordance", "NPC has a legal action", () => getAvailableActionInstances(context, ownerId).length > 0),
      check("intent-legal", "Telegraphed NPC intent remains legal", () => {
        const intent = intentToActionInstance(context.state.npcIntent);
        return getAvailableActionInstances(context, ownerId).some((candidate) => sameActionInstance(candidate, intent));
      }),
    );
  }
  return { valid: checks.every(({ valid }) => valid), checks };
}

const COMBAT_STAT_NAMES = Object.freeze(["strength", "endurance", "resolve", "fitness"]);

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function combatantDebugSnapshot(context, actorId) {
  const combatant = getCombatant(context, actorId);
  const controlledHolds = holdsControlledBy(context, actorId);
  const hostileHolds = hostileHoldsOn(context, actorId);
  const identity = context.state.participants[actorId].ref.type === "player"
    ? { id: actorId, title: "you", kind: "player" }
    : {
      id: combatant.actor.id,
      title: combatant.actor.title,
      kind: "temporary-actor",
      profileId: combatant.actor.profileId,
      category: combatant.actor.category,
      age: combatant.actor.age,
      gender: combatant.actor.gender,
      pronouns: structuredClone(combatant.actor.pronouns),
      tags: [...(combatant.actor.meta?.tags || [])],
    };

  return {
    identity,
    stats: Object.fromEntries(
      COMBAT_STAT_NAMES.map((name) => [name, round(getStat(context, actorId, name))]),
    ),
    participant: structuredClone(context.state.participants[actorId]),
    derived: {
      pain: round(getBodyPain(context, actorId)),
      bodyPerformance: round(getBodyPerformance(context, actorId)),
      balanceCapacity: round(getBalanceCapacity(context, actorId)),
      movementCapacity: round(getMovementCapacity(context, actorId)),
      physicalReadiness: calculatePhysicalReadiness(context, actorId),
      canBeginPhysicalAction: canBeginPhysicalAction(context, actorId),
      canMove: canMove(context, actorId),
      incapacitated: isEncounterIncapacitated(context, actorId),
      dazed: isDazed(context, actorId),
      offBalance: isOffBalance(context, actorId),
      winded: isWinded(context, actorId),
      usableHands: getUsableHands(context, actorId),
      usableKnees: getUsableKnees(context, actorId),
      disengagement: getDisengagementHoldState(context, actorId),
      controlledHolds: controlledHolds.map((hold) => ({
        id: hold.id,
        effectiveLeverage: round(getEffectiveHoldLeverage(context, hold)),
      })),
      hostileHolds: hostileHolds.map((hold) => ({
        id: hold.id,
        effectiveLeverage: round(getEffectiveHoldLeverage(context, hold)),
      })),
    },
    body: combatant.body.toJSON(),
  };
}

export function getEncounterDebugSnapshot(game) {
  const frame = game.currentStory;
  if (frame?.system?.id !== ENCOUNTER_PHYSICAL_SYSTEM_ID || !frame.system.state) return null;
  const context = createCombatContext({ game, state: frame.system.state, instanceKey: frame.instanceKey });
  const active = context.state.phase === ENCOUNTER_PHASE.active;
  const ids = participantIds(context.state);
  return {
    state: structuredClone(context.state),
    combatants: Object.fromEntries(ids.map(
      (participantId) => [participantId, combatantDebugSnapshot(context, participantId)],
    )),
    decision: active ? getAiDecisionDiagnostics(context) : null,
    availability: Object.fromEntries(ids.map(
      (participantId) => [participantId, getActionAvailabilityDiagnostics(context, participantId)],
    )),
    rolls: context.state.lastEvents.filter(({ type }) => type === "chance.rolled"),
    invariants: collectEncounterInvariantDiagnostics(context),
  };
}
