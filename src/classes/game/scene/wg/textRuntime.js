import { resolveWGPath } from "./expressionEvaluator.js";

export class WGTextRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGTextRuntimeError";
  }
}

function sourceSuffix(source) {
  if (!source?.file) return "";
  return ` (${source.file}:${source.line || 1}:${source.column || 1})`;
}

function fail(message, source) {
  throw new WGTextRuntimeError(`${message}${sourceSuffix(source)}`);
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function renderWGInterpolation(part, context, source) {
  let value = resolveWGPath(context, part.path);
  if (value === undefined || value === null) {
    fail(`Interpolation path '${part.path?.join(".")}' has no value`, source);
  }
  if (!["string", "number", "boolean"].includes(typeof value)) {
    fail(`Interpolation path '${part.path?.join(".")}' is not scalar`, source);
  }

  value = String(value);
  for (const filter of part.filters || []) {
    if (filter === "cap") value = capitalize(value);
    else fail(`Unknown interpolation filter '${String(filter)}'`, source);
  }
  return value;
}

/** Materialize compiler-produced display text while preserving outcome markers. */
export function renderWGText(parts, context, source) {
  if (!Array.isArray(parts) || !parts.length) {
    fail("Display text parts must be a non-empty array", source);
  }
  return parts.map((part) => {
    if (part?.type === "text" && typeof part.value === "string") return part.value;
    if (part?.type === "interpolation") {
      return renderWGInterpolation(part, context, source);
    }
    fail(`Unknown display text part '${String(part?.type)}'`, source);
  }).join("");
}
