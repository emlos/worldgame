import { FIGHT_SCENARIO } from "./fight.js";

const SCENARIOS = new Map([
  [FIGHT_SCENARIO.id, FIGHT_SCENARIO],
]);

export function getEncounterScenario(scenarioId) {
  return SCENARIOS.get(String(scenarioId)) || null;
}
