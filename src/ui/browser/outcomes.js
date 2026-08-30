import { STATS } from "../../data/player/stats.js";

export const OUTCOME = Object.freeze({
  VERY_GOOD: "very-good",
  OK: "ok",
  WARNING: "warning",
  BAD: "bad",
  DIRE: "dire",
});

const MARKER_PATTERN =
  /\[(very(?:[-_ ]?good)|good|ok|warning|bad|dire)\]([\s\S]*?)\[\/\1\]/gi;

function canonicalOutcomeTag(tag) {
  const compact = String(tag).toLowerCase().replace(/[-_\s]/g, "");
  return compact === "good" || compact === "verygood"
    ? OUTCOME.VERY_GOOD
    : compact;
}

/** Map a bounded value to the shared player-facing outcome scale. */
export function outcomeForRange(
  value,
  min,
  max,
  { lowerIsBetter = false } = {},
) {
  const number = Number(value);
  const lower = Number(min);
  const upper = Number(max);
  if (
    !Number.isFinite(number) ||
    !Number.isFinite(lower) ||
    !Number.isFinite(upper) ||
    upper <= lower
  ) {
    return OUTCOME.OK;
  }

  let fraction = Math.max(0, Math.min(1, (number - lower) / (upper - lower)));
  if (lowerIsBetter) fraction = 1 - fraction;

  if (fraction >= 0.8) return OUTCOME.VERY_GOOD;
  if (fraction >= 0.5) return OUTCOME.OK;
  if (fraction >= 0.35) return OUTCOME.WARNING;
  if (fraction >= 0.2) return OUTCOME.BAD;
  return OUTCOME.DIRE;
}

export function outcomeForRelationship(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value === 0) return OUTCOME.OK;
  if (value > 0) return OUTCOME.VERY_GOOD;
  if (value > -0.35) return OUTCOME.WARNING;
  if (value > -0.7) return OUTCOME.BAD;
  return OUTCOME.DIRE;
}

/** Colour feedback by whether a change helps, independently of its label. */
export function outcomeForChange({ type, statId, amount }) {
  if (!Number.isFinite(amount) || amount === 0) return OUTCOME.OK;

  // @change identifies its stat separately; @preview uses the stat as its type.
  const definition = STATS[type === "stat" ? statId : type];
  const beneficial = definition?.higherIsBetter === false ? amount < 0 : amount > 0;
  return beneficial ? OUTCOME.VERY_GOOD : OUTCOME.BAD;
}

/**
 * Split passage prose into plain and outcome-coloured runs.
 *
 * Supported markers are [good], [very-good], [ok], [warning], [bad], and
 * [dire]. Unclosed or mismatched markers remain ordinary visible text.
 */
export function parseOutcomeText(value) {
  const source = String(value ?? "");
  const segments = [];
  let cursor = 0;

  for (const match of source.matchAll(MARKER_PATTERN)) {
    if (match.index > cursor) {
      segments.push({ text: source.slice(cursor, match.index), outcome: null });
    }
    segments.push({
      text: match[2],
      outcome: canonicalOutcomeTag(match[1]),
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length || segments.length === 0) {
    segments.push({ text: source.slice(cursor), outcome: null });
  }
  return segments;
}

/** Render outcome markers without turning passage text into executable HTML. */
export function setOutcomeText(element, value) {
  if (!element?.ownerDocument) {
    throw new TypeError("setOutcomeText requires a DOM element");
  }

  const textNodes = (text) => text.split("\n").flatMap((line, index) => [
    ...(index ? [element.ownerDocument.createElement("br")] : []),
    element.ownerDocument.createTextNode(line),
  ]);
  const nodes = parseOutcomeText(value).flatMap((segment) => {
    if (!segment.outcome) {
      return textNodes(segment.text);
    }
    const span = element.ownerDocument.createElement("span");
    span.className = "outcome-text";
    span.dataset.outcome = segment.outcome;
    span.append(...textNodes(segment.text));
    return span;
  });
  element.replaceChildren(...nodes);
  return element;
}
