import { ageAtDate } from "../../shared/util/date.js";
import {
  failSave,
  requiredSaveField,
  requireSameSaveValue,
  saveArray,
  saveBoolean,
  saveDateMilliseconds,
  saveFiniteNumber,
  saveInteger,
  saveRecord,
  saveString,
} from "../../shared/util/saveValidation.js";
import {
  RELATIONSHIP_MAX,
  RELATIONSHIP_MIN,
} from "../core/relationship.js";
import { validateCharacterCoreSave } from "../core/saveValidation.js";
import {
  SCHOOL_SUBJECTS,
  SUBJECT_ACHIEVEMENT_MAX,
  SUBJECT_ACHIEVEMENT_MIN,
} from "../../features/school/education.js";
import { PLAYER_TEMPERATURE_VALUES, SKILLS, STATS } from "./stats.js";

const PLAYER_TEMPERATURES = new Set(PLAYER_TEMPERATURE_VALUES);

function validateRelationshipsSave(data, path, npcProfiles) {
  const seen = new Set();
  saveArray(data, path).forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 2) {
      failSave(entryPath, "must be a [npcId, relationship profile] pair");
    }
    const targetId = saveString(entry[0], `${entryPath}[0]`, { nonEmpty: true });
    if (seen.has(targetId)) {
      failSave(`${entryPath}[0]`, `duplicates relationship '${targetId}'`);
    }
    const definition = npcProfiles.get(targetId);
    if (!definition) {
      failSave(`${entryPath}[0]`, `references unknown NPC '${targetId}'`);
    }
    seen.add(targetId);

    const relationship = saveRecord(entry[1], `${entryPath}[1]`);
    saveBoolean(
      requiredSaveField(relationship, "met", `${entryPath}[1]`),
      `${entryPath}[1].met`,
    );
    const meterEntries = saveArray(
      requiredSaveField(relationship, "meters", `${entryPath}[1]`),
      `${entryPath}[1].meters`,
    );
    const seenMeters = new Set();
    meterEntries.forEach((meterEntry, meterIndex) => {
      const meterPath = `${entryPath}[1].meters[${meterIndex}]`;
      if (!Array.isArray(meterEntry) || meterEntry.length !== 2) {
        failSave(meterPath, "must be a [meterId, meter state] pair");
      }
      const meterId = saveString(meterEntry[0], `${meterPath}[0]`, { nonEmpty: true });
      if (seenMeters.has(meterId)) {
        failSave(`${meterPath}[0]`, `duplicates meter '${meterId}'`);
      }
      const meterDefinition = definition.meters[meterId];
      if (!meterDefinition) {
        failSave(`${meterPath}[0]`, `references unknown meter '${targetId}.${meterId}'`);
      }
      seenMeters.add(meterId);
      const state = saveRecord(meterEntry[1], `${meterPath}[1]`);
      saveFiniteNumber(
        requiredSaveField(state, "value", `${meterPath}[1]`),
        `${meterPath}[1].value`,
        { min: RELATIONSHIP_MIN, max: RELATIONSHIP_MAX },
      );
      saveBoolean(
        requiredSaveField(state, "revealed", `${meterPath}[1]`),
        `${meterPath}[1].revealed`,
      );
    });
    for (const meterId of Object.keys(definition.meters)) {
      if (!seenMeters.has(meterId)) {
        failSave(`${entryPath}[1].meters`, `is missing meter '${targetId}.${meterId}'`);
      }
    }
  });
}

export function validatePlayerSave(data, { path = "save.player", npcProfiles, gameTime }) {
  const player = saveRecord(data, path);
  validateCharacterCoreSave(player, path);
  const storedStats = saveRecord(requiredSaveField(player, "stats", path), `${path}.stats`);
  for (const [name, definition] of Object.entries(STATS)) {
    const present = Object.prototype.hasOwnProperty.call(storedStats, name);
    if (definition.derived && present) {
      failSave(`${path}.stats.${name}`, "must not store a body-derived stat");
    }
    if (!definition.derived && !present) {
      failSave(`${path}.stats.${name}`, "is required");
    }
  }
  saveRecord(requiredSaveField(player, "appearance", path), `${path}.appearance`);
  saveString(requiredSaveField(player, "skinTone", path), `${path}.skinTone`, {
    nonEmpty: true,
  });
  saveString(requiredSaveField(player, "eyeColor", path), `${path}.eyeColor`, {
    nonEmpty: true,
  });
  saveString(requiredSaveField(player, "hairColor", path), `${path}.hairColor`, {
    nonEmpty: true,
  });
  const age = saveInteger(requiredSaveField(player, "age", path), `${path}.age`, { min: 0 });
  const birthDate = saveDateMilliseconds(
    requiredSaveField(player, "birthDate", path),
    `${path}.birthDate`,
  );
  requireSameSaveValue(
    age,
    ageAtDate(new Date(birthDate), new Date(gameTime)),
    `${path}.age`,
    "the birth date and game clock",
  );
  saveString(requiredSaveField(player, "gender", path), `${path}.gender`, {
    nonEmpty: true,
  });
  saveFiniteNumber(requiredSaveField(player, "money", path), `${path}.money`);
  const temperature = saveString(
    requiredSaveField(player, "temperature", path),
    `${path}.temperature`,
    { nonEmpty: true },
  );
  if (!PLAYER_TEMPERATURES.has(temperature)) {
    failSave(`${path}.temperature`, `has unknown comfort value '${temperature}'`);
  }
  validateRelationshipsSave(
    requiredSaveField(player, "relationships", path),
    `${path}.relationships`,
    npcProfiles,
  );

  const seenSkills = new Set();
  saveArray(requiredSaveField(player, "skills", path), `${path}.skills`).forEach(
    (entry, index) => {
      const entryPath = `${path}.skills[${index}]`;
      if (!Array.isArray(entry) || entry.length !== 2) {
        failSave(entryPath, "must be a [name, skill] pair");
      }
      const name = saveString(entry[0], `${entryPath}[0]`, { nonEmpty: true });
      if (seenSkills.has(name)) failSave(`${entryPath}[0]`, `duplicates skill '${name}'`);
      seenSkills.add(name);
      const definition = SKILLS[name];
      if (!definition) failSave(`${entryPath}[0]`, `references unknown skill '${name}'`);
      saveFiniteNumber(entry[1], `${entryPath}[1]`, {
        min: definition.min,
        max: definition.max,
      });
    },
  );
  for (const name of Object.keys(SKILLS)) {
    if (!seenSkills.has(name)) {
      failSave(`${path}.skills`, `is missing registered skill '${name}'`);
    }
  }

  const education = saveRecord(
    requiredSaveField(player, "education", path),
    `${path}.education`,
  );
  const subjects = saveRecord(
    requiredSaveField(education, "subjects", `${path}.education`),
    `${path}.education.subjects`,
  );
  for (const id of Object.keys(subjects)) {
    if (!SCHOOL_SUBJECTS[id]) {
      failSave(`${path}.education.subjects.${id}`, `references unknown school subject '${id}'`);
    }
  }
  for (const id of Object.keys(SCHOOL_SUBJECTS)) {
    const subjectPath = `${path}.education.subjects.${id}`;
    const subject = saveRecord(
      requiredSaveField(subjects, id, `${path}.education.subjects`),
      subjectPath,
    );
    saveInteger(
      requiredSaveField(subject, "achievement", subjectPath),
      `${subjectPath}.achievement`,
      { min: SUBJECT_ACHIEVEMENT_MIN, max: SUBJECT_ACHIEVEMENT_MAX },
    );
    saveInteger(
      requiredSaveField(subject, "attendedSegments", subjectPath),
      `${subjectPath}.attendedSegments`,
      { min: 0 },
    );
  }
  return player;
}
