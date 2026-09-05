const UINT32_MAX = 0xffffffff;

export class SaveValidationError extends Error {
  constructor(path, message) {
    super(`Invalid game save at ${path}: ${message}`);
    this.name = "SaveValidationError";
    this.path = path;
  }
}

export function failSave(path, message) {
  throw new SaveValidationError(path, message);
}

export function isSaveRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function saveRecord(value, path) {
  if (!isSaveRecord(value)) failSave(path, "must be an object");
  return value;
}

export function saveArray(value, path) {
  if (!Array.isArray(value)) failSave(path, "must be an array");
  return value;
}

export function requiredSaveField(object, key, path) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    failSave(`${path}.${key}`, "is required");
  }
  return object[key];
}

export function saveString(value, path, { nonEmpty = false } = {}) {
  if (typeof value !== "string") failSave(path, "must be a string");
  if (nonEmpty && value.length === 0) failSave(path, "must not be empty");
  return value;
}

export function saveBoolean(value, path) {
  if (typeof value !== "boolean") failSave(path, "must be a boolean");
  return value;
}

export function saveFiniteNumber(
  value,
  path,
  { min = -Infinity, max = Infinity } = {},
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failSave(path, "must be a finite number");
  }
  if (value < min || value > max) {
    failSave(path, `must be between ${min} and ${max}`);
  }
  return value;
}

export function saveInteger(value, path, options = {}) {
  saveFiniteNumber(value, path, options);
  if (!Number.isInteger(value)) failSave(path, "must be an integer");
  return value;
}

export function saveUint32(value, path) {
  return saveInteger(value, path, { min: 0, max: UINT32_MAX });
}

export function saveNullableString(value, path, { nonEmpty = true } = {}) {
  if (value === null) return null;
  return saveString(value, path, { nonEmpty });
}

export function saveDateMilliseconds(value, path) {
  const text = saveString(value, path, { nonEmpty: true });
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) failSave(path, "must be a valid date string");
  return timestamp;
}

export function saveClockMinutes(value, path) {
  const text = saveString(value, path, { nonEmpty: true });
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) failSave(path, "must use HH:MM format");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) {
    failSave(path, "must be a valid 24-hour time (24:00 is the only allowed hour 24 value)");
  }
  return hour * 60 + minute;
}

export function requireSameSaveValue(actual, expected, path, description) {
  if (actual !== expected) failSave(path, `must match ${description}`);
}

export function saveUniqueStrings(values, path, { nonEmpty = false } = {}) {
  const seen = new Set();
  saveArray(values, path).forEach((value, index) => {
    const itemPath = `${path}[${index}]`;
    const text = saveString(value, itemPath, { nonEmpty });
    if (seen.has(text)) failSave(itemPath, `duplicates '${text}'`);
    seen.add(text);
  });
  return seen;
}

export function validateJsonValue(value, path, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) failSave(path, "contains a non-finite number");
    return;
  }
  if (typeof value !== "object") {
    failSave(path, `contains unsupported ${typeof value} data`);
  }
  if (ancestors.has(value)) failSave(path, "contains a circular reference");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((child, index) =>
        validateJsonValue(child, `${path}[${index}]`, ancestors),
      );
      return;
    }
    if (!isSaveRecord(value)) {
      failSave(path, "must contain only plain JSON objects and arrays");
    }
    for (const [key, child] of Object.entries(value)) {
      validateJsonValue(child, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}
