import { WG_BUNDLE } from "../../story/wg/generated/scenes.js";
import { collectWGNodes, findWGNode } from "../../story/wg/shared/tree.js";
import {
  failSave,
  requiredSaveField,
  saveArray,
  saveDateMilliseconds,
  saveRecord,
  saveString,
  saveUniqueStrings,
  validateJsonValue,
} from "../../shared/util/saveValidation.js";
import { journalDecisionKey } from "./decisionKey.js";

function exactFields(record, allowed, path) {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) failSave(`${path}.${key}`, "is not a valid journal field");
  }
  for (const key of allowed) requiredSaveField(record, key, path);
}

function isoDate(value, path, gameTime) {
  const timestamp = saveDateMilliseconds(value, path);
  if (new Date(timestamp).toISOString() !== value) failSave(path, "must be a canonical ISO date");
  if (timestamp > gameTime) failSave(path, "cannot be after the game clock");
  return timestamp;
}

function definition(id, path) {
  const value = WG_BUNDLE.journals?.[id];
  if (!value) failSave(path, `references unknown journal definition '${id}'`);
  return value;
}

function validateChoices(value, journal, path) {
  const choices = saveArray(value, path);
  let passage = journal.passages[0];
  const visitedPassages = [passage];
  choices.forEach((choiceId, index) => {
    const choicePath = `${path}[${index}]`;
    saveString(choiceId, choicePath, { nonEmpty: true });
    const choice = findWGNode(
      passage.body,
      (node) => node.type === "choice" && node.id === choiceId,
    );
    if (!choice) failSave(choicePath, `is not a choice in passage '${passage.id}'`);
    const target = choice.target?.slice(1);
    passage = journal.passages.find((candidate) => candidate.id === target);
    if (!passage) failSave(choicePath, `targets unknown journal passage '${target}'`);
    visitedPassages.push(passage);
  });
  return { finalPassage: passage, visitedPassages };
}

function requiredDecision(decisions, passage, node, path) {
  const key = journalDecisionKey(passage.id, node);
  if (!Object.hasOwn(decisions, key)) {
    failSave(`${path}.${key}`, "is missing a required journal decision");
  }
  return decisions[key];
}

function requireSelectedInlineDecisions(parts, passage, decisions, path) {
  for (const part of parts || []) {
    if (part.type !== "inline-if") continue;
    const decision = requiredDecision(decisions, passage, part, path);
    const selected = decision < 0
      ? part.elseParts || []
      : part.branches[decision]?.parts || [];
    requireSelectedInlineDecisions(selected, passage, decisions, path);
  }
}

function requireSelectedDecisions(nodes, passage, decisions, path) {
  for (const node of nodes || []) {
    if (node.type === "if") {
      const decision = requiredDecision(decisions, passage, node, path);
      const selected = decision < 0
        ? node.elseNodes || []
        : node.branches[decision]?.nodes || [];
      requireSelectedDecisions(selected, passage, decisions, path);
    } else if (node.type === "random") {
      const decision = requiredDecision(decisions, passage, node, path);
      requireSelectedDecisions(node.variants[decision] || [], passage, decisions, path);
    } else if (node.type === "choice-group") {
      requireSelectedDecisions(node.nodes, passage, decisions, path);
    } else if (node.type === "paragraph") {
      requireSelectedInlineDecisions(node.parts, passage, decisions, path);
    }
  }
}

function validateDecisions(value, journal, visitedPassages, path) {
  const decisions = saveRecord(value, path);
  const decisionNodes = new Map();
  for (const passage of journal.passages) {
    for (const node of collectWGNodes(
      passage.body,
      (candidate) => ["if", "inline-if", "random"].includes(candidate.type),
    )) {
      decisionNodes.set(journalDecisionKey(passage.id, node), node);
    }
  }
  for (const [key, decision] of Object.entries(decisions)) {
    const node = decisionNodes.get(key);
    if (!node) failSave(`${path}.${key}`, "references an unknown journal decision");
    if (node.type === "random") {
      if (!Number.isInteger(decision) || decision < 0 || decision >= node.variants.length) {
        failSave(`${path}.${key}`, "has an invalid random alternative");
      }
    } else if (
      !Number.isInteger(decision) ||
      decision < -1 ||
      decision >= (node.branches || []).length
    ) {
      failSave(`${path}.${key}`, "has an invalid conditional branch");
    }
  }
  for (const passage of visitedPassages) {
    requireSelectedDecisions(passage.body, passage, decisions, path);
  }
}

function validateDeferredFlags(value, journal, path) {
  const allowed = new Set();
  for (const passage of journal.passages) {
    for (const node of collectWGNodes(passage.body)) {
      const effects = node.type === "effect" ? [node.effect] : node.effects || [];
      for (const effect of effects) {
        if (effect.op === "set" && effect.path?.[0] === "flags") {
          allowed.add(effect.path.slice(1).join("."));
        }
      }
    }
  }

  const flags = saveUniqueStrings(value, path, { nonEmpty: true });
  for (const flag of flags) {
    if (!flag.startsWith("journal.") || !allowed.has(flag)) {
      failSave(path, `references journal flag '${flag}' not set by this definition`);
    }
  }
}

function validatePending(recordData, path, gameTime) {
  const record = saveRecord(recordData, path);
  exactFields(record, ["definitionId", "availableAt"], path);
  const id = saveString(record.definitionId, `${path}.definitionId`, { nonEmpty: true });
  definition(id, `${path}.definitionId`);
  isoDate(record.availableAt, `${path}.availableAt`, gameTime);
  return id;
}

function validateDraft(recordData, path, gameTime) {
  const record = saveRecord(recordData, path);
  exactFields(
    record,
    [
      "definitionId",
      "availableAt",
      "startedAt",
      "choices",
      "locals",
      "decisions",
      "deferredFlags",
    ],
    path,
  );
  const id = saveString(record.definitionId, `${path}.definitionId`, { nonEmpty: true });
  const journal = definition(id, `${path}.definitionId`);
  const availableAt = isoDate(record.availableAt, `${path}.availableAt`, gameTime);
  const startedAt = isoDate(record.startedAt, `${path}.startedAt`, gameTime);
  if (startedAt < availableAt) failSave(`${path}.startedAt`, "cannot precede journal availability");
  const { finalPassage, visitedPassages } = validateChoices(
    record.choices,
    journal,
    `${path}.choices`,
  );
  if (finalPassage.body.at(-1)?.type === "finish") {
    failSave(`${path}.choices`, "already reaches a completed journal passage");
  }
  validateJsonValue(record.locals, `${path}.locals`);
  saveRecord(record.locals, `${path}.locals`);
  validateDecisions(record.decisions, journal, visitedPassages, `${path}.decisions`);
  validateDeferredFlags(record.deferredFlags, journal, `${path}.deferredFlags`);
  return id;
}

function validateEntry(recordData, path, gameTime) {
  const record = saveRecord(recordData, path);
  exactFields(
    record,
    ["definitionId", "availableAt", "writtenAt", "choices", "locals", "decisions"],
    path,
  );
  const id = saveString(record.definitionId, `${path}.definitionId`, { nonEmpty: true });
  const journal = definition(id, `${path}.definitionId`);
  const availableAt = isoDate(record.availableAt, `${path}.availableAt`, gameTime);
  const writtenAt = isoDate(record.writtenAt, `${path}.writtenAt`, gameTime);
  if (writtenAt < availableAt) failSave(`${path}.writtenAt`, "cannot precede journal availability");
  const { finalPassage, visitedPassages } = validateChoices(
    record.choices,
    journal,
    `${path}.choices`,
  );
  if (finalPassage.body.at(-1)?.type !== "finish") {
    failSave(`${path}.choices`, "does not reach a completed journal passage");
  }
  validateJsonValue(record.locals, `${path}.locals`);
  saveRecord(record.locals, `${path}.locals`);
  validateDecisions(record.decisions, journal, visitedPassages, `${path}.decisions`);
  return id;
}

export function validateJournalState(value, { path = "save.journal", gameTime } = {}) {
  const state = saveRecord(value, path);
  exactFields(state, ["pending", "draft", "entries", "dismissed"], path);
  const ids = [];
  saveArray(state.pending, `${path}.pending`).forEach((record, index) => {
    ids.push(validatePending(record, `${path}.pending[${index}]`, gameTime));
  });
  if (state.draft !== null) ids.push(validateDraft(state.draft, `${path}.draft`, gameTime));
  saveArray(state.entries, `${path}.entries`).forEach((record, index) => {
    ids.push(validateEntry(record, `${path}.entries[${index}]`, gameTime));
  });
  saveUniqueStrings(state.dismissed, `${path}.dismissed`, { nonEmpty: true });
  state.dismissed.forEach((id, index) => {
    definition(id, `${path}.dismissed[${index}]`);
    ids.push(id);
  });
  saveUniqueStrings(ids, `${path} definition ids`, { nonEmpty: true });
  return state;
}
