import { walkWGNodes } from "../tree.js";

function walkParts(parts, visit) {
  for (const part of parts || []) {
    if (part?.type === "change") visit(part.effect);
    if (part?.type !== "inline-if") continue;
    for (const branch of part.branches || []) walkParts(branch.parts, visit);
    walkParts(part.elseParts, visit);
  }
}

export function walkWGEffectsInNodes(nodes, visit) {
  walkWGNodes(nodes, (node) => {
    if (node?.type === "paragraph") walkParts(node.parts, visit);
    if (node?.type === "effect") visit(node.effect);
    if (node?.type !== "choice") return;

    for (const effect of node.effects || []) visit(effect);
    for (const outcome of [node.outcomes?.success, node.outcomes?.failure]) {
      for (const effect of outcome?.effects || []) visit(effect);
    }
  });
}

export function walkWGDefinitionEffects(definition, visit) {
  for (const effect of definition?.onEnter || []) visit(effect);
  walkWGEffectsInNodes(definition?.body, visit);
  for (const passage of definition?.passages || []) {
    walkWGEffectsInNodes(passage.body, visit);
  }
}
