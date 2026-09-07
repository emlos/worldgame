import { keyedRandom01 } from "../../shared/util/random.js";
import { WG_BUNDLE } from "../../story/wg/generated/scenes.js";
import { findWGNode } from "../../story/wg/shared/tree.js";
import { applyWGEffects } from "../../story/wg/runtime/effectRuntime.js";
import { evaluateWGExpression } from "../../story/wg/runtime/expressionEvaluator.js";
import { createWGRuntimeContext } from "../../story/wg/runtime/runtimeContext.js";
import { renderWGText } from "../../story/wg/runtime/textRuntime.js";
import { journalDecisionKey } from "./decisionKey.js";

export const journalFail = (message) => { throw new Error(`Journal: ${message}`); };
export const journalDefinition = (id) =>
  WG_BUNDLE.journals?.[id] || journalFail(`unknown journal definition '${id}'`);
export const journalPassage = (journal, id) =>
  journal.passages.find((passage) => passage.id === id) ||
  journalFail(`unknown journal passage '${id}'`);

export function createJournalState() {
  return { pending: [], draft: null, entries: [], dismissed: [] };
}

function journalRecordIds(state) {
  return new Set([
    ...state.pending.map((record) => record.definitionId),
    ...(state.draft ? [state.draft.definitionId] : []),
    ...state.entries.map((record) => record.definitionId),
    ...state.dismissed,
  ]);
}

function journalSourceOrdinal(definitionId) {
  const match = /^journal-(\d+)$/.exec(definitionId);
  if (!match) journalFail(`invalid generated journal id '${definitionId}'`);
  return Number(match[1]);
}

export function compareJournalBacklogRecords(left, right) {
  return left.availableAt.localeCompare(right.availableAt) ||
    journalSourceOrdinal(left.definitionId) - journalSourceOrdinal(right.definitionId);
}

export function refreshJournalAvailability(game) {
  const known = journalRecordIds(game.journal);
  const context = createWGRuntimeContext(game);
  for (const definition of Object.values(WG_BUNDLE.journals || {})) {
    if (known.has(definition.id)) continue;
    if ((definition.conditions || []).every((condition) =>
      Boolean(evaluateWGExpression(condition, context)))) {
      game.journal.pending.push({
        definitionId: definition.id,
        availableAt: game.now.toISOString(),
      });
      known.add(definition.id);
    }
  }
  game.journal.pending.sort(compareJournalBacklogRecords);
  return game.journal.pending;
}

export function canWriteJournal(game) {
  return game.currentLocationId === game.homeLocationId &&
    game.currentPlaceId === game.homePlaceId &&
    Number(game.story?.home?.unpack || 0) >= 5;
}

function journalDecisionSession(game, record, passage, { recordDecisions = false } = {}) {
  const context = () => createWGRuntimeContext(game, {
    locals: record.locals,
    additionalFlags: record.deferredFlags || [],
  });
  return {
    decision(node) {
      const key = journalDecisionKey(passage.id, node);
      if (Object.hasOwn(record.decisions, key)) return record.decisions[key];
      if (!recordDecisions) {
        journalFail(`saved record is missing structural decision '${key}'`);
      }

      let value;
      if (node.type === "if" || node.type === "inline-if") {
        value = (node.branches || []).findIndex((branch) =>
          Boolean(evaluateWGExpression(branch.test, context())));
      } else if (node.type === "random") {
        value = Math.floor(keyedRandom01(
          game.seed,
          ["journal", record.definitionId, record.availableAt, key].join(":"),
        ) * node.variants.length);
      } else {
        journalFail(`unsupported decision node '${node.type}'`);
      }

      record.decisions[key] = value;
      return value;
    },
  };
}

function captureSelectedInlineDecisions(parts, session) {
  for (const part of parts || []) {
    if (part.type !== "inline-if") continue;
    const decision = session.decision(part);
    const selected = decision < 0
      ? part.elseParts || []
      : part.branches[decision]?.parts || [];
    captureSelectedInlineDecisions(selected, session);
  }
}

function applyJournalEffects(game, draft, effects) {
  for (const effect of effects || []) {
    if (effect.op === "set" && effect.path?.[0] === "flags") {
      const flag = effect.path.slice(1).join(".");
      if (!draft.deferredFlags.includes(flag)) draft.deferredFlags.push(flag);
      continue;
    }
    applyWGEffects(game, [effect], {
      locals: draft.locals,
      additionalFlags: draft.deferredFlags,
    });
  }
}

function selectedBranch(node, session) {
  const decision = session.decision(node);
  if (node.type === "if") {
    return decision < 0 ? node.elseNodes || [] : node.branches[decision]?.nodes || [];
  }
  if (node.type === "random") return node.variants[decision] || [];
  journalFail(`unsupported branch node '${node.type}'`);
}

export function selectedJournalNodes(nodes, session) {
  const selected = [];
  const visit = (children) => {
    for (const node of children || []) {
      if (node.type === "if" || node.type === "random") {
        visit(selectedBranch(node, session));
      } else if (node.type === "choice-group") {
        visit(node.nodes);
      } else {
        selected.push(node);
      }
    }
  };
  visit(nodes);
  return selected;
}

function enterDraftPassage(game, draft) {
  const definition = journalDefinition(draft.definitionId);
  const passage = currentDraftPassage(draft);
  const session = journalDecisionSession(game, draft, passage, { recordDecisions: true });
  for (const node of selectedJournalNodes(passage.body, session)) {
    if (node.type === "paragraph") {
      captureSelectedInlineDecisions(node.parts, session);
    }
    if (node.type === "effect") {
      applyJournalEffects(game, draft, [node.effect]);
    }
  }
  return definition;
}

export function currentDraftPassage(draft) {
  const definition = journalDefinition(draft.definitionId);
  let passage = definition.passages[0];
  for (const choiceId of draft.choices) {
    const choice = findWGNode(
      passage.body,
      (node) => node.type === "choice" && node.id === choiceId,
    );
    if (!choice) journalFail(`saved draft references unknown choice '${choiceId}'`);
    passage = journalPassage(definition, choice.target.slice(1));
  }
  return passage;
}

function prepareJournalDraftStart(game, definitionId) {
  if (!canWriteJournal(game)) journalFail("journal writing is only available at your desk at home");
  if (game.journal.draft) journalFail("finish the current journal entry first");
  const pendingIndex = game.journal.pending.findIndex(
    (record) => record.definitionId === definitionId,
  );
  if (pendingIndex < 0) journalFail("that journal topic is no longer available");
  return pendingIndex;
}

function applyJournalDraftStart(game, definitionId, pendingIndex) {
  const pending = game.journal.pending.splice(pendingIndex, 1)[0];
  game.journal.draft = {
    definitionId,
    availableAt: pending.availableAt,
    startedAt: game.now.toISOString(),
    choices: [],
    locals: {},
    decisions: {},
    deferredFlags: [],
  };
  enterDraftPassage(game, game.journal.draft);
  finishDraftIfNeeded(game);
  return game.journal.draft;
}

export function startJournalDraftWithinAction(game, definitionId) {
  return applyJournalDraftStart(game, definitionId, prepareJournalDraftStart(game, definitionId));
}

export function startJournalDraft(game, definitionId) {
  const pendingIndex = prepareJournalDraftStart(game, definitionId);
  game.runAction({
    label: `journal:${definitionId}:start`,
    apply() {
      applyJournalDraftStart(game, definitionId, pendingIndex);
    },
  });
  return game.journal.draft;
}

function selectedChoice(game, draft, choiceId) {
  const passage = currentDraftPassage(draft);
  const session = journalDecisionSession(game, draft, passage, { recordDecisions: true });
  return selectedJournalNodes(passage.body, session)
    .find((node) => node.type === "choice" && node.id === choiceId) || null;
}

export function availableJournalChoices(game) {
  const draft = game.journal.draft;
  if (!draft) return [];
  const passage = currentDraftPassage(draft);
  const context = createWGRuntimeContext(game, {
    locals: draft.locals,
    additionalFlags: draft.deferredFlags,
  });
  const session = journalDecisionSession(game, draft, passage, { recordDecisions: true });
  return selectedJournalNodes(passage.body, session)
    .filter((node) => node.type === "choice")
    .filter((choice) => !choice.when || evaluateWGExpression(choice.when, context))
    .map((choice) => ({
      id: choice.id,
      label: renderWGText(choice.label, context, choice.source),
      disabledReason: (choice.requirements || [])
        .find((requirement) => !evaluateWGExpression(requirement.test, context))?.reason || null,
    }));
}

function finishDraftIfNeeded(game) {
  const draft = game.journal.draft;
  const passage = currentDraftPassage(draft);
  const session = journalDecisionSession(game, draft, passage, { recordDecisions: true });
  const selected = selectedJournalNodes(passage.body, session);
  const finished = selected.at(-1)?.type === "finish";
  if (!finished) return false;
  for (const flag of draft.deferredFlags) game.setFlag(flag);
  game.journal.entries.push({
    definitionId: draft.definitionId,
    availableAt: draft.availableAt,
    writtenAt: game.now.toISOString(),
    choices: [...draft.choices],
    locals: structuredClone(draft.locals),
    decisions: structuredClone(draft.decisions),
  });
  game.journal.draft = null;
  return true;
}

function prepareJournalChoice(game, { definitionId, revision, choiceId }) {
  if (!canWriteJournal(game)) journalFail("journal writing is only available at your desk at home");
  const draft = game.journal.draft;
  if (!draft || draft.definitionId !== definitionId || draft.choices.length !== revision) {
    journalFail("this journal choice is no longer available");
  }
  const offered = availableJournalChoices(game).find((choice) => choice.id === choiceId);
  if (!offered || offered.disabledReason) {
    journalFail(offered?.disabledReason || "this journal choice is not available");
  }
  const choice = selectedChoice(game, draft, choiceId);
  if (!choice) journalFail("this journal choice is not available");
  return { draft, choice };
}

function applyJournalChoice(game, draft, choice) {
  applyJournalEffects(game, draft, choice.effects || []);
  draft.choices.push(choice.id);
  enterDraftPassage(game, draft);
  finishDraftIfNeeded(game);
  return { finished: game.journal.draft === null };
}

export function chooseJournalOptionWithinAction(game, request) {
  const { draft, choice } = prepareJournalChoice(game, request);
  return applyJournalChoice(game, draft, choice);
}

export function chooseJournalOption(game, request) {
  const { draft, choice } = prepareJournalChoice(game, request);
  let result;
  game.runAction({
    label: `journal:${request.definitionId}:${request.choiceId}`,
    apply() {
      result = applyJournalChoice(game, draft, choice);
    },
  });
  return result;
}

function prepareJournalDraftDismissal(game) {
  if (!canWriteJournal(game)) journalFail("journal writing is only available at your desk at home");
  const draft = game.journal.draft;
  if (!draft) journalFail("there is no journal draft to dismiss");
  return draft;
}

function applyJournalDraftDismissal(game, draft) {
  game.journal.dismissed.push(draft.definitionId);
  game.journal.draft = null;
  return draft.definitionId;
}

export function dismissJournalDraftWithinAction(game) {
  return applyJournalDraftDismissal(game, prepareJournalDraftDismissal(game));
}

export function dismissJournalDraft(game) {
  const draft = prepareJournalDraftDismissal(game);
  let dismissedId;
  game.runAction({
    label: `journal:${draft.definitionId}:dismiss`,
    apply() {
      dismissedId = applyJournalDraftDismissal(game, draft);
    },
  });
  return dismissedId;
}

export function resumeJournalDraft(game) {
  if (!game.journal.draft) return null;
  if (!canWriteJournal(game)) journalFail("journal writing is only available at your desk at home");
  return game.journal.draft;
}

export function journalSessionForRender(game, record, passage) {
  return journalDecisionSession(game, record, passage, { recordDecisions: false });
}
