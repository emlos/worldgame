import { SCENE_ACTION_TYPE } from "../../../game/scene/actions.js";
import { buildSceneStatus } from "../../../game/scene/sceneContext.js";
import { createChoice } from "../../../game/scene/choiceContract.js";
import { createScene } from "../../../game/scene/sceneContract.js";
import { evaluateWGExpression, resolveWGPath } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";
import { renderWGInterpolation, renderWGText } from "./textRuntime.js";
import { SKILLS } from "../../../characters/player/stats.js";
import {
  getSkillCheckDifficulty,
  getSkillCheckTargetDefinition,
} from "../../../game/scene/skillChecks.js";
import { keyedRandom01 } from "../../../shared/util/random.js";
import {
  hasImplicitWGSkillChange,
  materializeWGEffectFeedback,
} from "../shared/effects/registry.js";
import {
  createWGDecisionSession,
  iterateSelectedWGNodes,
  iterateSelectedWGParts,
} from "./decisionRuntime.js";
import { renderWGSystem } from "./storySystemRegistry.js";

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

function renderParagraph(
  node,
  context,
  { allowChanges = false, decisionSession } = {},
) {
  if (!Array.isArray(node.parts)) fail("Paragraph parts must be an array", node.source);
  const renderParts = (parts) => {
    const rendered = [];
    for (const part of iterateSelectedWGParts(parts, decisionSession)) {
      if (part?.type === "text" && typeof part.value === "string") {
        rendered.push({ type: "text", text: part.value });
        continue;
      }
      if (part?.type === "interpolation") {
        rendered.push({
          type: "text",
          text: renderWGInterpolation(part, context, node.source),
        });
        continue;
      }
      if (part?.type === "break") {
        rendered.push({ type: "break" });
        continue;
      }
      if (part?.type === "change" && allowChanges) {
        rendered.push({
          type: "change",
          change: materializeChangeFeedback(part.effect),
        });
        continue;
      }
      fail(`Unknown paragraph part '${String(part?.type)}'`, node.source);
    }
    return rendered;
  };
  return renderParts(node.parts);
}

export function materializeWGResponse(game, response) {
  if (!Array.isArray(response?.paragraphs) || !response.paragraphs.length) {
    fail("WG responses require one or more paragraphs", response?.source);
  }
  const context = createWGRuntimeContext(game);
  const decisionSession = createWGDecisionSession({
    mode: "evaluate",
    decisions: {},
    getContext: () => context,
  });
  return response.paragraphs.map((paragraph) =>
    renderParagraph(paragraph, context, { decisionSession })
      .map((part) => part.type === "break" ? "\n" : part.text).join(""),
  );
}

function materializeSkillChanges(effects) {
  const totals = new Map();
  for (const effect of effects || []) {
    if (
      !hasImplicitWGSkillChange(effect) ||
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

function materializeChangeFeedback(effect) {
  return materializeWGEffectFeedback(effect);
}

function materializeVisibleEffects(effects) {
  return (effects || [])
    .filter((effect) => effect?.feedback)
    .map(materializeChangeFeedback);
}

function materializeDuration(node, context, options, durationKey) {
  if (node.durationRangeMinutes) {
    const min = Number(node.durationRangeMinutes.min);
    const max = Number(node.durationRangeMinutes.max);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) {
      fail("Random duration range is invalid", node.source);
    }
    const key = [
      "wg-duration-v1",
      options.storyInstanceKey,
      durationKey,
    ].join(":");
    return min + Math.floor(keyedRandom01(options.gameSeed, key) * (max - min + 1));
  }
  if (!node.timeUntilPath) return node.durationMinutes ?? 0;
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

function materializeOutcome(outcome, sceneId, context, options, durationKey) {
  const {
    durationRangeMinutes: _durationRangeMinutes,
    timeUntilPath: _timeUntilPath,
    ...materialized
  } = outcome;
  return {
    ...materialized,
    durationMinutes: materializeDuration(outcome, context, options, durationKey),
    energyFree: outcome.energyFree ?? false,
    resting: outcome.resting ?? false,
    effects: outcome.effects || [],
    ...(sceneId ? { sceneId } : {}),
  };
}

function materializeChoice(node, context, options = {}) {
  const { sceneId = null, idPrefix = "" } = options;
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
        success: materializeOutcome(
          node.outcomes.success,
          sceneId,
          context,
          options,
          `${idPrefix}${node.id}:success`,
        ),
        failure: materializeOutcome(
          node.outcomes.failure,
          sceneId,
          context,
          options,
          `${idPrefix}${node.id}:failure`,
        ),
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
          sceneId,
          ...(eventPool ? { eventPool } : {}),
        };
  }

  return createChoice({
    id: `${idPrefix}${node.id}`,
    icon: node.icon,
    label: renderWGText(node.label, context, node.source),
    durationMinutes: node.check
      ? 0
      : materializeDuration(node, context, options, `${idPrefix}${node.id}`),
    energyFree: node.check ? false : node.energyFree,
    resting: node.check ? false : node.resting,
    enabled: disabledReason === null,
    disabledReason,
    warning: node.warning,
    effectsPreview: [
      ...(node.previews || []).map(({ source: _source, ...preview }) => preview),
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

function materializeNodes(nodes, context, output, options = {}) {
  if (!Array.isArray(nodes)) fail("Scene body must be an array");
  const sectionId = options.choiceSectionId || `${options.idPrefix || ""}choices`;
  const sectionHeading = options.choiceSectionHeading === ""
    ? null
    : options.choiceSectionHeading || "Choices";
  for (const node of iterateSelectedWGNodes(nodes, options.decisionSession)) {
    if (node?.type === "paragraph") {
      output.content.push({
        type: "paragraph",
        parts: renderParagraph(node, context, {
          allowChanges: Boolean(options.resolution),
          decisionSession: options.decisionSession,
        }),
      });
      continue;
    }
    if (node?.type === "effect") {
      if (!options.resolution) {
        fail("Prose effects require a resolved story instance", node.source);
      }
      appendChange(output, materializeChangeFeedback(node.effect));
      continue;
    }
    if (node?.type === "choice") {
      const choice = materializeChoice(node, context, options);
      if (choice) {
        choiceSection(output, sectionId, sectionHeading).choices.push(choice);
      }
      continue;
    }
    if (node?.type === "choice-group") {
      if (options.inChoiceGroup) {
        fail("@choicegroup blocks cannot be nested", node.source);
      }
      materializeNodes(node.nodes, context, output, {
        ...options,
        inChoiceGroup: true,
        choiceSectionId: `${options.idPrefix || ""}choices:${node.id}`,
        choiceSectionHeading: node.heading,
      });
      continue;
    }
    fail(`Unknown scene node '${String(node?.type)}'`, node?.source);
  }
}

export function materializeWGBody(nodes, context, options = {}) {
  const output = { content: [], sections: [] };
  const decisionSession = createWGDecisionSession({
    mode: options.resolution ? "replay" : "record",
    decisions: options.resolution?.decisions || {},
    seed: options.gameSeed,
    instanceKey: options.storyInstanceKey,
    getContext: () => context,
  });
  materializeNodes(nodes, context, output, { ...options, decisionSession });
  return output;
}

function activeResolution(game, id, passageId) {
  const frame = game.currentStory;
  if (frame?.id !== id || frame.passageId !== passageId) return null;
  if (!frame.resolution || frame.resolution.revision !== game.storyRevision) {
    fail("Active WG story has not been resolved for this revision");
  }
  return frame.resolution;
}

export function materializeWGScene(game, definition, passageId = null) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    fail("WG scene definition must be an object");
  }

  const resolvedPassageId = passageId ?? (
    game.currentStory?.id === definition.id
      ? game.currentStory.passageId
      : definition.passages?.[0]?.id
  );
  const passage = definition.passages?.find(
    (candidate) => candidate.id === resolvedPassageId,
  );
  if (!passage) {
    fail(`WG scene '${definition.id}' has no passage '${String(resolvedPassageId)}'`);
  }

  const context = createWGRuntimeContext(game);
  const resolution = activeResolution(game, definition.id, passage.id);
  if (!resolution && definition.kind !== "place") {
    fail("Entered WG scenes must resolve before materialization", definition.source);
  }
  const output = materializeWGBody(passage.body, context, {
    sceneId: definition.id,
    choiceSectionHeading: definition.choiceHeading,
    gameSeed: game.seed,
    resolution,
    storyInstanceKey: resolution
      ? game.currentStory.instanceKey
      : [
          "scene",
          definition.id,
          passage.id,
          game.storyRevision,
          game.now.toISOString(),
        ].join(":"),
  });
  if (passage.next) {
    choiceSection(output, "navigation", null).choices.push(createChoice({
      id: "__wg_next",
      label: renderWGText(passage.next.label, context, passage.next.source),
      action: {
        type: SCENE_ACTION_TYPE.wgNext,
        sceneId: definition.id,
        target: passage.next.target,
      },
    }));
  }

  return createScene({
    id: `wg:${game.storyRevision}:scene:${definition.id}:${passage.id}:${game.now.toISOString()}`,
    wgStoryId: definition.id,
    kind: definition.kind,
    heading: definition.heading,
    status: buildSceneStatus(game),
    map: null,
    content: output.content,
    sections: output.sections,
  });
}

export function materializeWGSystem(game, definition) {
  const frame = game.currentStory;
  if (
    frame?.id !== definition.id ||
    !frame.system ||
    frame.system.id !== definition.system?.id ||
    !Object.prototype.hasOwnProperty.call(frame.system, "state")
  ) {
    throw new Error(`WG system scene '${definition.id}' is not resolved`);
  }

  const rendered = renderWGSystem(game, definition, frame);
  return createScene({
    id: [
      "wg",
      game.storyRevision,
      "system",
      definition.id,
      frame.system.revision,
      game.now.toISOString(),
    ].join(":"),
    kind: definition.kind,
    heading: rendered.heading ?? definition.heading,
    status: buildSceneStatus(game),
    map: rendered.map ?? null,
    content: rendered.content ?? [],
    sections: rendered.sections ?? [],
  });
}
