export const ENCOUNTER_RANGE = Object.freeze({
  far: "far",
  reach: "reach",
  clinch: "clinch",
});

export const ENCOUNTER_POSE = Object.freeze({
  standing: "standing",
  kneeling: "kneeling",
  supine: "supine",
  prone: "prone",
});

export const ENCOUNTER_SUPPORT = Object.freeze({
  free: "free",
  wall: "wall",
});

export const ENCOUNTER_FACING = Object.freeze({
  toward: "toward",
  away: "away",
  side: "side",
});

const RANGES = new Set(Object.values(ENCOUNTER_RANGE));
const FACINGS = new Set(Object.values(ENCOUNTER_FACING));

function fail(message) {
  throw new Error(`Physical encounter state: ${message}`);
}

export function getEncounterRange(state) {
  return state.relationships.range[0].value;
}

export function setEncounterRange(state, value) {
  if (!RANGES.has(value)) fail(`cannot set invalid range '${String(value)}'`);
  state.relationships.range[0].value = value;
}

export function getEncounterFacing(state, actorId) {
  return state.relationships.facing.find(({ actor }) => actor === actorId)?.value || null;
}

export function setEncounterFacing(state, actorId, value) {
  if (!Object.hasOwn(state.participants, actorId)) fail(`unknown facing actor '${String(actorId)}'`);
  if (!FACINGS.has(value)) fail(`cannot set invalid facing '${String(value)}'`);
  const relation = state.relationships.facing.find(({ actor }) => actor === actorId);
  if (!relation) fail(`missing facing relation for '${actorId}'`);
  relation.value = value;
}
