import { STEAL_MONEY_OBJECTIVE } from "./steal.js";

const OBJECTIVES = new Map([
  [STEAL_MONEY_OBJECTIVE.id, STEAL_MONEY_OBJECTIVE],
]);

export function getEncounterObjective(objectiveId) {
  return OBJECTIVES.get(String(objectiveId)) || null;
}

export function requireEncounterObjective(state) {
  const objective = getEncounterObjective(state?.objective?.id);
  if (!objective) {
    throw new Error(`Physical encounter: unknown objective '${String(state?.objective?.id)}'`);
  }
  return objective;
}
