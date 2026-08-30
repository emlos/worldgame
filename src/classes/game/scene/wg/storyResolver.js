import {
  calculateSkillCheckChance,
  getPlayerSkillCheckValue,
  getSkillCheckTargetDefinition,
} from "../../../../data/scene/skillChecks.js";
import { keyedRandom01 } from "../../../../shared/util/random.js";
import { evaluateWGExpression } from "./expressionEvaluator.js";
import { applyWGEffect } from "./effectRuntime.js";
import { createWGRuntimeContext } from "./runtimeContext.js";

export class WGResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGResolutionError";
  }
}

function sourceSuffix(source) {
  if (!source?.file) return "";
  return ` (${source.file}:${source.line || 1}:${source.column || 1})`;
}

function fail(message, source) {
  throw new WGResolutionError(`${message}${sourceSuffix(source)}`);
}

function runtimeNodeId(node) {
  if (!Number.isSafeInteger(node?.runtimeId) || node.runtimeId < 0) {
    fail("Resolvable WG node is missing its runtime id", node?.source);
  }
  return node.runtimeId;
}

export function resolutionNodeKey(node) {
  return `${node.type}:${runtimeNodeId(node)}`;
}

function randomIndex(game, node, instanceKey) {
  const key = [
    "wg-random-v2",
    instanceKey,
    resolutionNodeKey(node),
  ].join(":");
  return Math.floor(keyedRandom01(game.seed, key) * node.variants.length);
}

function passiveResult(game, node, instanceKey) {
  const definition = getSkillCheckTargetDefinition(
    node.check?.targetType,
    node.check?.targetId,
  );
  if (!definition) fail("Passive check has invalid target metadata", node.source);

  let chance;
  try {
    chance = calculateSkillCheckChance(
      getPlayerSkillCheckValue(
        game.player,
        node.check.targetType,
        node.check.targetId,
      ),
      node.check.difficultyId,
      definition,
    );
  } catch (error) {
    fail(error.message, node.source);
  }

  const key = [
    "wg-passive-check-v2",
    instanceKey,
    resolutionNodeKey(node),
  ].join(":");
  return keyedRandom01(game.seed, key) < chance ? "success" : "failure";
}

function resolveNodes(game, nodes, resolution, instanceKey) {
  if (!Array.isArray(nodes)) fail("Resolved story body must be an array");

  for (const node of nodes) {
    if (node?.type === "choice") continue;
    if (node?.type === "paragraph") {
      for (const part of node.parts) {
        if (part.type === "change") applyWGEffect(game, part.effect);
      }
      continue;
    }

    if (node?.type === "effect") {
      applyWGEffect(game, node.effect);
      continue;
    }

    if (node?.type === "choice-group") {
      resolveNodes(game, node.nodes, resolution, instanceKey);
      continue;
    }

    if (node?.type === "if") {
      const context = createWGRuntimeContext(game);
      const index = (node.branches || []).findIndex((branch) =>
        Boolean(evaluateWGExpression(branch.test, context)),
      );
      resolution.decisions[resolutionNodeKey(node)] = index;
      const selected = index >= 0
        ? node.branches[index]?.nodes || []
        : node.elseNodes || [];
      resolveNodes(game, selected, resolution, instanceKey);
      continue;
    }

    if (node?.type === "random") {
      if (!Array.isArray(node.variants) || node.variants.length < 2) {
        fail("Random blocks require at least two alternatives", node.source);
      }
      const index = randomIndex(game, node, instanceKey);
      resolution.decisions[resolutionNodeKey(node)] = index;
      resolveNodes(game, node.variants[index], resolution, instanceKey);
      continue;
    }

    if (node?.type === "passive-check") {
      const result = passiveResult(game, node, instanceKey);
      resolution.decisions[resolutionNodeKey(node)] = result;
      resolveNodes(
        game,
        node.outcomes?.[result] || [],
        resolution,
        instanceKey,
      );
      continue;
    }

    fail(`Unknown resolvable story node '${String(node?.type)}'`, node?.source);
  }
}

export function resolveWGBody(game, nodes, { instanceKey } = {}) {
  if (typeof instanceKey !== "string" || !instanceKey) {
    fail("WG body resolution requires a story instance key");
  }
  const resolution = { decisions: {} };
  resolveNodes(game, nodes, resolution, instanceKey);
  return resolution;
}
