import { failWG } from "./diagnostic.js";
import { parseWGDocument } from "./sourceParser.js";
import { validateChat } from "./chatValidation.js";
import { createCompilerEffectCatalog } from "./effects/effectCatalog.js";
import {
  isParsedWGChange,
  parsedWGChangeLabel,
} from "./effects/effectParsers.js";
import { NPC_REGISTRY } from "../../../src/characters/npc/npcs.js";
import {
  createWGChangeFeedback,
  validateWGEffectReferences,
} from "../../../src/story/wg/shared/effects/registry.js";
import { walkWGDefinitionEffects } from "../../../src/story/wg/shared/effects/traversal.js";
import { WG_STORY_TARGETS } from "../../../src/story/wg/shared/language.js";
import { walkWGNodes } from "../../../src/story/wg/shared/tree.js";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const RUNTIME_NODE_TYPES = new Set([
  "if",
  "inline-if",
  "random",
  "passive-check",
]);

function assignRuntimeNodeIds(nodes) {
  let runtimeId = 0;
  walkWGNodes(nodes, (node) => {
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

function partsContainChange(parts) {
  return (parts || []).some((part) =>
    part.type === "change" ||
    (part.type === "inline-if" && (
      (part.branches || []).some((branch) => partsContainChange(branch.parts)) ||
      partsContainChange(part.elseParts)
    ))
  );
}

function hasPersistentProseMutation(node) {
  return node.type === "effect" || node.type === "passive-check" ||
    (node.type === "paragraph" && partsContainChange(node.parts)) ||
    (node.type === "inline-if" && (
      (node.branches || []).some((branch) => partsContainChange(branch.parts)) ||
      partsContainChange(node.elseParts)
    ));
}

export function compileStorySources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    failWG("No WG source files were found", { file: "story", line: 1, column: 1 });
  }

  const orderedSources = [...sources].sort((left, right) =>
    compareText(String(left.file), String(right.file)),
  );
  const sceneMap = new Map();
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

  if (sceneMap.size === 0 && locationMap.size === 0 && reminderMap.size === 0 && chatMap.size === 0) {
    failWG("No WG scenes, location contributions, reminders, or chats were found", { file: "story", line: 1, column: 1 });
  }

  const effectCatalog = createCompilerEffectCatalog({ reminderMap, chatMap });
  for (const definition of [...sceneMap.values(), ...locationMap.values(), ...chatMap.values()]) {
    walkWGDefinitionEffects(definition, (effect) => {
      const options = {
        fail: (message) => failWG(message, atSource(effect?.source)),
      };
      validateWGEffectReferences(effect, effectCatalog, options);
      if (isParsedWGChange(effect)) {
        effect.feedback = createWGChangeFeedback(
          effect,
          effectCatalog,
          parsedWGChangeLabel(effect),
          options,
        );
      }
    });
  }

  const hasGlobalTarget = (target) => sceneMap.has(target);
  const validateTarget = (target, source, { scene = null, choiceId = null } = {}) => {
    if (Object.values(WG_STORY_TARGETS).includes(target)) return;
    if (target?.startsWith(".")) {
      const passageId = target.slice(1);
      if (!scene) {
        failWG(`Local passage target '${target}' is only valid inside a scene`, atSource(source));
      }
      if (!scene.passages.some((passage) => passage.id === passageId)) {
        failWG(
          `Unknown passage target '${target}' in scene '${scene.id}'`,
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
    [...sceneMap.values()].flatMap((scene) => scene.pools || []),
  );
  const validateChoicePool = (node) => {
    if (node.eventPool === "interrupt") {
      failWG(
        "The 'interrupt' event pool is engine-reserved and cannot be invoked by a choice",
        atSource(node.source),
      );
    }
    if (node.eventPool && !poolIds.has(node.eventPool)) {
      failWG(
        `Unknown event pool '${node.eventPool}' from choice '${node.id}'`,
        atSource(node.source),
      );
    }
  };

  for (const scene of sceneMap.values()) {
    if (scene.finalTarget) validateTarget(scene.finalTarget, scene.source, { scene });
    if (scene.hub?.type === "place") {
      if (scene.passages.length !== 1) {
        failWG(
          `Place hub scene '${scene.id}' must contain exactly one passage`,
          atSource(scene.source),
        );
      }
    }
    if (scene.schoolClass) {
      const passageIds = scene.passages.map((passage) => passage.id);
      const expectedIds = passageIds.map((_, index) => `segment-${index + 1}`);
      if (
        passageIds.length === 0 ||
        passageIds.some((passageId, index) => passageId !== expectedIds[index])
      ) {
        failWG(
          `School class scene '${scene.id}' requires contiguous passages named segment-1 through segment-${passageIds.length}`,
          atSource(scene.schoolClass.source),
        );
      }
    }
    for (const passage of scene.passages) {
      const choiceIds = new Map();
      const choiceGroupIds = new Map();
      walkWGNodes(passage.body, (node) => {
        if (scene.kind === "place" && hasPersistentProseMutation(node)) {
          failWG(
            "Persistent place hubs cannot contain prose effects or passive checks",
            atSource(node.source),
          );
        }
        if (node.type === "choice-group") {
          const previous = choiceGroupIds.get(node.id);
          if (previous) {
            failWG(
              `Duplicate choice-group id '${node.id}' in passage '${passage.id}' of scene '${scene.id}' (first declared at ${previous.file}:${previous.line})`,
              atSource(node.source),
            );
          }
          choiceGroupIds.set(node.id, node.source);
          return;
        }
        if (node.type !== "choice") return;
        if (scene.hub?.type === "place" && node.id === "leave") {
          failWG(
            "Choice id 'leave' is reserved by the implicit place-hub navigation",
            atSource(node.source),
          );
        }
        const previous = choiceIds.get(node.id);
        if (previous) {
          failWG(
            `Duplicate choice id '${node.id}' in passage '${passage.id}' of scene '${scene.id}' (first declared at ${previous.file}:${previous.line})`,
            atSource(node.source),
          );
        }
        choiceIds.set(node.id, node.source);
        validateChoicePool(node);
        const targets = node.check
          ? [node.outcomes?.success, node.outcomes?.failure].map((outcome) => outcome?.target)
          : [node.target];
        if (scene.hub?.type === "place" && targets.includes(WG_STORY_TARGETS.leavePlace)) {
          failWG(
            "Place hubs already provide an implicit Leave choice",
            atSource(node.source),
          );
        }
        for (const target of targets) {
          validateTarget(target, node.source, { scene, choiceId: node.id });
        }
      });
      if (passage.next) {
        validateTarget(passage.next.target, passage.next.source, { scene });
      }
    }
  }

  for (const contribution of locationMap.values()) {
    const choiceIds = new Map();
    const groupIds = new Map();
    walkWGNodes(contribution.body, (node) => {
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
        failWG("Location contribution choices cannot use @event-pool; enter a scene first", atSource(node.source));
      }
      const outcomes = node.check ? [node.outcomes.success, node.outcomes.failure] : [node];
      for (const outcome of outcomes) {
        if (
          [WG_STORY_TARGETS.return, WG_STORY_TARGETS.leavePlace].includes(outcome.target) ||
          outcome.target.startsWith(".")
        ) {
          failWG("Location contribution choices must target @exit or a global scene", atSource(outcome.source));
        }
        validateTarget(outcome.target, outcome.source, { choiceId: node.id });
      }
    });
  }

  const placeHubKeys = new Map();
  for (const scene of sceneMap.values()) {
    if (scene.hub?.type !== "place") continue;
    for (const placeKey of scene.placeKeys) {
      const previous = placeHubKeys.get(placeKey);
      if (previous) {
        failWG(
          `Duplicate place hub for '${placeKey}' (first declared at ${previous.source.file}:${previous.source.line})`,
          atSource(scene.source),
        );
      }
      placeHubKeys.set(placeKey, scene);
    }
  }

  for (const scene of sceneMap.values()) {
    for (const passage of scene.passages) assignRuntimeNodeIds(passage.body);
  }
  for (const contribution of locationMap.values()) assignRuntimeNodeIds(contribution.body);

  const scenes = Object.fromEntries(
    [...sceneMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  const locationContributions = Object.fromEntries(
    [...locationMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  const reminders = Object.fromEntries(
    [...reminderMap.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  const chats = Object.fromEntries([...chatMap.entries()].sort(([left], [right]) => compareText(left, right)));
  return { formatVersion: 27, scenes, locationContributions, reminders, chats };
}
