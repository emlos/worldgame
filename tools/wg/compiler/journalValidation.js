import { failWG } from "./diagnostic.js";
import { walkWGNodes } from "../../../src/story/wg/shared/tree.js";

function journalEffectAllowed(effect) {
  if (!effect || typeof effect !== "object") return false;
  if (effect.op === "add") return effect.path?.[0] === "local";
  if (effect.op !== "set") return false;
  if (effect.path?.[0] === "local") return true;
  return effect.path?.[0] === "flags" && effect.path?.[1] === "journal";
}

function validateEffects(node) {
  const effects = node.type === "effect" ? [node.effect] : node.effects || [];
  if (effects.some((effect) => !journalEffectAllowed(effect))) {
    failWG(
      "Journal entries may mutate only local.* values or set irreversible flags.journal.* flags",
      node.source,
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
}
