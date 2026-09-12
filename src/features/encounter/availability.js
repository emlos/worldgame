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

