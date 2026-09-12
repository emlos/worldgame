import { ENCOUNTER_ACTIONS, getEncounterAction } from "./actions/index.js";

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
      if (definition.isAvailable(context, instance)) instances.push(instance);
    }
  }
  return instances;
}

const AVAILABILITY_HINTS = Object.freeze({
  "cover-and-brace": "Actor cannot begin a physical action.",
  "strike-face": "Needs a usable free hand and striking range.",
  "drive-body": "Needs a usable free hand and striking range.",
  "strike-holding-arm": "Needs a hostile arm hold that can be struck.",
  headbutt: "Needs close facing, a usable head, and a constrained target.",
  "knee-strike": "Needs a usable knee and close positional access.",
  "shove-away": "Needs a usable free hand and close enough range.",
  "grab-arm": "Needs clinch access, a free hand, and an uncontrolled target arm.",
  "wrench-free": "Requires at least one hostile hold.",
  "stand-up": "Actor must be grounded and able to support standing.",
  "roll-toward": "Actor must be grounded with room and capacity to roll.",
  "create-distance": "Needs room to disengage and no unbroken hold preventing it.",
  run: "Requires far range, standing posture, and enough movement capacity.",
  flee: "NPC retreat requires far range, standing posture, and movement capacity.",
  "tighten-hold": "Requires a currently controlled hold.",
  "pin-limb": "Requires a hold plus grounded or wall-supported control geometry.",
  "force-to-ground": "Requires a usable hold on a standing target.",
  "force-to-wall": "Requires a usable hold on a standing, unsupported target.",
  "turn-target-away": "Requires a usable hold and compatible facing.",
  "search-money": "Requires sufficient usable control over the player.",
  "close-distance": "Requires open distance and enough movement capacity.",
});

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
      const available = definition.isAvailable(context, instance);
      diagnostics.push({
        actionId: definition.id,
        available,
        instance,
        reasons: available ? [] : [AVAILABILITY_HINTS[definition.id] || "Its positional or physical prerequisites are not met."],
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
