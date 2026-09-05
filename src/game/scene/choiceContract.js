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

function validateSkillChanges(value, path) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    requireRecord(entry, entryPath);
    requireText(entry.skillId, `${entryPath}.skillId`);
    requireText(entry.label, `${entryPath}.label`);
    if (!['increase', 'decrease'].includes(entry.direction)) {
      fail(`${entryPath}.direction must be 'increase' or 'decrease'`);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "amount")) {
      fail(`${entryPath}.amount must not expose the skill-change amount`);
    }
  });
}

function validateSkillCheck(value, path) {
  if (value === null) return;
  requireRecord(value, path);
  requireText(value.targetType, `${path}.targetType`);
  requireText(value.targetId, `${path}.targetId`);
  requireText(value.targetLabel, `${path}.targetLabel`);
  requireText(value.difficultyId, `${path}.difficultyId`);
  requireText(value.difficultyLabel, `${path}.difficultyLabel`);
  for (const hidden of ["chance", "roll", "outcome"]) {
    if (Object.prototype.hasOwnProperty.call(value, hidden)) {
      fail(`${path}.${hidden} must not expose hidden check data`);
    }
  }
}

function validateSkillCheckAction(action, path) {
  requireRecord(action.check, `${path}.check`);
  requireText(action.check.targetType, `${path}.check.targetType`);
  requireText(action.check.targetId, `${path}.check.targetId`);
  requireText(action.check.difficultyId, `${path}.check.difficultyId`);
  requireRecord(action.outcomes, `${path}.outcomes`);
  for (const result of ["success", "failure"]) {
    const outcomePath = `${path}.outcomes.${result}`;
    const outcome = action.outcomes[result];
    requireRecord(outcome, outcomePath);
    requireText(outcome.target, `${outcomePath}.target`);
    if (!Number.isFinite(outcome.durationMinutes) || outcome.durationMinutes < 0) {
      fail(`${outcomePath}.durationMinutes must be a non-negative finite number`);
    }
    if (typeof outcome.energyFree !== "boolean") {
      fail(`${outcomePath}.energyFree must be a boolean`);
    }
    if (typeof outcome.resting !== "boolean") {
      fail(`${outcomePath}.resting must be a boolean`);
    }
    if (outcome.resting && !outcome.energyFree) {
      fail(`${outcomePath}.resting requires energyFree`);
    }
    if (!Array.isArray(outcome.effects)) fail(`${outcomePath}.effects must be an array`);
  }
}

function validateNavigation(value, path) {
  if (value === null) return;
  requireRecord(value, path);
  if (value.kind !== "gps") fail(`${path}.kind must be 'gps'`);
  requireText(value.destinationName, `${path}.destinationName`);
  if (!Number.isFinite(value.remainingMinutes) || value.remainingMinutes < 0) {
    fail(`${path}.remainingMinutes must be a non-negative finite number`);
  }
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
  if (typeof choice.energyFree !== "boolean") {
    fail(`${path}.energyFree must be a boolean`);
  }
  if (typeof choice.resting !== "boolean") {
    fail(`${path}.resting must be a boolean`);
  }
  if (choice.resting && !choice.energyFree) {
    fail(`${path}.resting requires energyFree`);
  }

  if (typeof choice.enabled !== "boolean") {
    fail(`${path}.enabled must be a boolean`);
  }

  validateOptionalText(choice.disabledReason, `${path}.disabledReason`);
  validateOptionalText(choice.warning, `${path}.warning`);
  validateNavigation(choice.navigation, `${path}.navigation`);
  validateMetadataList(choice.costs, `${path}.costs`, { isCost: true });
  validateMetadataList(choice.effectsPreview, `${path}.effectsPreview`);
  validateSkillChanges(choice.skillChanges, `${path}.skillChanges`);
  validateSkillCheck(choice.skillCheck, `${path}.skillCheck`);

  requireRecord(choice.action, `${path}.action`);
  requireText(choice.action.type, `${path}.action.type`);
  if (choice.action.type === "skill-check") {
    if (choice.skillCheck === null) fail(`${path}.skillCheck is required for skill-check actions`);
    if (choice.durationMinutes !== 0) {
      fail(`${path}.durationMinutes must be zero when outcome durations are hidden`);
    }
    validateSkillCheckAction(choice.action, `${path}.action`);
  } else if (choice.skillCheck !== null) {
    fail(`${path}.skillCheck requires a skill-check action`);
  }
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
    energyFree,
    resting,
    costs,
    effectsPreview,
    skillChanges,
    skillCheck,
    enabled,
    disabledReason,
    warning,
    navigation,
    action,
    ...extensions
  } = input;

  const choice = {
    id,
    icon: icon === undefined ? null : icon,
    label,
    durationMinutes: durationMinutes === undefined ? 0 : durationMinutes,
    energyFree: energyFree === undefined ? false : energyFree,
    resting: resting === undefined ? false : resting,
    costs: copyMetadataList(costs === undefined ? [] : costs),
    effectsPreview: copyMetadataList(
      effectsPreview === undefined ? [] : effectsPreview,
    ),
    skillChanges: copyMetadataList(skillChanges === undefined ? [] : skillChanges),
    skillCheck: skillCheck === undefined || skillCheck === null ? null : { ...skillCheck },
    enabled: enabled === undefined ? true : enabled,
    disabledReason: disabledReason === undefined ? null : disabledReason,
    warning: warning === undefined ? null : warning,
    navigation:
      navigation === undefined || navigation === null ? null : { ...navigation },
    action: isRecord(action) ? { ...action } : action,
    ...extensions,
  };

  return validateChoice(choice);
}
