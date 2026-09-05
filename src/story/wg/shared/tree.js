/**
 * Walk compiler-produced WG body nodes, including nested prose parts.
 *
 * The visitor receives both ordinary nodes and branch-bearing inline parts.
 * Leaf text/interpolation parts are intentionally omitted: callers that need
 * them should use walkWGParts directly.
 */
export function walkWGParts(parts, visit) {
  for (const part of parts || []) {
    if (part?.type !== "inline-if") continue;
    visit(part);
    for (const branch of part.branches || []) {
      walkWGParts(branch.parts, visit);
    }
    walkWGParts(part.elseParts || [], visit);
  }
}

export function walkWGNodes(nodes, visit) {
  for (const node of nodes || []) {
    visit(node);
    if (node?.type === "paragraph") {
      walkWGParts(node.parts, visit);
    } else if (node?.type === "message") {
      walkWGNodes(node.body, visit);
    } else if (node?.type === "if") {
      for (const branch of node.branches || []) {
        walkWGNodes(branch.nodes, visit);
      }
      walkWGNodes(node.elseNodes || [], visit);
    } else if (node?.type === "choice-group") {
      walkWGNodes(node.nodes, visit);
    } else if (node?.type === "random") {
      for (const variant of node.variants || []) {
        walkWGNodes(variant, visit);
      }
    } else if (node?.type === "passive-check") {
      walkWGNodes(node.outcomes?.success || [], visit);
      walkWGNodes(node.outcomes?.failure || [], visit);
    }
  }
}

export function collectWGNodes(nodes, predicate = () => true) {
  const matches = [];
  walkWGNodes(nodes, (node) => {
    if (predicate(node)) matches.push(node);
  });
  return matches;
}

export function findWGNode(nodes, predicate) {
  let match = null;
  walkWGNodes(nodes, (node) => {
    if (match === null && predicate(node)) match = node;
  });
  return match;
}
