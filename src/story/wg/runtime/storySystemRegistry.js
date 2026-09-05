import { SCHOOL_QUIZ_STORY_SYSTEM } from "../../systems/schoolQuiz/system.js";
import { validateWGEffectReferences } from "../shared/effects/registry.js";
import { WG_RUNTIME_EFFECT_CATALOG } from "./effectCatalog.js";

export class WGStorySystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGStorySystemError";
  }
}

const SYSTEMS = new Map();

function fail(message) {
  throw new WGStorySystemError(message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function registerWGStorySystem(systemId, system) {
  const id = String(systemId);
  if (!/^[a-z][a-z0-9_.-]*$/.test(id)) fail(`Invalid WG story system id '${id}'`);
  if (!isRecord(system)) fail(`WG story system '${id}' must be an object`);
  if (SYSTEMS.has(id)) fail(`Duplicate WG story system '${id}'`);
  SYSTEMS.set(id, Object.freeze({ ...system }));
}

registerWGStorySystem("school.quiz", SCHOOL_QUIZ_STORY_SYSTEM);

function validateJSON(value, path, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${path} contains a non-finite number`);
    return;
  }
  if (typeof value !== "object") fail(`${path} contains unsupported ${typeof value} data`);
  if (ancestors.has(value)) fail(`${path} contains a circular reference`);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((child, index) => validateJSON(child, `${path}[${index}]`, ancestors));
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail(`${path} must contain only plain JSON objects and arrays`);
    }
    for (const [key, child] of Object.entries(value)) {
      validateJSON(child, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

export function cloneWGSystemJSON(value, path = "WG system data") {
  validateJSON(value, path);
  return JSON.parse(JSON.stringify(value));
}

export function getWGStorySystem(systemId) {
  const id = String(systemId);
  const system = SYSTEMS.get(id);
  if (!system) fail(`Unknown WG story system '${id}'`);
  return system;
}

function validateState(system, state, systemId) {
  validateJSON(state, `WG system '${systemId}' state`);
  if (typeof system.validateState === "function") system.validateState(state);
}

export function validateWGSystemState(systemId, state) {
  const system = getWGStorySystem(systemId);
  validateState(system, state, String(systemId));
  return state;
}

export function createWGSystemState(game, definition, instanceKey) {
  const systemId = definition.system?.id;
  const system = getWGStorySystem(systemId);
  if (typeof system.create !== "function") {
    fail(`WG story system '${systemId}' has no create callback`);
  }
  const state = system.create({
    game,
    definition,
    systemId,
    instanceKey,
    config: cloneWGSystemJSON(definition.system.config || {}, "WG system config"),
  });
  validateState(system, state, systemId);
  return cloneWGSystemJSON(state, `WG system '${systemId}' state`);
}

export function renderWGSystem(game, definition, frame) {
  const systemId = definition.system?.id;
  const system = getWGStorySystem(systemId);
  if (typeof system.render !== "function") {
    fail(`WG story system '${systemId}' has no render callback`);
  }
  validateState(system, frame.system.state, systemId);
  const rendered = system.render({
    game,
    definition,
    systemId,
    instanceKey: frame.instanceKey,
    config: cloneWGSystemJSON(definition.system.config || {}, "WG system config"),
    state: cloneWGSystemJSON(frame.system.state, `WG system '${systemId}' state`),
  });
  if (!isRecord(rendered)) fail(`WG story system '${systemId}' must render an object`);
  return rendered;
}

export function actWGSystem(game, definition, frame, command) {
  const systemId = definition.system?.id;
  const system = getWGStorySystem(systemId);
  if (typeof system.act !== "function") {
    fail(`WG story system '${systemId}' has no act callback`);
  }
  validateState(system, frame.system.state, systemId);
  const outcome = system.act({
    game,
    definition,
    systemId,
    instanceKey: frame.instanceKey,
    config: cloneWGSystemJSON(definition.system.config || {}, "WG system config"),
    state: cloneWGSystemJSON(frame.system.state, `WG system '${systemId}' state`),
    command: cloneWGSystemJSON(command, `WG system '${systemId}' command`),
  });
  if (!isRecord(outcome)) fail(`WG story system '${systemId}' must return an outcome`);

  const target = outcome.target ?? null;
  if (target !== null && (typeof target !== "string" || !target)) {
    fail(`WG story system '${systemId}' returned an invalid target`);
  }
  if (target === null && !Object.prototype.hasOwnProperty.call(outcome, "state")) {
    fail(`WG story system '${systemId}' must return state or a target`);
  }
  if (Object.prototype.hasOwnProperty.call(outcome, "state")) {
    validateState(system, outcome.state, systemId);
  }
  if (outcome.effects !== undefined && !Array.isArray(outcome.effects)) {
    fail(`WG story system '${systemId}' effects must be an array`);
  }
  for (const effect of outcome.effects || []) {
    validateWGEffectReferences(effect, WG_RUNTIME_EFFECT_CATALOG, {
      fail: (message) => fail(`WG story system '${systemId}' returned ${message}`),
    });
  }
  if (
    outcome.paragraphs !== undefined &&
    (!Array.isArray(outcome.paragraphs) ||
      outcome.paragraphs.some((paragraph) => typeof paragraph !== "string"))
  ) {
    fail(`WG story system '${systemId}' paragraphs must be strings`);
  }
  if (outcome.notice !== undefined && typeof outcome.notice !== "string") {
    fail(`WG story system '${systemId}' notice must be a string`);
  }

  return {
    state: Object.prototype.hasOwnProperty.call(outcome, "state")
      ? cloneWGSystemJSON(outcome.state, `WG system '${systemId}' state`)
      : null,
    target,
    effects: cloneWGSystemJSON(outcome.effects || [], `WG system '${systemId}' effects`),
    paragraphs: [...(outcome.paragraphs || [])],
    notice: outcome.notice ?? "",
  };
}
