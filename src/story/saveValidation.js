import {
  failSave,
  requiredSaveField,
  requireSameSaveValue,
  saveArray,
  saveDateMilliseconds,
  saveInteger,
  saveNullableString,
  saveRecord,
  saveString,
  saveUniqueStrings,
  validateJsonValue,
} from "../shared/util/saveValidation.js";
import { validateWGSystemState } from "./wg/runtime/storySystemRegistry.js";
import { validateWGBehaviorState } from "./wg/runtime/storyBehaviorRegistry.js";
import { DEFAULT_FEATURE_CATALOG } from "../features/index.js";

function validateBehaviorSave(value, path, gameTime, features) {
  const frame = saveRecord(value, path);
  const id = saveString(requiredSaveField(frame, "id", path), `${path}.id`, {
    nonEmpty: true,
  });
  const state = requiredSaveField(frame, "state", path);
  validateJsonValue(state, `${path}.state`);
  try {
    validateWGBehaviorState(features, id, state, { gameTime });
  } catch (error) {
    failSave(`${path}.state`, error.message);
  }
  return frame;
}

function validateCurrentStorySave(value, path, gameTime, features) {
  if (value === null) return null;
  const frame = saveRecord(value, path);
  saveString(requiredSaveField(frame, "id", path), `${path}.id`, { nonEmpty: true });
  saveString(requiredSaveField(frame, "instanceKey", path), `${path}.instanceKey`, {
    nonEmpty: true,
  });
  const hasSystem = Object.prototype.hasOwnProperty.call(frame, "system");
  if (hasSystem) {
    if (Object.prototype.hasOwnProperty.call(frame, "passageId")) {
      failSave(`${path}.passageId`, "is not valid for system-backed scene state");
    }
    if (Object.prototype.hasOwnProperty.call(frame, "resolution")) {
      failSave(`${path}.resolution`, "is not valid for system-backed scene state");
    }
    const systemPath = `${path}.system`;
    const system = saveRecord(frame.system, systemPath);
    const systemId = saveString(
      requiredSaveField(system, "id", systemPath),
      `${systemPath}.id`,
      { nonEmpty: true },
    );
    saveInteger(
      requiredSaveField(system, "revision", systemPath),
      `${systemPath}.revision`,
      { min: 0 },
    );
    const state = requiredSaveField(system, "state", systemPath);
    validateJsonValue(state, `${systemPath}.state`);
    try {
      validateWGSystemState(systemId, state, features);
    } catch (error) {
      failSave(`${systemPath}.state`, error.message);
    }
  } else {
    saveString(requiredSaveField(frame, "passageId", path), `${path}.passageId`, {
      nonEmpty: true,
    });
  }

  if (!hasSystem) {
    const resolutionPath = `${path}.resolution`;
    const resolution = saveRecord(
      requiredSaveField(frame, "resolution", path),
      resolutionPath,
    );
    saveInteger(
      requiredSaveField(resolution, "revision", resolutionPath),
      `${resolutionPath}.revision`,
      { min: 0 },
    );
    const decisions = saveRecord(
      requiredSaveField(resolution, "decisions", resolutionPath),
      `${resolutionPath}.decisions`,
    );
    for (const [key, decision] of Object.entries(decisions)) {
      saveString(key, `${resolutionPath}.decisions key`, { nonEmpty: true });
      if (typeof decision === "number") {
        saveInteger(decision, `${resolutionPath}.decisions.${key}`, { min: -1 });
      } else if (decision !== "success" && decision !== "failure") {
        failSave(
          `${resolutionPath}.decisions.${key}`,
          "must be a branch index, 'success', or 'failure'",
        );
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(frame, "behavior")) {
    if (hasSystem) {
      failSave(`${path}.behavior`, "is not valid for system-backed scene state");
    }
    validateBehaviorSave(frame.behavior, `${path}.behavior`, gameTime, features);
  }
  return frame;
}

function validateStoryContinuationsSave(value, path, gameTime, features) {
  return saveArray(value, path).map((itemData, index) => {
    const itemPath = `${path}[${index}]`;
    const item = saveRecord(itemData, itemPath);
    const target = saveString(
      requiredSaveField(item, "target", itemPath),
      `${itemPath}.target`,
      { nonEmpty: true },
    );
    const sceneId = saveNullableString(
      requiredSaveField(item, "sceneId", itemPath),
      `${itemPath}.sceneId`,
    );
    const sourcePassageId = saveNullableString(
      requiredSaveField(item, "sourcePassageId", itemPath),
      `${itemPath}.sourcePassageId`,
    );
    saveString(requiredSaveField(item, "poolId", itemPath), `${itemPath}.poolId`, {
      nonEmpty: true,
    });
    saveString(
      requiredSaveField(item, "eventSceneId", itemPath),
      `${itemPath}.eventSceneId`,
      { nonEmpty: true },
    );
    saveString(
      requiredSaveField(item, "sourceSceneId", itemPath),
      `${itemPath}.sourceSceneId`,
      { nonEmpty: true },
    );
    saveString(
      requiredSaveField(item, "sourceChoiceId", itemPath),
      `${itemPath}.sourceChoiceId`,
      { nonEmpty: true },
    );

    if (target.startsWith(".") && (!sceneId || !sourcePassageId)) {
      failSave(itemPath, "local continuation targets require scene and source passage ids");
    }

    const behavior = requiredSaveField(item, "behavior", itemPath);
    if (behavior !== null) {
      validateBehaviorSave(behavior, `${itemPath}.behavior`, gameTime, features);
    }
    return item;
  });
}

function validateInterruptRecordSave(value, path, gameTime) {
  if (value === null) return null;
  const item = saveRecord(value, path);
  saveString(requiredSaveField(item, "sceneId", path), `${path}.sceneId`, {
    nonEmpty: true,
  });
  saveInteger(requiredSaveField(item, "priority", path), `${path}.priority`);
  const triggeredAt = saveDateMilliseconds(
    requiredSaveField(item, "triggeredAt", path),
    `${path}.triggeredAt`,
  );
  if (triggeredAt > gameTime) failSave(`${path}.triggeredAt`, "must not be in the future");
  return item;
}

function validateInterruptStateSave(value, path, gameTime) {
  const state = saveRecord(value, path);
  const active = validateInterruptRecordSave(
    requiredSaveField(state, "active", path),
    `${path}.active`,
    gameTime,
  );
  const pending = validateInterruptRecordSave(
    requiredSaveField(state, "pending", path),
    `${path}.pending`,
    gameTime,
  );
  saveUniqueStrings(
    requiredSaveField(state, "latchedSceneIds", path),
    `${path}.latchedSceneIds`,
    { nonEmpty: true },
  );
  return { state, active, pending };
}

export function validateStorySave(
  save,
  { path = "save", gameTime, features = DEFAULT_FEATURE_CATALOG },
) {
  saveUniqueStrings(requiredSaveField(save, "flags", path), `${path}.flags`);
  saveUniqueStrings(requiredSaveField(save, "dailyFlags", path), `${path}.dailyFlags`, {
    nonEmpty: true,
  });
  saveRecord(requiredSaveField(save, "story", path), `${path}.story`);
  const currentStory = validateCurrentStorySave(
    requiredSaveField(save, "currentStory", path),
    `${path}.currentStory`,
    gameTime,
    features,
  );
  const storyContinuations = validateStoryContinuationsSave(
    requiredSaveField(save, "storyContinuations", path),
    `${path}.storyContinuations`,
    gameTime,
    features,
  );
  if (storyContinuations.length && currentStory === null) {
    failSave(`${path}.storyContinuations`, "requires an active current story");
  }
  const storyRevision = saveInteger(
    requiredSaveField(save, "storyRevision", path),
    `${path}.storyRevision`,
    { min: 0 },
  );
  if (currentStory?.resolution) {
    requireSameSaveValue(
      currentStory.resolution.revision,
      storyRevision,
      `${path}.currentStory.resolution.revision`,
      `${path}.storyRevision`,
    );
  }

  const { active, pending } = validateInterruptStateSave(
    requiredSaveField(save, "interruptState", path),
    `${path}.interruptState`,
    gameTime,
  );
  if (active !== null && pending !== null) {
    failSave(`${path}.interruptState`, "cannot contain active and pending interrupts together");
  }
  if (active !== null && currentStory?.id !== active.sceneId) {
    failSave(`${path}.interruptState.active.sceneId`, "must match the active story");
  }
  if (pending !== null && currentStory === null) {
    failSave(`${path}.interruptState.pending`, "requires an active scene");
  }
  return { currentStory, storyContinuations, storyRevision };
}
