import { failWG } from "./diagnostic.js";
import { walkWGNodes } from "../../../src/story/wg/shared/tree.js";

function journalEffectAllowed(effect) {
  if (!effect || typeof effect !== "object") return false;
  if (effect.op === "add") return effect.path?.[0] === "local";
  if (effect.op !== "set") return false;
  if (effect.path?.[0] === "local") return true;
  return effect.path?.[0] === "flags" && effect.path?.[1] === "journal";
}

function contextFreeExpression(expression) {
  if (!expression || typeof expression !== "object" || Array.isArray(expression)) return false;
  if (expression.type === "literal") return true;
  if (expression.type === "list") {
    return Array.isArray(expression.values) && expression.values.every(contextFreeExpression);
  }
  if (expression.type === "unary") return contextFreeExpression(expression.value);
  if (expression.type === "binary") {
    return contextFreeExpression(expression.left) && contextFreeExpression(expression.right);
  }
  return false;
}

function validateEffects(node) {
  const effects = node.type === "effect" ? [node.effect] : node.effects || [];
  if (effects.some((effect) => !journalEffectAllowed(effect))) {
    failWG(
      "Journal entries may mutate only local.* values or set irreversible flags.journal.* flags",
      node.source,
    );
  }
  if (effects.some((effect) =>
    ["set", "add"].includes(effect.op) &&
    effect.path?.[0] === "local" &&
    !contextFreeExpression(effect.value))) {
    failWG(
      "Journal local effects require context-free values so saved locals can be validated exactly",
      node.source,
    );
  }
}

function validatePassageGraph(journal) {
  const passagesById = new Map(journal.passages.map((passage) => [passage.id, passage]));
  const targetsByPassage = new Map();
  const predecessorsByPassage = new Map(
    journal.passages.map((passage) => [passage.id, new Set()]),
  );
  const finishedPassages = new Set();

  for (const passage of journal.passages) {
    const targets = new Set();
    walkWGNodes(passage.body, (node) => {
      if (node.type === "choice") targets.add(node.target.slice(1));
    });
    targetsByPassage.set(passage.id, targets);
    for (const target of targets) predecessorsByPassage.get(target).add(passage.id);
    if (passage.body.at(-1)?.type === "finish") finishedPassages.add(passage.id);
  }

  const entryPassage = journal.passages[0];
  const reachable = new Set([entryPassage.id]);
  const pending = [entryPassage.id];
  while (pending.length) {
    const passageId = pending.pop();
    for (const target of targetsByPassage.get(passageId)) {
      if (reachable.has(target)) continue;
      reachable.add(target);
      pending.push(target);
    }
  }

  const unreachable = journal.passages.filter((passage) => !reachable.has(passage.id));
  if (unreachable.length) {
    const passage = unreachable[0];
    failWG(
      `Journal passage '${passage.id}' is unreachable from entry passage '${entryPassage.id}'`,
      passage.source,
    );
  }

  const canReachFinish = new Set(finishedPassages);
  const reversePending = [...finishedPassages];
  while (reversePending.length) {
    const passageId = reversePending.pop();
    for (const predecessor of predecessorsByPassage.get(passageId)) {
      if (canReachFinish.has(predecessor)) continue;
      canReachFinish.add(predecessor);
      reversePending.push(predecessor);
    }
  }

  const trapped = journal.passages.find(
    (passage) => reachable.has(passage.id) && !canReachFinish.has(passage.id),
  );
  if (trapped) {
    failWG(
      `Journal passage '${trapped.id}' cannot reach a passage ending with @finish`,
      passagesById.get(trapped.id).source,
    );
  }
}

/** Journal definitions are one-time, local branching documents rather than world scenes. */
export function validateJournal(journal, assignRuntimeNodeIds) {
  const passageIds = new Set();
  for (const passage of journal.passages) {
    if (passageIds.has(passage.id)) {
      failWG(`Duplicate journal passage '${passage.id}'`, passage.source);
    }
    passageIds.add(passage.id);
  }

  const validateTarget = (choice) => {
    if (!choice.target?.startsWith(".")) {
      failWG("Journal choices must target a local .passage", choice.source);
    }
    if (!passageIds.has(choice.target.slice(1))) {
      failWG(`Unknown local journal target '${choice.target}'`, choice.source);
    }
  };

  for (const passage of journal.passages) {
    let choiceCount = 0;
    let finishCount = 0;
    walkWGNodes(passage.body, (node) => {
      validateEffects(node);
      if (node.type === "choice") {
        choiceCount += 1;
        validateTarget(node);
        if (node.check) failWG("Journal choices cannot use skill checks", node.source);
      } else if (node.type === "finish") {
        finishCount += 1;
      } else if (
        ![
          "paragraph",
          "if",
          "inline-if",
          "random",
          "choice-group",
          "effect",
        ].includes(node.type)
      ) {
        failWG(`Unsupported journal node '${node.type}'`, node.source);
      }
    });

    const terminal = passage.body.at(-1)?.type;
    if (finishCount > 1) failWG("A journal passage may contain only one @finish", passage.source);
    if (finishCount && terminal !== "finish") {
      failWG("@finish must end a journal passage outside conditional/random blocks", passage.source);
    }
    if (finishCount && choiceCount) {
      failWG("A journal passage must either offer choices or end with @finish", passage.source);
    }
    if (!finishCount && !choiceCount) {
      failWG("A journal passage must offer at least one choice or end with @finish", passage.source);
    }
    assignRuntimeNodeIds(passage.body);
  }

  validatePassageGraph(journal);
}
