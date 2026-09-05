import {
  WG_EXPRESSION_BINARY_PRECEDENCE,
  WG_EXPRESSION_UNARY_OPERATORS,
  WG_ID_PATTERN,
  WG_PATH_SEGMENT_PATTERN,
  WG_SIMPLE_ID_PATTERN,
} from "../languageCore.js";

const EFFECT_ID_PATTERN = new RegExp(`^${WG_ID_PATTERN}$`);
const SIMPLE_EFFECT_ID_PATTERN = new RegExp(`^${WG_SIMPLE_ID_PATTERN}$`);
const STORY_PATH_SEGMENT_PATTERN = new RegExp(`^${WG_PATH_SEGMENT_PATTERN}$`);
const DIRECTIONS = new Set(["increase", "decrease", "neutral"]);
const UNARY_OPERATORS = new Set(WG_EXPRESSION_UNARY_OPERATORS);
const BINARY_OPERATORS = new Set(Object.keys(WG_EXPRESSION_BINARY_PRECEDENCE));

export class WGEffectContractError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "WGEffectContractError";
  }
}

function defaultFail(message) {
  throw new WGEffectContractError(message);
}

function reporter(options) {
  return typeof options?.fail === "function" ? options.fail : defaultFail;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateKeys(value, required, optional, label, fail) {
  if (!isRecord(value)) fail(`${label} must be an object`);
  for (const key of required) {
    if (!hasOwn(value, key)) fail(`${label} requires '${key}'`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} has unknown field '${key}'`);
  }
}

function validateId(value, label, fail, { simple = false } = {}) {
  const pattern = simple ? SIMPLE_EFFECT_ID_PATTERN : EFFECT_ID_PATTERN;
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${label} must be a lowercase identifier`);
  }
}

function validateAmount(value, label, fail) {
  if (!Number.isFinite(value)) fail(`${label} requires a finite amount`);
}

function validateExpression(expression, fail, seen = new Set()) {
  if (!isRecord(expression)) fail("WG effect expressions must be objects");
  if (seen.has(expression)) fail("WG effect expressions cannot be recursive");
  seen.add(expression);

  if (expression.type === "literal") {
    validateKeys(expression, ["type", "value"], [], "WG literal expression", fail);
    const value = expression.value;
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "boolean" &&
      !Number.isFinite(value)
    ) {
      fail("WG expression literals must be null, strings, booleans, or finite numbers");
    }
  } else if (expression.type === "path") {
    validateKeys(expression, ["type", "value"], [], "WG path expression", fail);
    if (
      !Array.isArray(expression.value) ||
      !expression.value.length ||
      expression.value.some((segment) =>
        typeof segment !== "string" || !STORY_PATH_SEGMENT_PATTERN.test(segment)
      )
    ) {
      fail("WG expression paths must contain valid identifiers");
    }
  } else if (expression.type === "list") {
    validateKeys(expression, ["type", "values"], [], "WG list expression", fail);
    if (!Array.isArray(expression.values)) fail("WG list expressions require values");
    for (const value of expression.values) validateExpression(value, fail, seen);
  } else if (expression.type === "unary") {
    validateKeys(
      expression,
      ["type", "operator", "value"],
      [],
      "WG unary expression",
      fail,
    );
    if (!UNARY_OPERATORS.has(expression.operator)) {
      fail(`Unknown WG unary operator '${String(expression.operator)}'`);
    }
    validateExpression(expression.value, fail, seen);
  } else if (expression.type === "binary") {
    validateKeys(
      expression,
      ["type", "operator", "left", "right"],
      [],
      "WG binary expression",
      fail,
    );
    if (!BINARY_OPERATORS.has(expression.operator)) {
      fail(`Unknown WG binary operator '${String(expression.operator)}'`);
    }
    validateExpression(expression.left, fail, seen);
    validateExpression(expression.right, fail, seen);
  } else {
    fail(`Unknown WG expression type '${String(expression.type)}'`);
  }

  seen.delete(expression);
}

function validateFeedback(feedback, effect, fail) {
  if (!isRecord(feedback)) fail("WG effect feedback must be an object");
  const relationship = effect.op === "relationship";
  validateKeys(
    feedback,
    relationship
      ? ["type", "amount", "label", "npcId", "meterId", "higherIsBetter", "direction"]
      : ["type", "amount", "label", "direction"],
    [],
    "WG effect feedback",
    fail,
  );
  if (feedback.type !== effect.op) fail("WG effect feedback type must match its effect");
  validateAmount(feedback.amount, "WG effect feedback", fail);
  if (feedback.amount !== effect.amount) {
    fail("WG effect feedback amount must match its effect");
  }
  if (typeof feedback.label !== "string" || !feedback.label.trim()) {
    fail("WG effect feedback requires a label");
  }
  if (!DIRECTIONS.has(feedback.direction)) {
    fail("WG effect feedback requires a valid direction");
  }
  if (relationship) {
    if (feedback.npcId !== effect.npcId || feedback.meterId !== effect.meterId) {
      fail("WG relationship feedback target must match its effect");
    }
    if (typeof feedback.higherIsBetter !== "boolean") {
      fail("WG relationship feedback requires higherIsBetter");
    }
  }
}

function validateBaseEffect(effect, required, optional, fail) {
  validateKeys(
    effect,
    ["op", ...required],
    ["source", "feedback", ...optional],
    `WG ${String(effect?.op)} effect`,
    fail,
  );
  if (effect.source !== undefined && !isRecord(effect.source)) {
    fail("WG effect source must be an object");
  }
  if (effect.feedback !== undefined) validateFeedback(effect.feedback, effect, fail);
}

function validateAction(effect, actions, fail) {
  if (!actions.includes(effect.action)) {
    fail(`WG ${effect.op} effect requires ${actions.join(", ")}`);
  }
}

function catalogHas(catalog, id) {
  if (catalog instanceof Map || catalog instanceof Set) return catalog.has(id);
  return Boolean(catalog) && hasOwn(catalog, id);
}

function catalogGet(catalog, id) {
  if (catalog instanceof Map) return catalog.get(id);
  if (catalog instanceof Set) return catalog.has(id) ? id : undefined;
  return catalog?.[id];
}

function direction(amount) {
  return amount > 0 ? "increase" : amount < 0 ? "decrease" : "neutral";
}

function signedLabel(amount, label) {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${label}`;
}

function labeledFeedback(labelFromCatalog, suffix = "") {
  return (effect, catalog, customLabel, fail) => {
    const definition = labelFromCatalog(effect, catalog);
    if (!definition && customLabel === undefined) {
      fail(`Cannot create feedback for unknown ${effect.op} '${String(effect.id)}'`);
    }
    const defaultLabel = `${definition?.label || ""}${suffix}`;
    return {
      type: effect.op,
      amount: effect.amount,
      label: customLabel ?? signedLabel(effect.amount, defaultLabel),
      direction: direction(effect.amount),
    };
  };
}

const EFFECT_DEFINITIONS = [
  {
    op: "contact",
    syntax: "contact add",
    allowedInChat: false,
    validate(effect, fail) {
      validateBaseEffect(effect, ["action", "npcId"], [], fail);
      validateAction(effect, ["add"], fail);
      validateId(effect.npcId, "WG contact NPC id", fail);
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.npcs, effect.npcId)) {
        fail(`Unknown contact NPC '${effect.npcId}'`);
      }
    },
  },
  {
    op: "chat",
    syntax: "chat start",
    allowedInChat: false,
    validate(effect, fail) {
      validateBaseEffect(effect, ["action", "id"], [], fail);
      validateAction(effect, ["start"], fail);
      validateId(effect.id, "WG chat id", fail);
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.chats, effect.id)) fail(`Unknown chat '${effect.id}'`);
    },
  },
  ...["set", "add"].map((op) => ({
    op,
    syntax: op,
    validate(effect, fail) {
      validateBaseEffect(effect, ["path", "value"], [], fail);
      if (
        !Array.isArray(effect.path) ||
        effect.path.length < 2 ||
        effect.path[0] !== "story" ||
        effect.path.some((segment) =>
          typeof segment !== "string" || !STORY_PATH_SEGMENT_PATTERN.test(segment)
        )
      ) {
        fail(`WG ${op} effect may only target a valid story.* path`);
      }
      validateExpression(effect.value, fail);
    },
  })),
  ...["flag", "daily-flag"].map((op) => ({
    op,
    syntax: op,
    validate(effect, fail) {
      validateBaseEffect(effect, ["flag", "value"], [], fail);
      validateId(effect.flag, `WG ${op} id`, fail);
      if (typeof effect.value !== "boolean") fail(`WG ${op} effect requires a boolean`);
    },
  })),
  {
    op: "reminder",
    syntax: ["reminder add", "reminder clear"],
    validate(effect, fail) {
      validateBaseEffect(effect, ["action", "id"], [], fail);
      validateAction(effect, ["add", "clear"], fail);
      validateId(effect.id, "WG reminder id", fail);
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.reminders, effect.id)) fail(`Unknown reminder '${effect.id}'`);
    },
  },
  {
    op: "timer",
    syntax: ["timer start", "timer restart", "timer stop"],
    validate(effect, fail) {
      validateBaseEffect(effect, ["action", "id"], [], fail);
      validateAction(effect, ["start", "restart", "stop"], fail);
      validateId(effect.id, "WG timer id", fail);
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.timers, effect.id)) {
        fail(`@effect timer references unknown timer '${effect.id}'`);
      }
    },
  },
  {
    op: "unlock-place",
    keyword: "unlock",
    syntax: "unlock place",
    validate(effect, fail) {
      validateBaseEffect(effect, ["placeKey"], [], fail);
      validateId(effect.placeKey, "WG unlock place key", fail, { simple: true });
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.places, effect.placeKey)) {
        fail(`@effect unlock references unknown place '${effect.placeKey}'`);
      }
    },
  },
  {
    op: "relocate",
    syntax: ["relocate home", "relocate nearest-place"],
    validate(effect, fail) {
      validateBaseEffect(effect, ["destination"], [], fail);
      if (!isRecord(effect.destination)) fail("WG relocate destination must be an object");
      if (effect.destination.kind === "home") {
        validateKeys(effect.destination, ["kind"], [], "WG home destination", fail);
      } else if (effect.destination.kind === "nearest-place") {
        validateKeys(
          effect.destination,
          ["kind", "placeKey"],
          [],
          "WG nearest-place destination",
          fail,
        );
        validateId(
          effect.destination.placeKey,
          "WG relocate place key",
          fail,
          { simple: true },
        );
      } else {
        fail(`Unknown WG relocate destination '${String(effect.destination.kind)}'`);
      }
    },
    validateReferences(effect, catalog, fail) {
      if (
        effect.destination.kind === "nearest-place" &&
        !catalogHas(catalog.places, effect.destination.placeKey)
      ) {
        fail(`@effect relocate references unknown place '${effect.destination.placeKey}'`);
      }
    },
  },
  {
    op: "relationship",
    syntax: "relationship",
    validate(effect, fail) {
      validateBaseEffect(effect, ["npcId", "meterId", "amount"], [], fail);
      validateId(effect.npcId, "WG relationship NPC id", fail, { simple: true });
      validateId(effect.meterId, "WG relationship meter id", fail, { simple: true });
      validateAmount(effect.amount, "WG relationship effect", fail);
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.npcs, effect.npcId)) {
        fail(`Unknown relationship NPC '${effect.npcId}'`);
      }
      if (!catalogHas(catalog.relationships, `${effect.npcId}.${effect.meterId}`)) {
        fail(`Unknown relationship meter '${effect.npcId}.${effect.meterId}'`);
      }
    },
    createFeedback(effect, catalog, customLabel, fail) {
      const definition = catalogGet(
        catalog.relationships,
        `${effect.npcId}.${effect.meterId}`,
      );
      if (!definition) {
        fail(`Unknown relationship meter '${effect.npcId}.${effect.meterId}'`);
      }
      return {
        type: effect.op,
        amount: effect.amount,
        label: customLabel ?? signedLabel(effect.amount, definition.label),
        npcId: effect.npcId,
        meterId: effect.meterId,
        higherIsBetter: definition.higherIsBetter !== false,
        direction: direction(effect.amount),
      };
    },
  },
  {
    op: "money",
    syntax: "money",
    validate(effect, fail) {
      validateBaseEffect(effect, ["amount"], [], fail);
      validateAmount(effect.amount, "WG money effect", fail);
    },
    createFeedback: labeledFeedback(() => ({ label: "Money" })),
  },
  {
    op: "skill",
    syntax: "skill",
    implicitSkillChange: true,
    validate(effect, fail) {
      validateBaseEffect(effect, ["id", "amount"], [], fail);
      validateId(effect.id, "WG skill id", fail);
      validateAmount(effect.amount, "WG skill effect", fail);
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.skills, effect.id)) {
        fail(`@effect skill references unknown skill '${effect.id}'`);
      }
    },
    createFeedback: labeledFeedback((effect, catalog) =>
      catalogGet(catalog.skills, effect.id)
    ),
  },
  {
    op: "stat",
    syntax: "stat",
    validate(effect, fail) {
      validateBaseEffect(effect, ["id", "amount"], [], fail);
      validateId(effect.id, "WG stat id", fail);
      validateAmount(effect.amount, "WG stat effect", fail);
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.stats, effect.id)) {
        fail(`@effect stat references unknown stat '${effect.id}'`);
      }
    },
    createFeedback: labeledFeedback((effect, catalog) =>
      catalogGet(catalog.stats, effect.id)
    ),
    materializeFeedback(effect) {
      return { ...effect.feedback, statId: effect.id };
    },
  },
  {
    op: "grade",
    syntax: "grade",
    validate(effect, fail) {
      validateBaseEffect(effect, ["id", "amount"], [], fail);
      validateId(effect.id, "WG grade subject id", fail);
      if (!Number.isInteger(effect.amount)) {
        fail("@effect grade requires a signed whole number");
      }
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.subjects, effect.id)) {
        fail(`@effect grade references unknown school subject '${effect.id}'`);
      }
    },
    createFeedback: labeledFeedback((effect, catalog) =>
      catalogGet(catalog.subjects, effect.id)
    ),
  },
  {
    op: "attendance",
    syntax: "attendance",
    validate(effect, fail) {
      validateBaseEffect(effect, ["id", "amount"], [], fail);
      validateId(effect.id, "WG attendance subject id", fail);
      if (!Number.isInteger(effect.amount) || effect.amount <= 0) {
        fail("@effect attendance requires a positive whole number");
      }
    },
    validateReferences(effect, catalog, fail) {
      if (!catalogHas(catalog.subjects, effect.id)) {
        fail(`@effect attendance references unknown school subject '${effect.id}'`);
      }
    },
    createFeedback: labeledFeedback(
      (effect, catalog) => catalogGet(catalog.subjects, effect.id),
      " attendance",
    ),
  },
];

const EFFECT_REGISTRY = new Map();
for (const definition of EFFECT_DEFINITIONS) {
  if (EFFECT_REGISTRY.has(definition.op)) {
    throw new Error(`Duplicate WG effect definition '${definition.op}'`);
  }
  EFFECT_REGISTRY.set(
    definition.op,
    Object.freeze({ authored: true, keyword: definition.op, ...definition }),
  );
}

export const WG_EFFECT_OPS = Object.freeze([...EFFECT_REGISTRY.keys()]);
export const WG_EFFECT_KEYWORDS = Object.freeze(
  [...EFFECT_REGISTRY.values()].map((definition) => definition.keyword),
);
export const WG_EFFECT_SYNTAX = Object.freeze(
  [...EFFECT_REGISTRY.values()].flatMap((definition) =>
    Array.isArray(definition.syntax) ? definition.syntax : [definition.syntax],
  ),
);
export const WG_EFFECT_SYNTAX_WORDS = Object.freeze([
  ...new Set(WG_EFFECT_SYNTAX.flatMap((syntax) => syntax.split(/\s+/))),
]);

export function getWGEffectSpec(op) {
  return EFFECT_REGISTRY.get(op) || null;
}

export function validateWGEffectShape(effect, options = {}) {
  const fail = reporter(options);
  if (!isRecord(effect)) fail("WG effects must be objects");
  const definition = getWGEffectSpec(effect.op);
  if (!definition) fail(`Unknown WG effect '${String(effect.op)}'`);
  definition.validate(effect, fail);
  return effect;
}

export function validateWGEffectReferences(effect, catalog, options = {}) {
  const fail = reporter(options);
  validateWGEffectShape(effect, { fail });
  if (!isRecord(catalog)) fail("WG effect reference catalog must be an object");
  const definition = getWGEffectSpec(effect.op);
  definition.validateReferences?.(effect, catalog, fail);
  return effect;
}

export function supportsWGChange(op) {
  return typeof getWGEffectSpec(op)?.createFeedback === "function";
}

export function isWGEffectAllowedInChat(op) {
  return getWGEffectSpec(op)?.allowedInChat !== false;
}

export function createWGChangeFeedback(
  effect,
  catalog,
  customLabel = undefined,
  options = {},
) {
  const fail = reporter(options);
  validateWGEffectShape(effect, { fail });
  const definition = getWGEffectSpec(effect.op);
  if (typeof definition.createFeedback !== "function") {
    fail(`@change does not support '${String(effect.op)}'; use @effect for silent state changes`);
  }
  if (customLabel !== undefined && (typeof customLabel !== "string" || !customLabel.trim())) {
    fail("Change label cannot be empty");
  }
  const feedback = definition.createFeedback(effect, catalog, customLabel, fail);
  validateFeedback(feedback, effect, fail);
  return feedback;
}

export function materializeWGEffectFeedback(effect) {
  if (!effect?.feedback) return null;
  const definition = getWGEffectSpec(effect.op);
  return definition?.materializeFeedback
    ? definition.materializeFeedback(effect)
    : { ...effect.feedback };
}

export function hasImplicitWGSkillChange(effect) {
  return getWGEffectSpec(effect?.op)?.implicitSkillChange === true;
}
