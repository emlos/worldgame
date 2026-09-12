import { ALLEY_MUGGING_SCENARIO } from "./alleyMugging.js";

const SCENARIOS = new Map([
  [ALLEY_MUGGING_SCENARIO.id, ALLEY_MUGGING_SCENARIO],
]);

export function getEncounterScenario(scenarioId) {
  return SCENARIOS.get(String(scenarioId)) || null;
}

