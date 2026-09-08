import {
  failSave,
  requiredSaveField,
  saveInteger,
  saveRecord,
} from "../../shared/util/saveValidation.js";
import {
  SCHOOL_SUBJECTS,
  SUBJECT_ACHIEVEMENT_MAX,
} from "./education.js";

export function validateSchoolStateSave(data, { path = "save.featureState.school" } = {}) {
  const state = saveRecord(data, path);
  const subjects = saveRecord(
    requiredSaveField(state, "subjects", path),
    `${path}.subjects`,
  );

  for (const id of Object.keys(subjects)) {
    if (!SCHOOL_SUBJECTS[id]) {
      failSave(`${path}.subjects.${id}`, `references unknown school subject '${id}'`);
    }
  }
  for (const id of Object.keys(SCHOOL_SUBJECTS)) {
    const subjectPath = `${path}.subjects.${id}`;
    const subject = saveRecord(
      requiredSaveField(subjects, id, `${path}.subjects`),
      subjectPath,
    );
    saveInteger(
      requiredSaveField(subject, "achievement", subjectPath),
      `${subjectPath}.achievement`,
      { min: 0, max: SUBJECT_ACHIEVEMENT_MAX },
    );
    saveInteger(
      requiredSaveField(subject, "attendedSegments", subjectPath),
      `${subjectPath}.attendedSegments`,
      { min: 0 },
    );
  }
  return state;
}
