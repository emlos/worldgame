import { failWG } from "./diagnostic.js";
import { parseWGDocument } from "./sourceParser.js";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function walkNodes(nodes, visit) {
  for (const node of nodes) {
    visit(node);
    if (node.type !== "if") continue;
    for (const branch of node.branches) walkNodes(branch.nodes, visit);
    if (node.elseNodes) walkNodes(node.elseNodes, visit);
  }
}

function atSource(source) {
  return {
    file: source?.file || "<wg>",
    line: source?.line || 1,
    column: source?.column || 1,
  };
}

export function compileStorySources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    failWG("No WG source files were found", { file: "story", line: 1, column: 1 });
  }

  const orderedSources = [...sources].sort((left, right) =>
    compareText(String(left.file), String(right.file)),
  );
  const sceneMap = new Map();
  const entryMap = new Map();

  for (const source of orderedSources) {
    const document = parseWGDocument(source);
    for (const scene of document.scenes) {
      const previous = sceneMap.get(scene.id);
      if (previous) {
        failWG(
          `Duplicate scene id '${scene.id}' (first declared at ${previous.source.file}:${previous.source.line})`,
          atSource(scene.source),
        );
      }
      sceneMap.set(scene.id, scene);
    }
    for (const entry of document.entries) {
      const previous = entryMap.get(entry.id);
      if (previous) {
        failWG(
          `Duplicate entry id '${entry.id}' (first declared at ${previous.source.file}:${previous.source.line})`,
          atSource(entry.source),
        );
      }
      entryMap.set(entry.id, entry);
    }
  }

  if (sceneMap.size === 0) {
    failWG("No WG scenes were found", { file: "story", line: 1, column: 1 });
  }

  for (const scene of sceneMap.values()) {
    const choiceIds = new Map();
    walkNodes(scene.body, (node) => {
      if (node.type !== "choice") return;

      const previous = choiceIds.get(node.id);
      if (previous) {
        failWG(
          `Duplicate choice id '${node.id}' in scene '${scene.id}' (first declared at ${previous.file}:${previous.line})`,
          atSource(node.source),
        );
      }
      choiceIds.set(node.id, node.source);

      if (node.target !== "@exit" && !sceneMap.has(node.target)) {
        failWG(
          `Unknown target scene '${node.target}' from choice '${node.id}'`,
          atSource(node.source),
        );
      }
    });
  }

  for (const entry of entryMap.values()) {
    if (!sceneMap.has(entry.sceneId)) {
      failWG(
        `Unknown entry scene '${entry.sceneId}' from entry '${entry.id}'`,
        atSource(entry.source),
      );
    }
  }

  const scenes = Object.fromEntries(
    [...sceneMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  const entries = Object.fromEntries(
    [...entryMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  return { formatVersion: 2, scenes, entries };
}

export { walkNodes };
