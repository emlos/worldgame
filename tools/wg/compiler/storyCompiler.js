import { failWG } from "./diagnostic.js";
import { parseWGDocument } from "./sourceParser.js";
import { validateChat } from "./chatValidation.js";
import { NPC_REGISTRY } from "../../../src/data/npc/npcs.js";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function walkNodes(nodes, visit) {
  for (const node of nodes) {
    visit(node);
    if (node.type === "message") {
      walkNodes(node.body, visit);
    } else if (node.type === "if") {
      for (const branch of node.branches) walkNodes(branch.nodes, visit);
      if (node.elseNodes) walkNodes(node.elseNodes, visit);
    } else if (node.type === "choice-group") {
      walkNodes(node.nodes, visit);
    } else if (node.type === "random") {
      for (const variant of node.variants) walkNodes(variant, visit);
    } else if (node.type === "passive-check") {
      walkNodes(node.outcomes?.success || [], visit);
      walkNodes(node.outcomes?.failure || [], visit);
    }
  }
}

const RUNTIME_NODE_TYPES = new Set(["if", "random", "passive-check"]);

function assignRuntimeNodeIds(nodes) {
  let runtimeId = 0;
  walkNodes(nodes, (node) => {
    if (!RUNTIME_NODE_TYPES.has(node.type)) return;
    node.runtimeId = runtimeId;
    runtimeId += 1;
  });
}

function atSource(source) {
  return {
    file: source?.file || "<wg>",
    line: source?.line || 1,
    column: source?.column || 1,
  };
}

function hasPersistentProseMutation(node) {
  return node.type === "effect" || node.type === "passive-check" ||
    (node.type === "paragraph" && node.parts.some((part) => part.type === "change"));
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
  const locationMap = new Map();
  const reminderMap = new Map();
  const chatMap = new Map();
  const npcIds = new Set(NPC_REGISTRY.map((npc) => npc.id));

  for (const source of orderedSources) {
    const document = parseWGDocument(source);
    for (const chat of document.chats) {
      if (chatMap.has(chat.id)) failWG(`Duplicate chat '${chat.id}'`, atSource(chat.source));
      if (!npcIds.has(chat.npcId)) failWG(`Unknown chat NPC '${chat.npcId}'`, atSource(chat.source));
      validateChat(chat, assignRuntimeNodeIds);
      chatMap.set(chat.id, chat);
    }
    for (const reminder of document.reminders) {
      const previous = reminderMap.get(reminder.id);
      if (previous) {
        failWG(
          `Duplicate reminder id '${reminder.id}' (first declared at ${previous.source.file}:${previous.source.line})`,
          atSource(reminder.source),
        );
      }
      reminderMap.set(reminder.id, reminder);
    }
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
    for (const contribution of document.locationContributions) {
      const previous = locationMap.get(contribution.id);
      if (previous) {
        failWG(
          `Duplicate location contribution id '${contribution.id}' (first declared at ${previous.source.file}:${previous.source.line})`,
          atSource(contribution.source),
        );
      }
      locationMap.set(contribution.id, contribution);
    }
  }

  if (sceneMap.size === 0 && sequenceMap.size === 0 && locationMap.size === 0 && reminderMap.size === 0 && chatMap.size === 0) {
    failWG("No WG scenes, sequences, location contributions, or reminders were found", { file: "story", line: 1, column: 1 });
  }

  // Visit every effect, including on-enter blocks, checked outcomes, and
  // unreachable branches. References can point to any source file.
  function validateReminderEffects(value) {
    if (!value || typeof value !== "object") return;
    if (value.op === "reminder" && !reminderMap.has(value.id)) {
      failWG(`Unknown reminder '${value.id}'`, atSource(value.source));
    }
    if (value.op === "contact" && !npcIds.has(value.npcId)) failWG(`Unknown contact NPC '${value.npcId}'`, atSource(value.source));
    if (value.op === "chat" && !chatMap.has(value.id)) failWG(`Unknown chat '${value.id}'`, atSource(value.source));
    for (const child of Object.values(value)) validateReminderEffects(child);
  }
  for (const definition of [...sceneMap.values(), ...sequenceMap.values(), ...locationMap.values(), ...chatMap.values()]) {
    validateReminderEffects(definition);
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
    if (["@exit", "@return", "@leave-place"].includes(target)) return;
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
  const poolIds = new Set(
    [...entryMap.values()].flatMap((entry) => entry.pools || []),
  );
  const validateChoicePool = (node) => {
    if (node.eventPool && !poolIds.has(node.eventPool)) {
      failWG(
        `Unknown event pool '${node.eventPool}' from choice '${node.id}'`,
        atSource(node.source),
      );
    }
  };

  for (const scene of sceneMap.values()) {
    const choiceIds = new Map();
    const choiceGroupIds = new Map();
    walkNodes(scene.body, (node) => {
      if (
        scene.kind === "place" &&
        hasPersistentProseMutation(node)
      ) {
        failWG(
          "Persistent place hubs cannot contain prose effects or passive checks",
          atSource(node.source),
        );
      }
      if (node.type === "choice-group") {
        const previous = choiceGroupIds.get(node.id);
        if (previous) {
          failWG(
            `Duplicate choice-group id '${node.id}' in scene '${scene.id}' (first declared at ${previous.file}:${previous.line})`,
            atSource(node.source),
          );
        }
        choiceGroupIds.set(node.id, node.source);
        return;
      }
      if (node.type !== "choice") return;

      const previous = choiceIds.get(node.id);
      if (previous) {
        failWG(
          `Duplicate choice id '${node.id}' in scene '${scene.id}' (first declared at ${previous.file}:${previous.line})`,
          atSource(node.source),
        );
      }
      choiceIds.set(node.id, node.source);
      validateChoicePool(node);

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
    if (sequence.schoolClass) {
      const passageIds = sequence.passages.map((passage) => passage.id);
      const expectedIds = passageIds.map((_, index) => `segment-${index + 1}`);
      if (
        passageIds.length === 0 ||
        passageIds.some((passageId, index) => passageId !== expectedIds[index])
      ) {
        failWG(
          `School class sequence '${sequence.id}' requires contiguous passages named segment-1 through segment-${passageIds.length}`,
          atSource(sequence.schoolClass.source),
        );
      }
    }
    for (const passage of sequence.passages) {
      const choiceIds = new Map();
      const choiceGroupIds = new Map();
      walkNodes(passage.body, (node) => {
        if (node.type === "choice-group") {
          const previous = choiceGroupIds.get(node.id);
          if (previous) {
            failWG(
              `Duplicate choice-group id '${node.id}' in passage '${passage.id}' of sequence '${sequence.id}' (first declared at ${previous.file}:${previous.line})`,
              atSource(node.source),
            );
          }
          choiceGroupIds.set(node.id, node.source);
          return;
        }
        if (node.type !== "choice") return;
        const previous = choiceIds.get(node.id);
        if (previous) {
          failWG(
            `Duplicate choice id '${node.id}' in passage '${passage.id}' of sequence '${sequence.id}' (first declared at ${previous.file}:${previous.line})`,
            atSource(node.source),
          );
        }
        choiceIds.set(node.id, node.source);
        validateChoicePool(node);
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

  for (const contribution of locationMap.values()) {
    const choiceIds = new Map();
    const groupIds = new Map();
    walkNodes(contribution.body, (node) => {
      if (hasPersistentProseMutation(node)) {
        failWG("Location contributions cannot contain prose effects or passive checks; put effects inside choices", atSource(node.source));
      }
      if (node.type === "choice-group" || node.type === "choice") {
        const ids = node.type === "choice" ? choiceIds : groupIds;
        const previous = ids.get(node.id);
        if (previous) {
          failWG(
            `Duplicate ${node.type} id '${node.id}' in location contribution '${contribution.id}' (first declared at ${previous.file}:${previous.line})`,
            atSource(node.source),
          );
        }
        ids.set(node.id, node.source);
      }
      if (node.type !== "choice") return;
      if (node.eventPool) {
        failWG("Location contribution choices cannot use @event-pool; enter a scene or sequence first", atSource(node.source));
      }
      const outcomes = node.check ? [node.outcomes.success, node.outcomes.failure] : [node];
      for (const outcome of outcomes) {
        if (["@return", "@leave-place"].includes(outcome.target) || outcome.target.startsWith(".")) {
          failWG("Location contribution choices must target @exit or a global scene/sequence", atSource(outcome.source));
        }
        validateTarget(outcome.target, outcome.source, { choiceId: node.id });
      }
    });
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

  for (const scene of sceneMap.values()) assignRuntimeNodeIds(scene.body);
  for (const contribution of locationMap.values()) assignRuntimeNodeIds(contribution.body);
  for (const sequence of sequenceMap.values()) {
    for (const passage of sequence.passages) assignRuntimeNodeIds(passage.body);
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
  const locationContributions = Object.fromEntries(
    [...locationMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  const reminders = Object.fromEntries(
    [...reminderMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  const chats = Object.fromEntries([...chatMap.entries()].sort(([left], [right]) => compareText(left, right)));
  return { formatVersion: 23, scenes, sequences, entries, locationContributions, reminders, chats };
}

export { walkNodes };
