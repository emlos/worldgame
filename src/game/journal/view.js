import { findWGNode } from "../../story/wg/shared/tree.js";
import { createWGRuntimeContext } from "../../story/wg/runtime/runtimeContext.js";
import { renderWGInterpolation, renderWGText } from "../../story/wg/runtime/textRuntime.js";
import {
  availableJournalChoices,
  currentActiveEntryPassage,
  journalDefinition,
  journalPassage,
  journalSessionForRender,
  selectedJournalNodes,
} from "./runtime.js";

function selectedInlineParts(parts, session) {
  const output = [];
  const visit = (children) => {
    for (const part of children || []) {
      if (part.type !== "inline-if") {
        output.push(part);
        continue;
      }
      const decision = session.decision(part);
      visit(decision < 0 ? part.elseParts || [] : part.branches[decision]?.parts || []);
    }
  };
  visit(parts);
  return output;
}

function renderParagraph(node, context, session) {
  return selectedInlineParts(node.parts, session).map((part) => {
    if (part.type === "text") return part.value;
    if (part.type === "break") return "\n";
    if (part.type === "interpolation") return renderWGInterpolation(part, context, node.source);
    return "";
  }).join("");
}

function passageProse(game, record, passage) {
  const context = createWGRuntimeContext(game, {
    locals: record.locals,
    additionalFlags: record.deferredFlags || [],
  });
  const session = journalSessionForRender(game, record, passage);
  return selectedJournalNodes(passage.body, session)
    .filter((node) => node.type === "paragraph")
    .map((node) => renderParagraph(node, context, session));
}

const TRAILING_CONTINUATION = /(?:\.\.\.|…)\s*$/u;
const LEADING_CONTINUATION = /^\s*(?:\.\.\.|…)\s*/u;

function joinContinuation(left, right) {
  if (!TRAILING_CONTINUATION.test(left) && !LEADING_CONTINUATION.test(right)) {
    return null;
  }
  const before = left.replace(TRAILING_CONTINUATION, "").trimEnd();
  const after = right.replace(LEADING_CONTINUATION, "").trimStart();
  return `${before}${before && after ? " " : ""}${after}`;
}

function visitedPassages(record) {
  const definition = journalDefinition(record.definitionId);
  const passages = [definition.passages[0]];
  let passage = passages[0];
  for (const choiceId of record.choices) {
    const choice = findWGNode(
      passage.body,
      (node) => node.type === "choice" && node.id === choiceId,
    );
    if (!choice) throw new Error(`Journal: unknown saved choice '${choiceId}'`);
    passage = journalPassage(definition, choice.target.slice(1));
    passages.push(passage);
  }
  return passages;
}

export function renderJournalRecord(game, record) {
  const definition = journalDefinition(record.definitionId);
  const paragraphs = [];
  for (const passage of visitedPassages(record)) {
    const passageParagraphs = passageProse(game, record, passage);
    if (paragraphs.length && passageParagraphs.length) {
      const joined = joinContinuation(paragraphs.at(-1), passageParagraphs[0]);
      if (joined !== null) {
        paragraphs[paragraphs.length - 1] = joined;
        passageParagraphs.shift();
      }
    }
    paragraphs.push(...passageParagraphs);
  }
  return {
    definitionId: definition.id,
    paragraphs,
  };
}

function journalEntriesWrittenOn(game, date) {
  const day = date.toISOString().slice(0, 10);
  return game.journal.entries
    .filter((record) => record.writtenAt.slice(0, 10) === day)
    .map((record) => ({
      writtenAt: record.writtenAt,
      ...renderJournalRecord(game, record),
    }));
}

export function buildJournalWritingView(game, { limit = 5 } = {}) {
  const pageEntries = journalEntriesWrittenOn(game, game.now);
  if (!game.journal.activeEntry) {
    const context = createWGRuntimeContext(game);
    return {
      mode: "topics",
      pageEntries,
      topics: game.journal.pending.slice(0, limit).map((record) => {
        const definition = journalDefinition(record.definitionId);
        return {
          definitionId: record.definitionId,
          availableAt: record.availableAt,
          label: renderWGText(definition.prompt, context, definition.source),
        };
      }),
      activeEntry: null,
      choices: [],
      token: null,
    };
  }

  const activeEntry = game.journal.activeEntry;
  return {
    mode: "active",
    pageEntries,
    topics: [],
    activeEntry: renderJournalRecord(game, activeEntry),
    currentPassageId: currentActiveEntryPassage(activeEntry).id,
    choices: availableJournalChoices(game),
    token: {
      definitionId: activeEntry.definitionId,
      revision: activeEntry.choices.length,
    },
  };
}

export function buildJournalReadView(game) {
  const groups = new Map();
  for (const record of game.journal.entries) {
    const day = record.writtenAt.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push({
      writtenAt: record.writtenAt,
      ...renderJournalRecord(game, record),
    });
  }
  return {
    pages: [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, entries]) => ({ date, entries })),
  };
}
