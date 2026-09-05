import {
  failSave,
  requiredSaveField,
  requireSameSaveValue,
  saveArray,
  saveBoolean,
  saveFiniteNumber,
  saveRecord,
  saveString,
  saveUniqueStrings,
} from "../../shared/util/saveValidation.js";
import {
  RELATIONSHIP_MAX,
  RELATIONSHIP_MIN,
} from "./relationship.js";

export function validateStatsSave(data, path) {
  const stats = saveRecord(data, path);
  for (const [name, statData] of Object.entries(stats)) {
    saveString(name, `${path} key`, { nonEmpty: true });
    const statPath = `${path}.${name}`;
    const stat = saveRecord(statData, statPath);
    saveFiniteNumber(requiredSaveField(stat, "base", statPath), `${statPath}.base`);
    saveArray(requiredSaveField(stat, "add", statPath), `${statPath}.add`).forEach(
      (value, index) => saveFiniteNumber(value, `${statPath}.add[${index}]`),
    );
    saveArray(requiredSaveField(stat, "mult", statPath), `${statPath}.mult`).forEach(
      (value, index) => saveFiniteNumber(value, `${statPath}.mult[${index}]`),
    );
  }
  return stats;
}

export function validateBodySave(data, path) {
  const body = saveRecord(data, path);
  const seen = new Set();
  saveArray(requiredSaveField(body, "parts", path), `${path}.parts`).forEach(
    (partData, index) => {
      const partPath = `${path}.parts[${index}]`;
      const part = saveRecord(partData, partPath);
      const id = saveString(requiredSaveField(part, "id", partPath), `${partPath}.id`, {
        nonEmpty: true,
      });
      if (seen.has(id)) failSave(`${partPath}.id`, `duplicates body part '${id}'`);
      seen.add(id);

      saveString(
        requiredSaveField(part, "displayName", partPath),
        `${partPath}.displayName`,
        { nonEmpty: true },
      );
      saveString(requiredSaveField(part, "region", partPath), `${partPath}.region`, {
        nonEmpty: true,
      });
      const maxHealth = saveFiniteNumber(
        requiredSaveField(part, "maxHealth", partPath),
        `${partPath}.maxHealth`,
        { min: Number.MIN_VALUE },
      );
      saveFiniteNumber(requiredSaveField(part, "health", partPath), `${partPath}.health`, {
        min: 0,
        max: maxHealth,
      });
      saveBoolean(requiredSaveField(part, "canBreak", partPath), `${partPath}.canBreak`);
      saveFiniteNumber(
        requiredSaveField(part, "painMultiplier", partPath),
        `${partPath}.painMultiplier`,
        { min: 0 },
      );
      saveFiniteNumber(requiredSaveField(part, "pain", partPath), `${partPath}.pain`, {
        min: 0,
        max: 100,
      });
      saveUniqueStrings(
        requiredSaveField(part, "conditions", partPath),
        `${partPath}.conditions`,
        { nonEmpty: true },
      );
    },
  );
  return body;
}

export function validateRelationshipProfileDefinitionSave(data, path) {
  const profile = saveRecord(data, path);
  const meters = saveRecord(requiredSaveField(profile, "meters", path), `${path}.meters`);
  for (const [meterId, meterData] of Object.entries(meters)) {
    const meterPath = `${path}.meters.${meterId}`;
    if (!/^[a-z][a-z0-9_-]*$/.test(meterId)) {
      failSave(meterPath, "has an invalid meter id");
    }
    const meter = saveRecord(meterData, meterPath);
    saveString(requiredSaveField(meter, "label", meterPath), `${meterPath}.label`, {
      nonEmpty: true,
    });
    saveString(
      requiredSaveField(meter, "description", meterPath),
      `${meterPath}.description`,
      { nonEmpty: true },
    );
    saveFiniteNumber(requiredSaveField(meter, "initial", meterPath), `${meterPath}.initial`, {
      min: RELATIONSHIP_MIN,
      max: RELATIONSHIP_MAX,
    });
    saveBoolean(
      requiredSaveField(meter, "higherIsBetter", meterPath),
      `${meterPath}.higherIsBetter`,
    );
    saveBoolean(
      requiredSaveField(meter, "initiallyVisible", meterPath),
      `${meterPath}.initiallyVisible`,
    );
    saveBoolean(
      requiredSaveField(meter, "revealOnChange", meterPath),
      `${meterPath}.revealOnChange`,
    );
  }
  return profile;
}

export function validateClothingSave(data, path) {
  const seen = new Set();
  saveArray(data, path).forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 2) {
      failSave(entryPath, "must be a [slot, item] pair");
    }
    const slot = saveString(entry[0], `${entryPath}[0]`, { nonEmpty: true });
    if (seen.has(slot)) failSave(`${entryPath}[0]`, `duplicates clothing slot '${slot}'`);
    seen.add(slot);

    const item = saveRecord(entry[1], `${entryPath}[1]`);
    requireSameSaveValue(
      saveString(
        requiredSaveField(item, "slot", `${entryPath}[1]`),
        `${entryPath}[1].slot`,
        { nonEmpty: true },
      ),
      slot,
      `${entryPath}[1].slot`,
      "the clothing map key",
    );
    saveString(requiredSaveField(item, "id", `${entryPath}[1]`), `${entryPath}[1].id`, {
      nonEmpty: true,
    });
    saveFiniteNumber(
      requiredSaveField(item, "durability", `${entryPath}[1]`),
      `${entryPath}[1].durability`,
      { min: 0, max: 1 },
    );
    saveFiniteNumber(
      requiredSaveField(item, "wetness", `${entryPath}[1]`),
      `${entryPath}[1].wetness`,
      { min: 0, max: 1 },
    );
    saveFiniteNumber(
      requiredSaveField(item, "genderBias", `${entryPath}[1]`),
      `${entryPath}[1].genderBias`,
      { min: -1, max: 1 },
    );
  });
  return data;
}

export function validateCharacterCoreSave(data, path) {
  validateStatsSave(requiredSaveField(data, "stats", path), `${path}.stats`);
  saveRecord(requiredSaveField(data, "pronouns", path), `${path}.pronouns`);
  validateClothingSave(requiredSaveField(data, "clothing", path), `${path}.clothing`);
  validateBodySave(requiredSaveField(data, "body", path), `${path}.body`);
  return data;
}
