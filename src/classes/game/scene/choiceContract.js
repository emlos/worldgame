export class ChoiceContractError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "ChoiceContractError";
  }
}

function fail(message) {
  throw new ChoiceContractError(message);
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
  if (value !== null && value !== undefined && typeof value !== "string") {
    fail(`${path} must be a string or null`);
  }
}

function validateMetadataList(value, path, { isCost = false } = {}) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    requireRecord(entry, entryPath);
    requireText(entry.type, `${entryPath}.type`);
    validateOptionalText(entry.label, `${entryPath}.label`);

    if (entry.amount !== undefined && !Number.isFinite(entry.amount)) {
      fail(`${entryPath}.amount must be a finite number`);
    }
    if (isCost && entry.amount !== undefined && entry.amount < 0) {
      fail(`${entryPath}.amount cannot be negative`);
    }
  });
}

export function validateChoice(choice, path = "choice") {
  requireRecord(choice, path);
  requireText(choice.id, `${path}.id`);
  requireText(choice.label, `${path}.label`);

  if (
    choice.icon !== null &&
    choice.icon !== undefined &&
    typeof choice.icon !== "string"
  ) {
    fail(`${path}.icon must be a string or null`);
  }

  if (!Number.isFinite(choice.durationMinutes) || choice.durationMinutes < 0) {
    fail(`${path}.durationMinutes must be a non-negative finite number`);
  }

  if (typeof choice.enabled !== "boolean") {
    fail(`${path}.enabled must be a boolean`);
  }

  validateOptionalText(choice.disabledReason, `${path}.disabledReason`);
  validateOptionalText(choice.warning, `${path}.warning`);
  validateMetadataList(choice.costs, `${path}.costs`, { isCost: true });
  validateMetadataList(choice.effectsPreview, `${path}.effectsPreview`);

  requireRecord(choice.action, `${path}.action`);
  requireText(choice.action.type, `${path}.action.type`);
  return choice;
}

function copyMetadataList(value) {
  return Array.isArray(value) ? value.map((entry) => ({ ...entry })) : value;
}

export function createChoice(input) {
  requireRecord(input, "choice");

  const {
    id,
    icon,
    label,
    durationMinutes,
    costs,
    effectsPreview,
    enabled,
    disabledReason,
    warning,
    action,
    ...extensions
  } = input;

  const choice = {
    id,
    icon: icon === undefined ? null : icon,
    label,
    durationMinutes: durationMinutes === undefined ? 0 : durationMinutes,
    costs: copyMetadataList(costs === undefined ? [] : costs),
    effectsPreview: copyMetadataList(
      effectsPreview === undefined ? [] : effectsPreview,
    ),
    enabled: enabled === undefined ? true : enabled,
    disabledReason: disabledReason === undefined ? null : disabledReason,
    warning: warning === undefined ? null : warning,
    action: isRecord(action) ? { ...action } : action,
    ...extensions,
  };

  return validateChoice(choice);
}

export function validateSceneChoices(scene) {
  requireRecord(scene, "scene");
  if (!Array.isArray(scene.sections)) fail("scene.sections must be an array");

  const choiceIds = new Set();
  scene.sections.forEach((section, sectionIndex) => {
    const sectionPath = `scene.sections[${sectionIndex}]`;
    requireRecord(section, sectionPath);
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
