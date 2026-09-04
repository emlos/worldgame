import {
  calculateSkillCheckChance,
  getPlayerSkillCheckValue,
  getSkillCheckTargetDefinition,
} from "../../../../data/scene/skillChecks.js";
import { applyWGEffect } from "../../wg/effectRuntime.js";
import { createWGRuntimeContext } from "../../wg/runtimeContext.js";
import {
  createWGDecisionSession,
  iterateSelectedWGNodes,
  iterateSelectedWGParts,
} from "../../wg/decisionRuntime.js";

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

function passiveChance(game, node) {
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

  return chance;
}

function resolveParagraphParts(game, parts, session) {
  for (const part of iterateSelectedWGParts(parts, session)) {
    if (part?.type === "change") {
      applyWGEffect(game, part.effect);
    }
  }
}

function resolveNodes(game, nodes, session) {
  if (!Array.isArray(nodes)) fail("Resolved story body must be an array");

  for (const node of iterateSelectedWGNodes(nodes, session)) {
    if (node?.type === "choice") continue;
    if (node?.type === "paragraph") {
      resolveParagraphParts(game, node.parts, session);
      continue;
    }

    if (node?.type === "effect") {
      applyWGEffect(game, node.effect);
      continue;
    }

    if (node?.type === "choice-group") {
      resolveNodes(game, node.nodes, session);
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
  const session = createWGDecisionSession({
    mode: "record",
    decisions: resolution.decisions,
    seed: game.seed,
    instanceKey,
    getContext: () => createWGRuntimeContext(game),
    getPassiveCheckChance: (node) => passiveChance(game, node),
  });
  resolveNodes(game, nodes, session);
  return resolution;
}
