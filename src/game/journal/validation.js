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

function selectedNodes(nodes, passage, decisions, path) {
  const selected = [];
  const visit = (children) => {
    for (const node of children || []) {
      if (node.type === "if" || node.type === "random") {
        const decision = requiredDecision(decisions, passage, node, path);
        const branch = node.type === "if"
          ? (decision < 0 ? node.elseNodes || [] : node.branches[decision]?.nodes || [])
          : node.variants[decision] || [];
        visit(branch);
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

function validateChoices(value, journal, decisions, path, decisionsPath) {
  const choices = saveArray(value, path);
  let passage = journal.passages[0];
  const visitedPassages = [passage];
  const selectedChoices = [];
  choices.forEach((choiceId, index) => {
    const choicePath = `${path}[${index}]`;
    saveString(choiceId, choicePath, { nonEmpty: true });
    const choice = selectedNodes(passage.body, passage, decisions, decisionsPath)
      .find((node) => node.type === "choice" && node.id === choiceId);
    if (!choice) {
      const exists = findWGNode(
        passage.body,
        (node) => node.type === "choice" && node.id === choiceId,
      );
      failSave(
        choicePath,
        exists
          ? `is not selected by the saved decisions in passage '${passage.id}'`
          : `is not a choice in passage '${passage.id}'`,
      );
    }
    selectedChoices.push(choice);
    const target = choice.target?.slice(1);
    passage = journal.passages.find((candidate) => candidate.id === target);
    if (!passage) failSave(choicePath, `targets unknown journal passage '${target}'`);
    visitedPassages.push(passage);
  });
  return { finalPassage: passage, visitedPassages, selectedChoices };
}

function requiredDecision(decisions, passage, node, path, used = null) {
  const key = journalDecisionKey(passage.id, node);
  if (!Object.hasOwn(decisions, key)) {
    failSave(`${path}.${key}`, "is missing a required journal decision");
  }
  used?.add(key);
  return decisions[key];
}

function requireSelectedInlineDecisions(parts, passage, decisions, path, used) {
  for (const part of parts || []) {
    if (part.type !== "inline-if") continue;
    const decision = requiredDecision(decisions, passage, part, path, used);
    const selected = decision < 0
      ? part.elseParts || []
      : part.branches[decision]?.parts || [];
    requireSelectedInlineDecisions(selected, passage, decisions, path, used);
  }
}

function requireSelectedDecisions(nodes, passage, decisions, path, used) {
  for (const node of nodes || []) {
    if (node.type === "if") {
      const decision = requiredDecision(decisions, passage, node, path, used);
      const selected = decision < 0
        ? node.elseNodes || []
        : node.branches[decision]?.nodes || [];
      requireSelectedDecisions(selected, passage, decisions, path, used);
    } else if (node.type === "random") {
      const decision = requiredDecision(decisions, passage, node, path, used);
      requireSelectedDecisions(node.variants[decision] || [], passage, decisions, path, used);
    } else if (node.type === "choice-group") {
      requireSelectedDecisions(node.nodes, passage, decisions, path, used);
    } else if (node.type === "paragraph") {
      requireSelectedInlineDecisions(node.parts, passage, decisions, path, used);
    }
  }
}

function validateDecisions(value, journal, path) {
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
  return decisions;
}

function selectedPathEffects(visitedPassages, selectedChoices, decisions, decisionsPath) {
  const effects = [];
  visitedPassages.forEach((passage, index) => {
    for (const node of selectedNodes(passage.body, passage, decisions, decisionsPath)) {
      if (node.type === "effect") effects.push(node.effect);
    }
    if (index < selectedChoices.length) effects.push(...(selectedChoices[index].effects || []));
  });
  return effects;
}

function validateDeferredFlags(value, effects, path) {
  const expected = [...new Set(effects
    .filter((effect) => effect.op === "set" && effect.path?.[0] === "flags")
    .map((effect) => effect.path.slice(1).join(".")))];
  const flags = saveUniqueStrings(value, path, { nonEmpty: true });
  for (const flag of flags) {
    if (!expected.includes(flag)) {
      failSave(path, `contains journal flag '${flag}' not produced by the selected path`);
    }
  }
  for (const flag of expected) {
    if (!flags.has(flag)) failSave(path, `is missing selected journal flag '${flag}'`);
  }
}

function localLeafPaths(value, prefix = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  const entries = Object.entries(value);
  if (!entries.length) return prefix.length ? [prefix] : [];
  return entries.flatMap(([key, child]) => localLeafPaths(child, [...prefix, key]));
}

function requireExactDecisionSet(visitedPassages, decisions, path) {
  const used = new Set();
  for (const passage of visitedPassages) {
    requireSelectedDecisions(passage.body, passage, decisions, path, used);
  }
  for (const key of Object.keys(decisions)) {
    if (!used.has(key)) failSave(`${path}.${key}`, "is not used by the selected journal path");
  }
}

function validateLocals(value, effects, path) {
  validateJsonValue(value, path);
  const locals = saveRecord(value, path);
  const mutationPaths = effects
    .filter((effect) => ["set", "add"].includes(effect.op) && effect.path?.[0] === "local")
    .map((effect) => effect.path.slice(1));

  for (const leaf of localLeafPaths(locals)) {
    const produced = mutationPaths.some((mutation) =>
      mutation.length <= leaf.length && mutation.every((segment, index) => leaf[index] === segment));
    if (!produced) {
      failSave(
        `${path}${leaf.map((segment) => `.${segment}`).join("")}`,
        "was not produced by a local effect on the selected journal path",
      );
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
  const decisionsPath = `${path}.decisions`;
  const decisions = validateDecisions(record.decisions, journal, decisionsPath);
  const { finalPassage, visitedPassages, selectedChoices } = validateChoices(
    record.choices,
    journal,
    decisions,
    `${path}.choices`,
    decisionsPath,
  );
  if (finalPassage.body.at(-1)?.type === "finish") {
    failSave(`${path}.choices`, "already reaches a completed journal passage");
  }
  requireExactDecisionSet(visitedPassages, decisions, decisionsPath);
  const effects = selectedPathEffects(
    visitedPassages,
    selectedChoices,
    decisions,
    decisionsPath,
  );
  validateLocals(record.locals, effects, `${path}.locals`);
  validateDeferredFlags(record.deferredFlags, effects, `${path}.deferredFlags`);
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
  const decisionsPath = `${path}.decisions`;
  const decisions = validateDecisions(record.decisions, journal, decisionsPath);
  const { finalPassage, visitedPassages, selectedChoices } = validateChoices(
    record.choices,
    journal,
    decisions,
    `${path}.choices`,
    decisionsPath,
  );
  if (finalPassage.body.at(-1)?.type !== "finish") {
    failSave(`${path}.choices`, "does not reach a completed journal passage");
  }
  requireExactDecisionSet(visitedPassages, decisions, decisionsPath);
  validateLocals(
    record.locals,
    selectedPathEffects(visitedPassages, selectedChoices, decisions, decisionsPath),
    `${path}.locals`,
  );
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
