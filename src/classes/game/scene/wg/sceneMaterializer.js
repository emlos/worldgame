import { SCENE_ACTION_TYPE } from "../../../../data/scene/actions.js";
import { buildSceneStatus } from "../sceneContext.js";
import { createChoice } from "../choiceContract.js";
import { createScene } from "../sceneContract.js";
import { evaluateWGExpression, resolveWGPath } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";
import { SKILLS } from "../../../../data/player/stats.js";
import { getSkillCheckDifficulty } from "../../../../data/scene/skillChecks.js";

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

function materializeSkillChanges(effects) {
  const totals = new Map();
  for (const effect of effects || []) {
    if (effect?.op !== "skill" || !Number.isFinite(effect.amount)) continue;
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

function materializeChoice(node, context) {
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
  if (node.check) {
    const skill = SKILLS[node.check.skillId];
    const difficulty = getSkillCheckDifficulty(node.check.difficultyId);
    if (!skill || !difficulty) fail("Checked choice has invalid skill metadata", node.source);
    skillCheck = {
      skillId: node.check.skillId,
      skillLabel: skill.label,
      difficultyId: node.check.difficultyId,
      difficultyLabel: difficulty.label,
    };
    action = {
      type: SCENE_ACTION_TYPE.skillCheck,
      check: {
        skillId: node.check.skillId,
        difficultyId: node.check.difficultyId,
      },
      outcomes: {
        success: node.outcomes.success,
        failure: node.outcomes.failure,
      },
    };
  } else {
    action = node.target === "@leave-place"
      ? {
          type: SCENE_ACTION_TYPE.leave,
          effects: node.effects || [],
          exitStory: true,
        }
      : {
          type: SCENE_ACTION_TYPE.wg,
          target: node.target,
          effects: node.effects || [],
        };
  }

  return createChoice({
    id: node.id,
    icon: node.icon,
    label: node.label,
    durationMinutes: node.check ? 0 : node.durationMinutes,
    enabled: disabledReason === null,
    disabledReason,
    warning: node.warning,
    effectsPreview: (node.previews || []).map(({ type, amount, label }) => ({
      type,
      amount,
      label,
    })),
    skillChanges: node.check ? [] : materializeSkillChanges(node.effects),
    skillCheck,
    action,
  });
}

function materializeNodes(nodes, context, output) {
  if (!Array.isArray(nodes)) fail("Scene body must be an array");
  for (const node of nodes) {
    if (node?.type === "paragraph") {
      output.paragraphs.push(renderParagraph(node, context));
      continue;
    }
    if (node?.type === "choice") {
      const choice = materializeChoice(node, context);
      if (choice) output.choices.push(choice);
      continue;
    }
    if (node?.type === "if") {
      const branch = (node.branches || []).find((candidate) =>
        Boolean(evaluateWGExpression(candidate.test, context)),
      );
      materializeNodes(branch?.nodes || node.elseNodes || [], context, output);
      continue;
    }
    fail(`Unknown scene node '${String(node?.type)}'`, node?.source);
  }
}

export function materializeWGScene(game, definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    fail("WG scene definition must be an object");
  }

  const context = createWGRuntimeContext(game);
  const output = { paragraphs: [], choices: [] };
  materializeNodes(definition.body, context, output);

  return createScene({
    id: `wg:${game.storySceneRevision}:${definition.id}:${game.now.toISOString()}`,
    kind: definition.kind,
    heading: definition.heading,
    status: buildSceneStatus(game),
    map: null,
    paragraphs: output.paragraphs,
    sections: output.choices.length
      ? [{ id: "choices", heading: definition.choiceHeading, choices: output.choices }]
      : [],
  });
}
