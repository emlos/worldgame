import { findWGNode } from "../../story/wg/shared/tree.js";
import { createWGRuntimeContext } from "../../story/wg/runtime/runtimeContext.js";
import { renderWGInterpolation, renderWGText } from "../../story/wg/runtime/textRuntime.js";
import {
  availableJournalChoices,
  currentDraftPassage,
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
  const context = createWGRuntimeContext(game, { locals: record.locals });
  const session = journalSessionForRender(game, record);
  return selectedJournalNodes(passage.body, session)
    .filter((node) => node.type === "paragraph")
    .map((node) => renderParagraph(node, context, session));
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
  const context = createWGRuntimeContext(game, { locals: record.locals });
  const definition = journalDefinition(record.definitionId);
  return {
    definitionId: definition.id,
    title: renderWGText(definition.prompt, context, definition.source),
    paragraphs: visitedPassages(record).flatMap((passage) =>
      passageProse(game, record, passage)),
  };
}

export function buildJournalWritingView(game, { limit = 5 } = {}) {
  if (!game.journal.draft) {
    const context = createWGRuntimeContext(game);
    return {
      mode: "topics",
      topics: game.journal.pending.slice(0, limit).map((record) => {
        const definition = journalDefinition(record.definitionId);
        return {
          definitionId: record.definitionId,
          availableAt: record.availableAt,
          label: renderWGText(definition.prompt, context, definition.source),
        };
      }),
      draft: null,
      choices: [],
      token: null,
    };
  }

  const draft = game.journal.draft;
  return {
    mode: "draft",
    topics: [],
    draft: renderJournalRecord(game, draft),
    currentPassageId: currentDraftPassage(draft).id,
    choices: availableJournalChoices(game),
    token: {
      definitionId: draft.definitionId,
      revision: draft.choices.length,
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
