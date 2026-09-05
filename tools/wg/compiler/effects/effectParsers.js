import { failWG, sourceLocation } from "../diagnostic.js";
import { parseExpression } from "../expressionParser.js";
import {
  supportsWGChange,
  validateWGEffectShape,
  WG_EFFECT_KEYWORDS,
} from "../../../../src/story/wg/shared/effects/registry.js";
import {
  WG_ID_PATTERN,
  WG_QUOTED_STRING_PATTERN,
  WG_SIMPLE_ID_PATTERN,
} from "../../../../src/story/wg/shared/language.js";

const ID_PATTERN = WG_ID_PATTERN;
const SIMPLE_ID_PATTERN = WG_SIMPLE_ID_PATTERN;
const RELATIONSHIP_TARGET_PATTERN = `(${SIMPLE_ID_PATTERN})\\.(${SIMPLE_ID_PATTERN})`;
const ID_REGEX = new RegExp(`^${ID_PATTERN}$`);
const QUOTED_PATTERN = WG_QUOTED_STRING_PATTERN;
const CHANGE_LABELS = new WeakMap();

function location(file, line) {
  return sourceLocation(file, line, 1);
}

function source(file, line) {
  return { file, line, column: 1 };
}

function parseQuotedString(value, at, label) {
  let parsed;
  try {
    parsed = JSON.parse(value.trim());
  } catch {
    failWG(`${label} must be a double-quoted string`, at);
  }
  if (typeof parsed !== "string") {
    failWG(`${label} must be a double-quoted string`, at);
  }
  if (!parsed.trim()) failWG(`${label} cannot be empty`, at);
  return parsed;
}

function effectParser(op, parse) {
  return Object.freeze({ op, parse });
}

function parseRelocate(argument, file, line, at) {
  if (argument === "relocate home") {
    return { op: "relocate", destination: { kind: "home" }, source: source(file, line) };
  }
  const match = argument.match(
    new RegExp(`^relocate\\s+nearest-place\\s+(${SIMPLE_ID_PATTERN})$`),
  );
  if (!match) failWG("Unknown or malformed @effect", at);
  return {
    op: "relocate",
    destination: { kind: "nearest-place", placeKey: match[1] },
    source: source(file, line),
  };
}

function parseContact(argument, file, line, at) {
  const match = argument.match(
    new RegExp(`^contact\\s+add\\s+(${QUOTED_PATTERN}|${ID_PATTERN})$`),
  );
  if (!match) failWG("Unknown or malformed @effect", at);
  const npcId = match[1].startsWith('"')
    ? parseQuotedString(match[1], at, "Contact")
    : match[1];
  if (!ID_REGEX.test(npcId)) failWG("Invalid contact NPC id", at);
  return { op: "contact", action: "add", npcId, source: source(file, line) };
}

function parseChat(argument, file, line, at) {
  const match = argument.match(new RegExp(`^chat\\s+start\\s+(${ID_PATTERN})$`));
  if (!match) failWG("Unknown or malformed @effect", at);
  return { op: "chat", action: "start", id: match[1], source: source(file, line) };
}

function parseReminder(argument, file, line, at) {
  const match = argument.match(
    new RegExp(`^reminder\\s+(add|clear)\\s+(${ID_PATTERN})$`),
  );
  if (!match) failWG("Unknown or malformed @effect", at);
  return {
    op: "reminder",
    action: match[1],
    id: match[2],
    source: source(file, line),
  };
}

function parseTimer(argument, file, line, at) {
  const match = argument.match(
    new RegExp(`^timer\\s+(start|restart|stop)\\s+(${ID_PATTERN})$`),
  );
  if (!match) failWG("Unknown or malformed @effect", at);
  return {
    op: "timer",
    action: match[1],
    id: match[2],
    source: source(file, line),
  };
}

function parseStoryMutation(argument, file, line, at, op) {
  const match = argument.match(
    new RegExp(`^${op}\\s+([A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)+)\\s+(.+)$`),
  );
  if (!match) failWG("Unknown or malformed @effect", at);
  const path = match[1].split(".");
  if (path[0] !== "story" || path.length < 2) {
    failWG(`@effect ${op} may only target story.*`, at);
  }
  return {
    op,
    path,
    value: parseExpression(match[2], at),
    source: source(file, line),
  };
}

function parseFlag(argument, file, line, at, op) {
  const match = argument.match(
    new RegExp(`^${op}\\s+(${ID_PATTERN})\\s+(true|false)$`),
  );
  if (!match) failWG("Unknown or malformed @effect", at);
  return {
    op,
    flag: match[1],
    value: match[2] === "true",
    source: source(file, line),
  };
}

function parseRelationship(argument, file, line, at) {
  const match = argument.match(
    new RegExp(`^relationship\\s+${RELATIONSHIP_TARGET_PATTERN}\\s+([+-]?\\d+(?:\\.\\d+)?)$`),
  );
  if (!match) failWG("Unknown or malformed @effect", at);
  return {
    op: "relationship",
    npcId: match[1],
    meterId: match[2],
    amount: Number(match[3]),
    source: source(file, line),
  };
}

function parseAmountEffect(argument, file, line, at, op) {
  const match = argument.match(
    new RegExp(`^${op}\\s+([+-]?\\d+(?:\\.\\d+)?)$`),
  );
  if (!match) failWG("Unknown or malformed @effect", at);
  return { op, amount: Number(match[1]), source: source(file, line) };
}

function parseIdAmountEffect(argument, file, line, at, op) {
  const match = argument.match(
    new RegExp(`^${op}\\s+(${ID_PATTERN})\\s+([+-]?\\d+(?:\\.\\d+)?)$`),
  );
  if (!match) failWG("Unknown or malformed @effect", at);
  return {
    op,
    id: match[1],
    amount: Number(match[2]),
    source: source(file, line),
  };
}

function parseUnlock(argument, file, line, at) {
  const match = argument.match(
    new RegExp(`^unlock\\s+place\\s+(${SIMPLE_ID_PATTERN})$`),
  );
  if (!match) failWG("Expected @effect unlock place <place-key>", at);
  return { op: "unlock-place", placeKey: match[1], source: source(file, line) };
}

const EFFECT_PARSERS = new Map([
  ["relocate", effectParser("relocate", parseRelocate)],
  ["contact", effectParser("contact", parseContact)],
  ["chat", effectParser("chat", parseChat)],
  ["reminder", effectParser("reminder", parseReminder)],
  ["timer", effectParser("timer", parseTimer)],
  ["set", effectParser("set", (argument, file, line, at) =>
    parseStoryMutation(argument, file, line, at, "set"))],
  ["add", effectParser("add", (argument, file, line, at) =>
    parseStoryMutation(argument, file, line, at, "add"))],
  ["flag", effectParser("flag", (argument, file, line, at) =>
    parseFlag(argument, file, line, at, "flag"))],
  ["daily-flag", effectParser("daily-flag", (argument, file, line, at) =>
    parseFlag(argument, file, line, at, "daily-flag"))],
  ["relationship", effectParser("relationship", parseRelationship)],
  ["money", effectParser("money", (argument, file, line, at) =>
    parseAmountEffect(argument, file, line, at, "money"))],
  ["skill", effectParser("skill", (argument, file, line, at) =>
    parseIdAmountEffect(argument, file, line, at, "skill"))],
  ["stat", effectParser("stat", (argument, file, line, at) =>
    parseIdAmountEffect(argument, file, line, at, "stat"))],
  ["grade", effectParser("grade", (argument, file, line, at) =>
    parseIdAmountEffect(argument, file, line, at, "grade"))],
  ["attendance", effectParser("attendance", (argument, file, line, at) =>
    parseIdAmountEffect(argument, file, line, at, "attendance"))],
  ["unlock", effectParser("unlock-place", parseUnlock)],
]);

for (const keyword of WG_EFFECT_KEYWORDS) {
  if (!EFFECT_PARSERS.has(keyword)) {
    throw new Error(`WG effect keyword '${keyword}' has no compiler parser`);
  }
}
for (const keyword of EFFECT_PARSERS.keys()) {
  if (!WG_EFFECT_KEYWORDS.includes(keyword)) {
    throw new Error(`WG effect parser '${keyword}' has no language specification`);
  }
}

export const WG_EFFECT_PARSER_OPS = Object.freeze(
  [...new Set([...EFFECT_PARSERS.values()].map((parser) => parser.op))],
);
export const WG_EFFECT_PARSER_KEYWORDS = Object.freeze([...EFFECT_PARSERS.keys()]);

function directiveArgument(text, directive, at) {
  const prefix = `@${directive}`;
  const argument = text.slice(prefix.length).trim();
  if (!argument) failWG(`@${directive} requires a value`, at);
  return argument;
}

export function parseWGEffectDirective(text, file, line) {
  const at = location(file, line);
  const argument = directiveArgument(text, "effect", at);
  const keyword = argument.match(/^([a-z][a-z-]*)/)?.[1];
  const parser = EFFECT_PARSERS.get(keyword);
  if (!parser) failWG("Unknown or malformed @effect", at);
  const effect = parser.parse(argument, file, line, at);
  validateWGEffectShape(effect, { fail: (message) => failWG(message, at) });
  return effect;
}

export function parseWGChangeDirective(text, file, line) {
  const at = location(file, line);
  const argument = directiveArgument(text, "change", at);
  const labelMatch = argument.match(
    new RegExp(`^(.*\\S)\\s+(${QUOTED_PATTERN})\\s*$`),
  );
  const effectArgument = labelMatch ? labelMatch[1] : argument;
  const effect = parseWGEffectDirective(`@effect ${effectArgument}`, file, line);
  if (!supportsWGChange(effect.op)) {
    failWG(
      `@change does not support '${String(effect.op)}'; use @effect for silent state changes`,
      at,
    );
  }
  const customLabel = labelMatch
    ? parseQuotedString(labelMatch[2], at, "Change label")
    : undefined;
  CHANGE_LABELS.set(effect, customLabel);
  return effect;
}

export function isParsedWGChange(effect) {
  return CHANGE_LABELS.has(effect);
}

export function parsedWGChangeLabel(effect) {
  return CHANGE_LABELS.get(effect);
}
