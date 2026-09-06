import { evaluateWGExpression, resolveWGPath } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";
import { getWGRuntimeEffectCatalog } from "./effectCatalog.js";
import {
  validateWGEffectReferences,
  WG_EFFECT_OPS,
} from "../shared/effects/registry.js";

export class WGEffectError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGEffectError";
  }
}

function fail(message) {
  throw new WGEffectError(message);
}

function mutationParent(game, path, { locals = null } = {}) {
  let parent;
  if (path[0] === "story") {
    parent = game.story;
  } else if (path[0] === "local") {
    parent = locals ?? game.currentStory?.locals;
    if (!parent) {
      fail(
        `Cannot mutate local path '${path.join(".")}' without an active scene or chat`,
      );
    }
  } else {
    fail(`Unknown mutable WG namespace '${String(path[0])}'`);
  }
  for (const segment of path.slice(1, -1)) {
    const current = parent[segment];
    if (current === undefined) parent[segment] = {};
    else if (!current || typeof current !== "object" || Array.isArray(current)) {
      fail(`Cannot write through non-object ${path[0]} path '${path.join(".")}'`);
    }
    parent = parent[segment];
  }
  return { parent, key: path.at(-1) };
}

function applyContactEffect(game, effect) {
  game.addContact(effect.npcId);
}

function applyChatEffect(game, effect) {
  if (effect.action === "start") game.startChat(effect.id);
  else game.finishChat(effect.id);
}

function applyMutation(game, effect, options) {
  if (effect.path[0] === "flags") {
    game.setFlag(effect.path.slice(1).join("."));
    return;
  }
  const context = createWGRuntimeContext(game, options);
  const value = evaluateWGExpression(effect.value, context);
  const { parent, key } = mutationParent(game, effect.path, options);
  if (effect.op === "set") {
    parent[key] = value;
    return;
  }

  const current = resolveWGPath(context, effect.path) ?? 0;
  if (!Number.isFinite(current) || !Number.isFinite(value)) {
    fail(`WG add effect requires numbers at '${effect.path.join(".")}'`);
  }
  const result = current + value;
  if (!Number.isFinite(result)) fail("WG add effect produced a non-finite number");
  parent[key] = result;
}

function applyUnsetEffect(game, effect) {
  game.clearFlag(effect.path.slice(1).join("."));
}

function applyReminderEffect(game, effect) {
  try {
    if (effect.action === "add") game.addReminder(effect.id);
    else game.clearReminder(effect.id);
  } catch (error) {
    fail(error.message);
  }
}

function applyTimerEffect(game, effect) {
  try {
    if (effect.action === "start") game.startTimer(effect.id);
    else if (effect.action === "restart") game.restartTimer(effect.id);
    else game.stopTimer(effect.id);
  } catch (error) {
    fail(error.message);
  }
}

function applyDailyFlagEffect(game, effect) {
  game.setDailyFlag(effect.flag, effect.value);
}

function applyUnlockPlaceEffect(game, effect) {
  game.unlockPlacesByKey(effect.placeKey);
}

function applyRelocateEffect(game, effect) {
  try {
    game.relocatePlayer(effect.destination);
  } catch (error) {
    fail(error.message);
  }
}

function applyTeleportNPCEffect(game, effect) {
  try {
    game.teleportNPC(effect.npcId, effect.destination);
  } catch (error) {
    fail(error.message);
  }
}

function applyRelationshipEffect(game, effect) {
  const npc = game.npcs.get(String(effect.npcId));
  if (!npc) {
    fail(`WG relationship effect references unknown NPC '${String(effect.npcId)}'`);
  }
  try {
    game.player.adjustRelationshipMeter(
      npc.id,
      effect.meterId,
      effect.amount,
      npc.relationshipProfile,
    );
  } catch (error) {
    fail(error.message);
  }
}

function applyMoneyEffect(game, effect) {
  if (!Number.isFinite(game.player.money + effect.amount)) {
    fail("WG money effect produced a non-finite balance");
  }
  game.player.adjustMoney(effect.amount);
}

function applySkillEffect(game, effect) {
  game.player.adjustSkill(effect.id, effect.amount);
}

function applyStatEffect(game, effect) {
  game.player.adjustStatBase(effect.id, effect.amount);
}

const EFFECT_HANDLERS = new Map([
  ["contact", applyContactEffect],
  ["chat", applyChatEffect],
  ["set", applyMutation],
  ["add", applyMutation],
  ["unset", applyUnsetEffect],
  ["reminder", applyReminderEffect],
  ["timer", applyTimerEffect],
  ["daily-flag", applyDailyFlagEffect],
  ["unlock-place", applyUnlockPlaceEffect],
  ["relocate", applyRelocateEffect],
  ["teleport-npc", applyTeleportNPCEffect],
  ["relationship", applyRelationshipEffect],
  ["money", applyMoneyEffect],
  ["skill", applySkillEffect],
  ["stat", applyStatEffect],
]);

for (const op of EFFECT_HANDLERS.keys()) {
  if (!WG_EFFECT_OPS.includes(op)) {
    throw new Error(`WG runtime handler '${op}' has no effect specification`);
  }
}

export function getWGEffectHandlerOps(features) {
  return Object.freeze([
    ...EFFECT_HANDLERS.keys(),
    ...(features?.wgEffectHandlerOps ?? []),
  ]);
}

function runtimeHandler(game, effect) {
  validateWGEffectReferences(effect, getWGRuntimeEffectCatalog(game.features), { fail });
  const handler = EFFECT_HANDLERS.get(effect.op) ?? game.features.getWGEffectHandler(effect.op);
  if (!handler) fail(`Unknown WG effect '${String(effect.op)}'`);
  return handler;
}

export function applyWGEffect(game, effect, options = {}) {
  runtimeHandler(game, effect)(game, effect, options);
}

export function applyWGEffects(game, effects, options = {}) {
  if (!Array.isArray(effects)) fail("WG effect collections must be arrays");
  const handlers = effects.map((effect) => runtimeHandler(game, effect));
  for (let index = 0; index < effects.length; index += 1) {
    handlers[index](game, effects[index], options);
  }
}
