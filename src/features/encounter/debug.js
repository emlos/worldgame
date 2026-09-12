import { getActionAvailabilityDiagnostics, getAvailableActionInstances, sameActionInstance } from "./availability.js";
import { getNpcDecisionDiagnostics, intentToActionInstance } from "./ai.js";
import { createCombatContext, validateCombatantInvariants } from "./combatants.js";
import { ENCOUNTER_PHASE, validateEncounterState } from "./state.js";
import { ENCOUNTER_PHYSICAL_SYSTEM_ID } from "./system.js";
import { requireDebugPlaceByKey } from "../../game/debugCommands.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../../story/wg/runtime/sceneExposure.js";

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
    checks.push(
      check("player-affordance", "Player has a legal response", () => getAvailableActionInstances(context, "player").length > 0),
      check("npc-affordance", "NPC has a legal action", () => getAvailableActionInstances(context, "mugger").length > 0),
      check("intent-legal", "Telegraphed NPC intent remains legal", () => {
        const intent = intentToActionInstance(context.state.npcIntent);
        return getAvailableActionInstances(context, "mugger").some((candidate) => sameActionInstance(candidate, intent));
      }),
    );
  }
  return { valid: checks.every(({ valid }) => valid), checks };
}

export function getEncounterDebugSnapshot(game) {
  const frame = game.currentStory;
  if (frame?.system?.id !== ENCOUNTER_PHYSICAL_SYSTEM_ID || !frame.system.state) return null;
  const context = createCombatContext({ game, state: frame.system.state, instanceKey: frame.instanceKey });
  const active = context.state.phase === ENCOUNTER_PHASE.active;
  return {
    state: structuredClone(context.state),
    decision: active ? getNpcDecisionDiagnostics(context) : null,
    availability: {
      player: getActionAvailabilityDiagnostics(context, "player"),
      mugger: getActionAvailabilityDiagnostics(context, "mugger"),
    },
    rolls: context.state.lastEvents.filter(({ type }) => type === "chance.rolled"),
    invariants: collectEncounterInvariantDiagnostics(context),
  };
}
