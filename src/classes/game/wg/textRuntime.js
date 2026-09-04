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

function requireScalar(value, path, source) {
  if (value === undefined || value === null) {
    fail(`Interpolation path '${path}' has no value`, source);
  }
  if (
    !["string", "number", "boolean"].includes(typeof value) ||
    (typeof value === "number" && !Number.isFinite(value))
  ) {
    fail(`Interpolation path '${path}' is not scalar`, source);
  }
  return value;
}

function renderScalar(value, filters, source) {
  let rendered = String(value);
  for (const filter of filters || []) {
    if (filter === "cap") {
      rendered = rendered
        ? rendered[0].toUpperCase() + rendered.slice(1)
        : rendered;
    } else {
      fail(`Unknown interpolation filter '${String(filter)}'`, source);
    }
  }
  return rendered;
}

export function renderWGInterpolation(part, context, source) {
  const path = part.path?.join(".");
  const value = requireScalar(resolveWGPath(context, part.path), path, source);
  return renderScalar(value, part.filters, source);
}

/** Materialize compiler-produced display text such as labels and headings. */
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

/** Capture the scalar values used by selected, immutable prose. */
export function captureWGTextBindings(parts, context, source) {
  const bindings = {};
  for (const part of parts || []) {
    if (part?.type !== "interpolation") continue;
    const path = part.path?.join(".");
    bindings[path] = requireScalar(resolveWGPath(context, part.path), path, source);
  }
  return bindings;
}

/** Render previously selected prose from captured values rather than live state. */
export function renderWGSnapshottedParts(parts, bindings, source) {
  return (parts || []).map((part) => {
    if (part?.type === "text" && typeof part.value === "string") return part.value;
    if (part?.type === "break") return "\n";
    if (part?.type === "interpolation") {
      const path = part.path?.join(".");
      const value = requireScalar(bindings?.[path], path, source);
      return renderScalar(value, part.filters, source);
    }
    fail(`Unknown snapshotted text part '${String(part?.type)}'`, source);
  }).join("");
}
