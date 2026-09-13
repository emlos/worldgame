import { ENCOUNTER_ACTIONS, getEncounterAction } from "./actions/index.js";
import { hostileHoldsOn } from "./combatants.js";
import { effortBlockerText, getActionEffortStatus } from "./effort.js";

export const ENCOUNTER_ACTION_PURPOSES = Object.freeze([
  Object.freeze({ id: "escape", heading: "Escape" }),
  Object.freeze({ id: "break-control", heading: "Break control" }),
  Object.freeze({ id: "defend", heading: "Defend" }),
  Object.freeze({ id: "attack", heading: "Attack" }),
  Object.freeze({ id: "control", heading: "Control" }),
]);

function stableParameters(parameters) {
  return JSON.stringify(parameters || {});
}

export function sameActionInstance(left, right) {
  return left?.actionId === right?.actionId
    && left?.actorId === right?.actorId
    && left?.targetId === right?.targetId
    && stableParameters(left?.parameters) === stableParameters(right?.parameters);
}

export function getAvailableActionInstances(context, actorId) {
  const instances = [];
  for (const definition of ENCOUNTER_ACTIONS) {
    if (!definition.usableBy.includes(actorId)) continue;
    for (const instance of definition.enumerateTargets(context, actorId)) {
      if (isActionInstanceAvailable(context, instance)) instances.push(instance);
    }
  }
  return instances;
}

const AVAILABILITY_HINTS = Object.freeze({
  "surrender-money": "Available until the mugger has abandoned the theft after returning the money.",
  "controlled-disengage": "Requires both of the mugger's wrists controlled, the mugger against a wall or on the ground, and at least medium exhaustion.",
  "demand-money-back": "Requires the stolen money, both of the mugger's wrists controlled, and the mugger against a wall or on the ground.",
  "cover-and-brace": "Actor cannot begin a physical action.",
  "catch-breath": "Only useful while exerted, hurt, winded, or dazed.",
  "strike-face": "Needs a usable free hand and striking range.",
  "drive-body": "Needs a usable free hand and striking range.",
  "strike-holding-arm": "Needs a hostile arm hold that can be struck.",
  headbutt: "Needs close facing, a usable head, and a constrained target.",
  "knee-strike": "Needs a usable knee and close positional access.",
  "shove-away": "Needs a usable free hand and close enough range.",
  "grab-arm": "Needs clinch access, a free hand, and an uncontrolled target arm.",
  "wrench-free": "Requires a hostile hold on a restrained limb that can still resist.",
  "stand-up": "Actor must be grounded and able to support standing.",
  "roll-toward": "Actor must be grounded with room and capacity to roll.",
  "create-distance": "Needs room to disengage and no unbroken hold preventing it.",
  run: "Requires far range, standing posture, and enough movement capacity.",
  flee: "NPC retreat requires far range, standing posture, and movement capacity.",
  "tighten-hold": "Requires a controlled hold below maximum stored leverage.",
  "pin-limb": "Requires a hold plus grounded or wall-supported control geometry.",
  "force-to-ground": "Requires a usable hold on a standing target.",
  "force-to-wall": "Requires a usable hold on a standing, unsupported target.",
  "turn-target-away": "Requires a usable hold and compatible facing.",
  "search-money": "Requires sufficient usable control over the player.",
  "close-distance": "Requires open distance and enough movement capacity.",
});

export function isActionInstanceAvailable(context, instance) {
  const definition = getEncounterAction(instance?.actionId);
  if (!definition || !definition.usableBy.includes(instance.actorId)) return false;
  if (!definition.isAvailable(context, instance)) return false;
  // The player's list is a promise that the action is realistically executable.
  // NPC intent may overreach; resolution gives such attempts a small desperation roll.
  return instance.actorId !== "player" || getActionEffortStatus(context, instance).allowed;
}

export function getActionAvailabilityDiagnostics(context, actorId) {
  const diagnostics = [];
  for (const definition of ENCOUNTER_ACTIONS) {
    if (!definition.usableBy.includes(actorId)) continue;
    const enumerated = definition.enumerateTargets(context, actorId);
    if (!enumerated.length) {
      diagnostics.push({
        actionId: definition.id,
        available: false,
        instance: null,
        reasons: [AVAILABILITY_HINTS[definition.id] || "No legal target or source limb."],
      });
      continue;
    }
    for (const instance of enumerated) {
      const mechanicallyAvailable = definition.isAvailable(context, instance);
      const effort = mechanicallyAvailable && actorId === "player"
        ? getActionEffortStatus(context, instance)
        : null;
      const available = mechanicallyAvailable && (!effort || effort.allowed);
      diagnostics.push({
        actionId: definition.id,
        available,
        instance,
        reasons: available
          ? []
          : effort?.blockers.length
            ? effort.blockers.map(effortBlockerText)
            : [AVAILABILITY_HINTS[definition.id] || "Its positional or physical prerequisites are not met."],
      });
    }
  }
  return diagnostics;
}

export function requireAvailableAction(context, actorId, requested) {
  const available = getAvailableActionInstances(context, actorId);
  const instance = available.find((candidate) => sameActionInstance(candidate, requested));
  if (!instance) {
    throw new Error(
      `Physical encounter: action '${String(requested?.actionId)}' is unavailable for '${actorId}'`,
    );
  }
  return instance;
}

export function actionDurationSeconds(instance) {
  const definition = getEncounterAction(instance?.actionId);
  if (!definition) {
    throw new Error(`Physical encounter: unknown action '${String(instance?.actionId)}'`);
  }
  return definition.durationSeconds;
}

export function actionLabel(context, instance) {
  const definition = getEncounterAction(instance.actionId);
  if (!definition) return instance.actionId;
  return definition.label(context, instance);
}

export function getActionPurpose(context, instance) {
  const definition = getEncounterAction(instance?.actionId);
  if (!definition) {
    throw new Error(`Physical encounter: unknown action '${String(instance?.actionId)}'`);
  }
  const tags = definition.tags;
  const breakingControl = tags.includes("disrupt-hold")
    && hostileHoldsOn(context, instance.actorId).length > 0;

  if (breakingControl) return "break-control";
  if (tags.includes("escape")) return "escape";
  if (
    tags.includes("defense")
    || tags.includes("recovery")
    || definition.id === "roll-toward"
  ) {
    return "defend";
  }
  if (tags.includes("attack")) return "attack";
  if (tags.includes("control") || tags.includes("hold")) return "control";

  throw new Error(`Physical encounter: action '${definition.id}' has no player-facing purpose`);
}

export function intentLabel(context, intent) {
  const definition = getEncounterAction(intent.actionId);
  if (!definition) return intent.actionId;
  return definition.intentLabel(context, intent);
}

export function sortPlayerActions(instances) {
  return [...instances].sort((left, right) => {
    const leftDefinition = getEncounterAction(left.actionId);
    const rightDefinition = getEncounterAction(right.actionId);
    return (leftDefinition.playerOrder - rightDefinition.playerOrder)
      || left.actionId.localeCompare(right.actionId);
  });
}
