import { validateChoice } from "./choiceContract.js";

const SCENE_KINDS = new Set(["location", "place", "event"]);

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

export function validateScene(scene) {
  requireRecord(scene, "scene");
  requireText(scene.id, "scene.id");
  requireText(scene.kind, "scene.kind");
  if (!SCENE_KINDS.has(scene.kind)) {
    fail(`scene.kind must be one of: ${[...SCENE_KINDS].join(", ")}`);
  }
  requireText(scene.heading, "scene.heading");
  validateStatus(scene.status);
  validateMap(scene.map);

  if (!Array.isArray(scene.paragraphs)) {
    fail("scene.paragraphs must be an array");
  }
  scene.paragraphs.forEach((paragraph, index) => {
    if (typeof paragraph !== "string") {
      fail(`scene.paragraphs[${index}] must be a string`);
    }
  });

  if (!Array.isArray(scene.sections)) fail("scene.sections must be an array");
  const sectionIds = new Set();
  const choiceIds = new Set();

  scene.sections.forEach((section, sectionIndex) => {
    const sectionPath = `scene.sections[${sectionIndex}]`;
    requireRecord(section, sectionPath);
    requireText(section.id, `${sectionPath}.id`);
    requireText(section.heading, `${sectionPath}.heading`);
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
    map: input.map === undefined ? null : input.map,
  };
  return validateScene(scene);
}
