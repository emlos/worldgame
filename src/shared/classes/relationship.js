
import { clamp, finiteNumber } from "../util/util.js";

// --------------------------
// Relationships
// --------------------------

export const RELATIONSHIP_MIN = 0;
export const RELATIONSHIP_MAX = 100;

const METER_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

export function normalizeRelationshipProfileDefinition(value = null) {
  if (value == null) return { meters: {} };
  const profile = record(value, "Relationship profile definition");
  const sourceMeters = record(profile.meters ?? {}, "Relationship profile meters");
  const meters = {};

  for (const [id, rawDefinition] of Object.entries(sourceMeters)) {
    if (!METER_ID_PATTERN.test(id)) {
      throw new TypeError(`Invalid relationship meter id '${id}'`);
    }
    const definition = record(rawDefinition, `Relationship meter '${id}'`);
    const label = String(definition.label ?? "").trim();
    if (!label) throw new TypeError(`Relationship meter '${id}' needs a label`);
    const description = String(definition.description ?? "").trim();
    if (!description) {
      throw new TypeError(`Relationship meter '${id}' needs a description`);
    }
    const initial = finiteNumber(
      definition.initial ?? 0,
      `Relationship meter '${id}' initial value`,
    );
    if (initial < RELATIONSHIP_MIN || initial > RELATIONSHIP_MAX) {
      throw new RangeError(
        `Relationship meter '${id}' initial value must be between ` +
          `${RELATIONSHIP_MIN} and ${RELATIONSHIP_MAX}`,
      );
    }
    meters[id] = {
      label,
      description,
      initial,
      higherIsBetter: definition.higherIsBetter !== false,
      initiallyVisible: definition.initiallyVisible !== false,
      revealOnChange: definition.revealOnChange === true,
    };
  }

  return { meters };
}

export function requireRelationshipMeterDefinition(profileDefinition, meterId) {
  const id = String(meterId);
  const definition = profileDefinition?.meters?.[id];
  if (!definition) throw new Error(`Unknown relationship meter '${id}'`);
  return { id, definition };
}

export class RelationshipMeter {
  constructor({ value = 0, revealed = false } = {}) {
    this.value = clamp(
      finiteNumber(value, "Relationship meter value"),
      RELATIONSHIP_MIN,
      RELATIONSHIP_MAX,
    );
    this.revealed = !!revealed;
  }

  toJSON() {
    return { value: this.value, revealed: this.revealed };
  }

  static fromJSON(data) {
    if (data instanceof RelationshipMeter) return data;
    return new RelationshipMeter(data || {});
  }
}

export class RelationshipProfile {
  constructor({ met = false, meters = [] } = {}) {
    this.met = !!met;
    this.meters = new Map();
    const entries = meters instanceof Map
      ? meters
      : Array.isArray(meters)
        ? meters
        : Object.entries(meters || {});
    for (const [id, state] of entries) {
      this.meters.set(String(id), RelationshipMeter.fromJSON(state));
    }
  }

  toJSON() {
    return {
      met: this.met,
      meters: [...this.meters.entries()].map(([id, meter]) => [id, meter.toJSON()]),
    };
  }

  static fromJSON(data) {
    if (data instanceof RelationshipProfile) return data;
    return new RelationshipProfile(data || {});
  }
}

export function createRelationshipProfile(profileDefinition, { met = false } = {}) {
  const normalized = normalizeRelationshipProfileDefinition(profileDefinition);
  return new RelationshipProfile({
    met,
    meters: Object.entries(normalized.meters).map(([id, definition]) => [
      id,
      {
        value: definition.initial,
        revealed: definition.initiallyVisible,
      },
    ]),
  });
}
