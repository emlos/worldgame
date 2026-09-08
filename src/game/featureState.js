import {
  failSave,
  requiredSaveField,
  saveRecord,
} from "../shared/util/saveValidation.js";

export function initializeFeatureState(game) {
  game.featureState = Object.fromEntries(
    game.features.stateDefinitions.map((definition) => [
      definition.id,
      definition.create({ game }),
    ]),
  );
  return game.featureState;
}

export function validateFeatureStateSave(
  value,
  { features, path = "save.featureState", ...context },
) {
  const state = saveRecord(value, path);
  const definitions = new Map(
    features.stateDefinitions.map((definition) => [definition.id, definition]),
  );

  for (const id of Object.keys(state)) {
    if (!definitions.has(id)) {
      failSave(`${path}.${id}`, `references unknown feature '${id}'`);
    }
  }
  for (const definition of definitions.values()) {
    definition.validateSave(
      requiredSaveField(state, definition.id, path),
      { ...context, path: `${path}.${definition.id}` },
    );
  }
  return state;
}
