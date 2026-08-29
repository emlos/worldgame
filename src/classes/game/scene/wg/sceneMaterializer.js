import { SCENE_ACTION_TYPE } from "../../../../data/scene/actions.js";
import { buildSceneStatus } from "../sceneContext.js";
import { createChoice } from "../choiceContract.js";
import { createScene } from "../sceneContract.js";
import { evaluateWGExpression, resolveWGPath } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";
import { SKILLS } from "../../../../data/player/stats.js";
import {
  getSkillCheckDifficulty,
  getSkillCheckTargetDefinition,
} from "../../../../data/scene/skillChecks.js";
import { keyedRandom01 } from "../../../../shared/util/random.js";
import { resolutionNodeKey } from "./storyResolver.js";

export class WGMaterializationError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGMaterializationError";
  }
}

function sourceSuffix(source) {
  if (!source?.file) return "";
  return ` (${source.file}:${source.line || 1}:${source.column || 1})`;
}

function fail(message, source) {
  throw new WGMaterializationError(`${message}${sourceSuffix(source)}`);
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function renderInterpolation(part, context, source) {
  let value = resolveWGPath(context, part.path);
  if (value === undefined || value === null) {
    fail(`Interpolation path '${part.path?.join(".")}' has no value`, source);
  }
  if (!["string", "number", "boolean"].includes(typeof value)) {
    fail(`Interpolation path '${part.path?.join(".")}' is not scalar`, source);
  }

  value = String(value);
  for (const filter of part.filters || []) {
    if (filter === "cap") value = capitalize(value);
    else fail(`Unknown interpolation filter '${String(filter)}'`, source);
  }
  return value;
}

function renderParagraph(node, context) {
  if (!Array.isArray(node.parts)) fail("Paragraph parts must be an array", node.source);
  return node.parts
    .map((part) => {
      if (part?.type === "text" && typeof part.value === "string") return part.value;
      if (part?.type === "interpolation") {
        return renderInterpolation(part, context, node.source);
      }
      fail(`Unknown paragraph part '${String(part?.type)}'`, node.source);
    })
    .join("");
}

export function materializeWGResponse(game, response) {
  if (!Array.isArray(response?.paragraphs) || !response.paragraphs.length) {
    fail("WG responses require one or more paragraphs", response?.source);
  }
  const context = createWGRuntimeContext(game);
  return response.paragraphs.map((paragraph) =>
    renderParagraph(paragraph, context),
  );
}

function materializeSkillChanges(effects) {
  const totals = new Map();
  for (const effect of effects || []) {
    if (
      effect?.op !== "skill" ||
      effect.feedback ||
      !Number.isFinite(effect.amount)
    ) continue;
    totals.set(effect.id, (totals.get(effect.id) || 0) + effect.amount);
  }
  return [...totals.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([skillId, amount]) => ({
      skillId,
      label: (amount > 0 ? "+" : "-") + (SKILLS[skillId]?.label || skillId),
      direction: amount > 0 ? "increase" : "decrease",
    }));
}

function materializeVisibleEffects(effects) {
  return (effects || [])
    .filter((effect) => effect?.feedback)
    .map((effect) => ({ ...effect.feedback }));
}

function materializeDuration(node, context) {
  if (!node.timeUntilPath) return node.durationMinutes;
  const targetValue = resolveWGPath(context, node.timeUntilPath);
  const target = new Date(targetValue);
  const now = new Date(context.time?.iso);
  if (!Number.isFinite(target.getTime()) || !Number.isFinite(now.getTime())) {
    fail(
      `@time-until path '${node.timeUntilPath.join(".")}' must resolve to a timestamp`,
      node.source,
    );
  }
  const minutes = (target.getTime() - now.getTime()) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    fail(
      `@time-until path '${node.timeUntilPath.join(".")}' must be in the future`,
      node.source,
    );
  }
  return minutes;
}

function materializeOutcome(outcome, sequenceId) {
  return {
    ...outcome,
    durationMinutes: outcome.durationMinutes ?? 0,
    energyFree: outcome.energyFree ?? false,
    effects: outcome.effects || [],
    ...(sequenceId ? { sequenceId } : {}),
  };
}

function materializeChoice(node, context, { sequenceId = null } = {}) {
  if (node.when && !Boolean(evaluateWGExpression(node.when, context))) return null;

  let disabledReason = null;
  for (const requirement of node.requirements || []) {
    if (!Boolean(evaluateWGExpression(requirement.test, context))) {
      disabledReason = requirement.reason;
      break;
    }
  }

  let action;
  let skillCheck = null;
  const eventPool = node.eventPool
    ? { id: node.eventPool, chance: node.eventChance }
    : null;
  if (node.check) {
    const target = getSkillCheckTargetDefinition(
      node.check.targetType,
      node.check.targetId,
    );
    const difficulty = getSkillCheckDifficulty(node.check.difficultyId);
    if (!target || !difficulty) {
      fail("Checked choice has invalid check metadata", node.source);
    }
    skillCheck = {
      targetType: node.check.targetType,
      targetId: node.check.targetId,
      targetLabel: target.label,
      difficultyId: node.check.difficultyId,
      difficultyLabel: difficulty.label,
    };
    action = {
      type: SCENE_ACTION_TYPE.skillCheck,
      check: {
        targetType: node.check.targetType,
        targetId: node.check.targetId,
        difficultyId: node.check.difficultyId,
      },
      outcomes: {
        success: materializeOutcome(node.outcomes.success, sequenceId),
        failure: materializeOutcome(node.outcomes.failure, sequenceId),
      },
      ...(eventPool ? { eventPool } : {}),
    };
  } else {
    action = node.target === "@leave-place"
      ? {
          type: SCENE_ACTION_TYPE.leave,
          effects: node.effects || [],
          responses: node.responses || [],
          exitStory: true,
        }
      : {
          type: SCENE_ACTION_TYPE.wg,
          target: node.target,
          effects: node.effects || [],
          responses: node.responses || [],
          sequenceId,
          ...(eventPool ? { eventPool } : {}),
          ...(node.enterAfterTime ? { enterAfterTime: true } : {}),
        };
  }

  return createChoice({
    id: node.id,
    icon: node.icon,
    label: node.label,
    durationMinutes: node.check ? 0 : materializeDuration(node, context),
    energyFree: node.check ? false : node.energyFree,
    enabled: disabledReason === null,
    disabledReason,
    warning: node.warning,
    effectsPreview: [
      ...(node.previews || []).map(({ type, amount, label }) => ({
        type,
        amount,
        label,
      })),
      ...materializeVisibleEffects(node.effects),
    ],
    skillChanges: node.check ? [] : materializeSkillChanges(node.effects),
    skillCheck,
    action,
  });
}

function choiceSection(output, id, heading) {
  let section = output.sections.find((candidate) => candidate.id === id);
  if (!section) {
    section = { id, heading, choices: [] };
    output.sections.push(section);
  } else if (section.heading !== heading) {
    fail(`Choice section '${id}' has conflicting headings`);
  }
  return section;
}

function appendChange(output, feedback) {
  if (!feedback) return;
  const previous = output.content.at(-1);
  if (previous?.type === "changes") {
    previous.items.push({ ...feedback });
  } else {
    output.content.push({ type: "changes", items: [{ ...feedback }] });
  }
}

function resolvedDecision(node, options) {
  const decisions = options.resolution?.decisions;
  const key = resolutionNodeKey(node);
  if (!decisions || !Object.prototype.hasOwnProperty.call(decisions, key)) {
    fail(`Story resolution is missing a decision for '${key}'`, node.source);
  }
  return decisions[key];
}

function materializeNodes(nodes, context, output, options = {}) {
  if (!Array.isArray(nodes)) fail("Scene body must be an array");
  const sectionId = options.choiceSectionId || "choices";
  const sectionHeading = options.choiceSectionHeading || "Choices";
  for (const node of nodes) {
    if (node?.type === "paragraph") {
      output.content.push({ type: "paragraph", text: renderParagraph(node, context) });
      continue;
    }
    if (node?.type === "effect") {
      if (!options.resolution) {
        fail("Prose effects require a resolved story instance", node.source);
      }
      appendChange(output, node.effect?.feedback);
      continue;
    }
    if (node?.type === "choice") {
      const choice = materializeChoice(node, context, options);
      if (choice) {
        choiceSection(output, sectionId, sectionHeading).choices.push(choice);
      }
      continue;
    }
    if (node?.type === "if") {
      const index = options.resolution
        ? resolvedDecision(node, options)
        : (node.branches || []).findIndex((candidate) =>
            Boolean(evaluateWGExpression(candidate.test, context)),
          );
      if (!Number.isInteger(index) || index < -1 || index >= (node.branches || []).length) {
        fail("Conditional story resolution has an invalid branch", node.source);
      }
      const selected = index >= 0
        ? node.branches[index]?.nodes || []
        : node.elseNodes || [];
      materializeNodes(selected, context, output, options);
      continue;
    }
    if (node?.type === "random") {
      if (!Array.isArray(node.variants) || node.variants.length < 2) {
        fail("Random blocks require at least two alternatives", node.source);
      }
      let index;
      if (options.resolution) {
        index = resolvedDecision(node, options);
      } else {
        const key = [
          "wg-random-v2",
          options.storyInstanceKey,
          resolutionNodeKey(node),
        ].join(":");
        index = Math.floor(
          keyedRandom01(options.gameSeed, key) * node.variants.length,
        );
      }
      if (!Number.isInteger(index) || index < 0 || index >= node.variants.length) {
        fail("Random story resolution has an invalid alternative", node.source);
      }
      materializeNodes(node.variants[index], context, output, options);
      continue;
    }
    if (node?.type === "passive-check") {
      if (!options.resolution) {
        fail("Passive checks require a resolved story instance", node.source);
      }
      const result = resolvedDecision(node, options);
      if (result !== "success" && result !== "failure") {
        fail("Passive-check resolution has an invalid outcome", node.source);
      }
      materializeNodes(node.outcomes?.[result] || [], context, output, options);
      continue;
    }
    if (node?.type === "choice-group") {
      if (options.inChoiceGroup) {
        fail("@choicegroup blocks cannot be nested", node.source);
      }
      materializeNodes(node.nodes, context, output, {
        ...options,
        inChoiceGroup: true,
        choiceSectionId: `choices:${node.id}`,
        choiceSectionHeading: node.heading,
      });
      continue;
    }
    fail(`Unknown scene node '${String(node?.type)}'`, node?.source);
  }
}

function activeResolution(game, type, id, passageId = null) {
  const frame = game.currentStory;
  if (frame?.type !== type || frame.id !== id) return null;
  if (type === "sequence" && frame.passageId !== passageId) return null;
  if (!frame.resolution || frame.resolution.revision !== game.storyRevision) {
    fail("Active WG story has not been resolved for this revision");
  }
  return frame.resolution;
}

export function materializeWGScene(game, definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    fail("WG scene definition must be an object");
  }

  const context = createWGRuntimeContext(game);
  const resolution = activeResolution(game, "scene", definition.id);
  if (!resolution && definition.kind !== "place") {
    fail("Entered WG scenes must resolve before materialization", definition.source);
  }
  const output = { content: [], sections: [] };
  materializeNodes(definition.body, context, output, {
    choiceSectionHeading: definition.choiceHeading,
    gameSeed: game.seed,
    resolution,
    storyInstanceKey: [
      "scene",
      definition.id,
      game.storyRevision,
      game.now.toISOString(),
    ].join(":"),
  });

  return createScene({
    id: `wg:${game.storyRevision}:scene:${definition.id}:${game.now.toISOString()}`,
    kind: definition.kind,
    heading: definition.heading,
    status: buildSceneStatus(game),
    map: null,
    content: output.content,
    sections: output.sections,
  });
}

export function materializeWGSequence(game, definition, passageId) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    fail("WG sequence definition must be an object");
  }
  const passage = definition.passages?.find((candidate) => candidate.id === passageId);
  if (!passage) fail(`WG sequence '${definition.id}' has no passage '${String(passageId)}'`);

  const context = createWGRuntimeContext(game);
  const resolution = activeResolution(
    game,
    "sequence",
    definition.id,
    passage.id,
  );
  if (!resolution) {
    fail("Entered WG sequence passages must resolve before materialization", passage.source);
  }
  const output = { content: [], sections: [] };
  materializeNodes(passage.body, context, output, {
    sequenceId: definition.id,
    choiceSectionHeading: definition.choiceHeading,
    gameSeed: game.seed,
    resolution,
    storyInstanceKey: [
      "sequence",
      definition.id,
      passage.id,
      game.storyRevision,
      game.now.toISOString(),
    ].join(":"),
  });
  if (passage.next) {
    choiceSection(output, "choices", definition.choiceHeading).choices.push(createChoice({
      id: "__wg_next",
      label: passage.next.label,
      action: {
        type: SCENE_ACTION_TYPE.wgNext,
        sequenceId: definition.id,
        target: passage.next.target,
      },
    }));
  }

  return createScene({
    id: `wg:${game.storyRevision}:sequence:${definition.id}:${passage.id}:${game.now.toISOString()}`,
    kind: definition.kind,
    heading: definition.heading,
    status: buildSceneStatus(game),
    map: null,
    content: output.content,
    sections: output.sections,
  });
}
