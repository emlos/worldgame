import { keyedRandom01 } from "../../../shared/util/random.js";
import { evaluateWGExpression } from "./expressionEvaluator.js";

export class WGDecisionError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGDecisionError";
  }
}

function sourceSuffix(source) {
  if (!source?.file) return "";
  return ` (${source.file}:${source.line || 1}:${source.column || 1})`;
}

function fail(message, source) {
  throw new WGDecisionError(`${message}${sourceSuffix(source)}`);
}

function runtimeNodeId(node) {
  if (!Number.isSafeInteger(node?.runtimeId) || node.runtimeId < 0) {
    fail("Resolvable WG node is missing its runtime id", node?.source);
  }
  return node.runtimeId;
}

export function wgDecisionKey(node) {
  return `${node?.type}:${runtimeNodeId(node)}`;
}

function requireInstanceKey(instanceKey, node) {
  if (typeof instanceKey !== "string" || !instanceKey) {
    fail("WG decisions require an instance key", node?.source);
  }
}

function validateDecision(node, decision) {
  if (node.type === "if" || node.type === "inline-if") {
    if (
      !Number.isInteger(decision) ||
      decision < -1 ||
      decision >= (node.branches || []).length
    ) {
      fail("Conditional WG decision has an invalid branch", node.source);
    }
    return;
  }
  if (node.type === "random") {
    if (
      !Array.isArray(node.variants) ||
      node.variants.length < 2 ||
      !Number.isInteger(decision) ||
      decision < 0 ||
      decision >= node.variants.length
    ) {
      fail("Random WG decision has an invalid alternative", node.source);
    }
    return;
  }
  if (node.type === "passive-check") {
    if (decision !== "success" && decision !== "failure") {
      fail("Passive-check WG decision has an invalid outcome", node.source);
    }
    return;
  }
  fail(`WG node '${String(node?.type)}' does not contain a decision`, node?.source);
}

function calculateDecision(session, node) {
  if (node.type === "if" || node.type === "inline-if") {
    if (typeof session.getContext !== "function") {
      fail("Conditional WG decisions require a runtime context", node.source);
    }
    return (node.branches || []).findIndex((branch) =>
      Boolean(evaluateWGExpression(branch.test, session.getContext())),
    );
  }

  requireInstanceKey(session.instanceKey, node);
  const key = wgDecisionKey(node);
  if (node.type === "random") {
    if (!Array.isArray(node.variants) || node.variants.length < 2) {
      fail("Random blocks require at least two alternatives", node.source);
    }
    const randomKey = [session.randomNamespace, session.instanceKey, key].join(":");
    return Math.floor(keyedRandom01(session.seed, randomKey) * node.variants.length);
  }
  if (node.type === "passive-check") {
    if (typeof session.getPassiveCheckChance !== "function") {
      fail("Passive checks require a chance resolver", node.source);
    }
    const chance = session.getPassiveCheckChance(node);
    if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
      fail("Passive-check chance must be between zero and one", node.source);
    }
    const randomKey = [session.passiveNamespace, session.instanceKey, key].join(":");
    return keyedRandom01(session.seed, randomKey) < chance ? "success" : "failure";
  }
  fail(`WG node '${String(node?.type)}' does not contain a decision`, node?.source);
}

export function createWGDecisionSession({
  mode,
  decisions = {},
  seed = 0,
  instanceKey = "",
  getContext = null,
  getPassiveCheckChance = null,
  randomNamespace = "wg-random-v2",
  passiveNamespace = "wg-passive-check-v2",
} = {}) {
  if (!["evaluate", "record", "replay"].includes(mode)) {
    fail("WG decision sessions must evaluate, record, or replay");
  }
  if (!decisions || typeof decisions !== "object" || Array.isArray(decisions)) {
    fail("WG decision sessions require a decision object");
  }

  const session = {
    mode,
    decisions,
    seed,
    instanceKey,
    getContext,
    getPassiveCheckChance,
    randomNamespace,
    passiveNamespace,
    usedKeys: new Set(),
    decision(node) {
      if (mode === "evaluate") {
        const value = calculateDecision(session, node);
        validateDecision(node, value);
        return value;
      }
      const key = wgDecisionKey(node);
      session.usedKeys.add(key);
      let value;
      if (mode === "record") {
        value = calculateDecision(session, node);
        decisions[key] = value;
      } else {
        if (!Object.prototype.hasOwnProperty.call(decisions, key)) {
          fail(`WG resolution is missing a decision for '${key}'`, node?.source);
        }
        value = decisions[key];
      }
      validateDecision(node, value);
      return value;
    },
  };
  return session;
}

export function selectedWGNodeBranch(node, session) {
  const decision = session.decision(node);
  if (node.type === "if") {
    return decision < 0
      ? node.elseNodes || []
      : node.branches[decision]?.nodes || [];
  }
  if (node.type === "random") return node.variants[decision];
  if (node.type === "passive-check") return node.outcomes?.[decision] || [];
  fail(`WG node '${String(node?.type)}' has no selectable node branch`, node?.source);
}

export function selectedWGPartBranch(part, session) {
  if (part?.type !== "inline-if") {
    fail(`WG part '${String(part?.type)}' has no selectable branch`, part?.source);
  }
  const decision = session.decision(part);
  return decision < 0
    ? part.elseParts || []
    : part.branches[decision]?.parts || [];
}

/** Laziness preserves authored ordering when earlier nodes mutate later conditions. */
export function* iterateSelectedWGNodes(nodes, session) {
  for (const node of nodes || []) {
    if (["if", "random", "passive-check"].includes(node?.type)) {
      yield* iterateSelectedWGNodes(selectedWGNodeBranch(node, session), session);
    } else {
      yield node;
    }
  }
}

export function* iterateSelectedWGParts(parts, session) {
  for (const part of parts || []) {
    if (part?.type === "inline-if") {
      yield* iterateSelectedWGParts(selectedWGPartBranch(part, session), session);
    } else {
      yield part;
    }
  }
}
