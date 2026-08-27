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
  const sequenceMap = new Map();
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
    for (const sequence of document.sequences || []) {
      const previous = sequenceMap.get(sequence.id) || sceneMap.get(sequence.id);
      if (previous) {
        failWG(
          `Duplicate story id '${sequence.id}' (first declared at ${previous.source.file}:${previous.source.line})`,
          atSource(sequence.source),
        );
      }
      sequenceMap.set(sequence.id, sequence);
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

  if (sceneMap.size === 0 && sequenceMap.size === 0) {
    failWG("No WG scenes or sequences were found", { file: "story", line: 1, column: 1 });
  }

  for (const scene of sceneMap.values()) {
    const sequence = sequenceMap.get(scene.id);
    if (sequence) {
      failWG(
        `Duplicate story id '${scene.id}' (also declared at ${sequence.source.file}:${sequence.source.line})`,
        atSource(scene.source),
      );
    }
  }

  const hasGlobalTarget = (target) => sceneMap.has(target) || sequenceMap.has(target);
  const validateTarget = (target, source, { sequence = null, choiceId = null } = {}) => {
    if (["@exit", "@leave-place"].includes(target)) return;
    if (target?.startsWith(".")) {
      const passageId = target.slice(1);
      if (!sequence) {
        failWG(`Local passage target '${target}' is only valid inside a sequence`, atSource(source));
      }
      if (!sequence.passages.some((passage) => passage.id === passageId)) {
        failWG(
          `Unknown passage target '${target}' in sequence '${sequence.id}'`,
          atSource(source),
        );
      }
      return;
    }
    if (!hasGlobalTarget(target)) {
      const owner = choiceId ? ` from choice '${choiceId}'` : "";
      failWG(`Unknown story target '${target}'${owner}`, atSource(source));
    }
  };

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

      const targets = node.check
        ? [node.outcomes?.success, node.outcomes?.failure].map((outcome) => outcome?.target)
        : [node.target];
      for (const target of targets) {
        validateTarget(target, node.source, { choiceId: node.id });
      }
    });
  }

  for (const sequence of sequenceMap.values()) {
    validateTarget(sequence.finalTarget, sequence.source, { sequence });
    for (const passage of sequence.passages) {
      const choiceIds = new Map();
      walkNodes(passage.body, (node) => {
        if (node.type !== "choice") return;
        const previous = choiceIds.get(node.id);
        if (previous) {
          failWG(
            `Duplicate choice id '${node.id}' in passage '${passage.id}' of sequence '${sequence.id}' (first declared at ${previous.file}:${previous.line})`,
            atSource(node.source),
          );
        }
        choiceIds.set(node.id, node.source);
        const targets = node.check
          ? [node.outcomes?.success, node.outcomes?.failure].map((outcome) => outcome?.target)
          : [node.target];
        for (const target of targets) {
          validateTarget(target, node.source, { sequence, choiceId: node.id });
        }
      });
      if (passage.next) {
        validateTarget(passage.next.target, passage.next.source, { sequence });
      }
    }
  }

  for (const entry of entryMap.values()) {
    if (!hasGlobalTarget(entry.sceneId)) {
      failWG(
        `Unknown entry target '${entry.sceneId}' from entry '${entry.id}'`,
        atSource(entry.source),
      );
    }

    const entryDefinition = sceneMap.get(entry.sceneId);
    if (entry.hub?.type === "place" && entryDefinition?.kind !== "place") {
      failWG(
        `Place hub entry '${entry.id}' must reference a scene with @kind place`,
        atSource(entry.source),
      );
    }
  }

  const placeHubKeys = new Map();
  for (const entry of entryMap.values()) {
    if (entry.hub?.type !== "place") continue;
    for (const placeKey of entry.placeKeys) {
      const previous = placeHubKeys.get(placeKey);
      if (previous) {
        failWG(
          `Duplicate place hub for '${placeKey}' (first declared at ${previous.source.file}:${previous.source.line})`,
          atSource(entry.source),
        );
      }
      placeHubKeys.set(placeKey, entry);
    }
  }

  const scenes = Object.fromEntries(
    [...sceneMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  const sequences = Object.fromEntries(
    [...sequenceMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  const entries = Object.fromEntries(
    [...entryMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  return { formatVersion: 5, scenes, sequences, entries };
}

export { walkNodes };
