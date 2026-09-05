import {
  failSave,
  requiredSaveField,
  requireSameSaveValue,
  saveArray,
  saveDateMilliseconds,
  saveFiniteNumber,
  saveInteger,
  saveNullableString,
  saveRecord,
  saveString,
  saveUniqueStrings,
  validateJsonValue,
} from "../shared/util/saveValidation.js";
import { SCHOOL_SUBJECTS } from "../characters/player/education.js";
import { validateWGSystemState } from "./wg/runtime/storySystemRegistry.js";

function validateSchoolClassSave(value, path, gameTime) {
  const schoolClass = saveRecord(value, path);
  saveString(requiredSaveField(schoolClass, "periodId", path), `${path}.periodId`, {
    nonEmpty: true,
  });
  const subjectId = saveString(
    requiredSaveField(schoolClass, "subjectId", path),
    `${path}.subjectId`,
    { nonEmpty: true },
  );
  if (!SCHOOL_SUBJECTS[subjectId]) {
    failSave(`${path}.subjectId`, `references unknown school subject '${subjectId}'`);
  }
  const scheduledAt = saveDateMilliseconds(
    requiredSaveField(schoolClass, "scheduledAt", path),
    `${path}.scheduledAt`,
  );
  const arrivedAt = saveDateMilliseconds(
    requiredSaveField(schoolClass, "arrivedAt", path),
    `${path}.arrivedAt`,
  );
  if (scheduledAt > arrivedAt) {
    failSave(`${path}.scheduledAt`, "must not be later than arrival time");
  }
  if (arrivedAt > gameTime) {
    failSave(`${path}.arrivedAt`, "must not be later than the game clock");
  }
  saveFiniteNumber(
    requiredSaveField(schoolClass, "minutesLate", path),
    `${path}.minutesLate`,
    { min: 0 },
  );
  saveInteger(
    requiredSaveField(schoolClass, "startingSegment", path),
    `${path}.startingSegment`,
    { min: 1 },
  );
  return schoolClass;
}

function validateCurrentStorySave(value, path, gameTime) {
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
      validateWGSystemState(systemId, state);
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

  if (Object.prototype.hasOwnProperty.call(frame, "schoolClass")) {
    if (hasSystem) {
      failSave(`${path}.schoolClass`, "is not valid for system-backed scene state");
    }
    validateSchoolClassSave(frame.schoolClass, `${path}.schoolClass`, gameTime);
  }
  return frame;
}

function validateStoryContinuationsSave(value, path, gameTime) {
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

    const schoolClass = requiredSaveField(item, "schoolClass", itemPath);
    if (schoolClass !== null) {
      validateSchoolClassSave(schoolClass, `${itemPath}.schoolClass`, gameTime);
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

export function validateStorySave(save, { path = "save", gameTime }) {
  saveUniqueStrings(requiredSaveField(save, "flags", path), `${path}.flags`);
  saveUniqueStrings(requiredSaveField(save, "dailyFlags", path), `${path}.dailyFlags`, {
    nonEmpty: true,
  });
  saveRecord(requiredSaveField(save, "story", path), `${path}.story`);
  const currentStory = validateCurrentStorySave(
    requiredSaveField(save, "currentStory", path),
    `${path}.currentStory`,
    gameTime,
  );
  const storyContinuations = validateStoryContinuationsSave(
    requiredSaveField(save, "storyContinuations", path),
    `${path}.storyContinuations`,
    gameTime,
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
