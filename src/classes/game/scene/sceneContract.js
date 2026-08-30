import { validateChoice } from "./choiceContract.js";

const SCENE_KINDS = new Set(["location", "place", "event"]);
const ALERT_TONES = new Set(["info", "warning"]);
const CHANGE_DIRECTIONS = new Set(["increase", "decrease", "neutral"]);

export class SceneContractError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "SceneContractError";
  }
}

function fail(message) {
  throw new SceneContractError(message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, path) {
  if (!isRecord(value)) fail(`${path} must be an object`);
}

function requireText(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${path} must be a non-empty string`);
  }
}

function validateOptionalText(value, path) {
  if (value === null || value === undefined) return;
  requireText(value, path);
}

function validateStatus(status) {
  requireRecord(status, "scene.status");
  requireText(status.now, "scene.status.now");
  if (!Number.isFinite(Date.parse(status.now))) {
    fail("scene.status.now must be a valid date string");
  }
  requireText(status.weather, "scene.status.weather");
  if (!Number.isFinite(status.temperatureC)) {
    fail("scene.status.temperatureC must be a finite number");
  }
}

function validateMap(map) {
  if (map === null) return;
  requireRecord(map, "scene.map");
  requireText(map.scope, "scene.map.scope");
  requireText(map.centerLocationId, "scene.map.centerLocationId");
  if (!Array.isArray(map.nodes)) fail("scene.map.nodes must be an array");
  if (!Array.isArray(map.edges)) fail("scene.map.edges must be an array");
}

function validateAlerts(alerts) {
  if (!Array.isArray(alerts)) fail("scene.alerts must be an array");
  const ids = new Set();
  alerts.forEach((alert, index) => {
    const path = `scene.alerts[${index}]`;
    requireRecord(alert, path);
    requireText(alert.id, `${path}.id`);
    requireText(alert.tone, `${path}.tone`);
    requireText(alert.text, `${path}.text`);
    if (!ALERT_TONES.has(alert.tone)) {
      fail(`${path}.tone must be one of: ${[...ALERT_TONES].join(", ")}`);
    }
    if (ids.has(alert.id)) fail(`Duplicate scene alert id '${alert.id}'`);
    ids.add(alert.id);
  });
}

function validateChange(change, path) {
  requireRecord(change, path);
  requireText(change.type, `${path}.type`);
  requireText(change.label, `${path}.label`);
  if (!Number.isFinite(change.amount)) {
    fail(`${path}.amount must be a finite number`);
  }
  if (!CHANGE_DIRECTIONS.has(change.direction)) {
    fail(`${path}.direction must be one of: ${[...CHANGE_DIRECTIONS].join(", ")}`);
  }
}

function validateContent(content) {
  if (!Array.isArray(content)) fail("scene.content must be an array");
  content.forEach((block, index) => {
    const path = `scene.content[${index}]`;
    requireRecord(block, path);
    requireText(block.type, `${path}.type`);
    if (block.type === "paragraph") {
      if (block.parts === undefined) {
        requireText(block.text, `${path}.text`);
        return;
      }
      if (block.text !== undefined) fail(`${path} cannot contain both text and parts`);
      if (!Array.isArray(block.parts) || !block.parts.length) {
        fail(`${path}.parts must be a non-empty array`);
      }
      let hasText = false;
      block.parts.forEach((part, partIndex) => {
        const partPath = `${path}.parts[${partIndex}]`;
        requireRecord(part, partPath);
        if (part.type === "text") {
          if (typeof part.text !== "string") fail(`${partPath}.text must be a string`);
          hasText ||= Boolean(part.text.trim());
        } else if (part.type === "change") {
          validateChange(part.change, `${partPath}.change`);
        } else if (part.type !== "break") {
          fail(`${partPath}.type must be 'text', 'break', or 'change'`);
        }
      });
      if (!hasText) fail(`${path}.parts must contain non-empty prose`);
      return;
    }
    if (block.type === "changes") {
      if (!Array.isArray(block.items) || !block.items.length) {
        fail(`${path}.items must be a non-empty array`);
      }
      block.items.forEach((change, changeIndex) => {
        const changePath = `${path}.items[${changeIndex}]`;
        validateChange(change, changePath);
      });
      return;
    }
    fail(`${path}.type must be 'paragraph' or 'changes'`);
  });
}

export function validateScene(scene) {
  requireRecord(scene, "scene");
  requireText(scene.id, "scene.id");
  requireText(scene.kind, "scene.kind");
  if (!SCENE_KINDS.has(scene.kind)) {
    fail(`scene.kind must be one of: ${[...SCENE_KINDS].join(", ")}`);
  }
  validateOptionalText(scene.heading, "scene.heading");
  validateStatus(scene.status);
  validateMap(scene.map);
  validateAlerts(scene.alerts);

  validateContent(scene.content);

  if (!Array.isArray(scene.sections)) fail("scene.sections must be an array");
  const sectionIds = new Set();
  const choiceIds = new Set();

  scene.sections.forEach((section, sectionIndex) => {
    const sectionPath = `scene.sections[${sectionIndex}]`;
    requireRecord(section, sectionPath);
    requireText(section.id, `${sectionPath}.id`);
    if (section.heading !== null) requireText(section.heading, `${sectionPath}.heading`);
    if (sectionIds.has(section.id)) {
      fail(`Duplicate scene section id '${section.id}'`);
    }
    sectionIds.add(section.id);

    if (!Array.isArray(section.choices)) {
      fail(`${sectionPath}.choices must be an array`);
    }
    section.choices.forEach((choice, choiceIndex) => {
      const choicePath = `${sectionPath}.choices[${choiceIndex}]`;
      validateChoice(choice, choicePath);
      if (choiceIds.has(choice.id)) {
        fail(`Duplicate choice id '${choice.id}' in scene`);
      }
      choiceIds.add(choice.id);
    });
  });

  return scene;
}

export function createScene(input) {
  requireRecord(input, "scene");
  const scene = {
    ...input,
    heading: input.heading === undefined ? null : input.heading,
    map: input.map === undefined ? null : input.map,
    alerts: input.alerts === undefined ? [] : input.alerts,
  };
  return validateScene(scene);
}
