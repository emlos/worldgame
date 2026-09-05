import { evaluateWGExpression, resolveWGPath } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";
import { WG_RUNTIME_EFFECT_CATALOG } from "./effectCatalog.js";
import {
  validateWGEffectReferences,
  WG_EFFECT_OPS,
} from "../../../shared/wg/effects/registry.js";

export class WGEffectError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGEffectError";
  }
}

function fail(message) {
  throw new WGEffectError(message);
}

function storyParent(game, path) {
  let parent = game.story;
  for (const segment of path.slice(1, -1)) {
    const current = parent[segment];
    if (current === undefined) parent[segment] = {};
    else if (!current || typeof current !== "object" || Array.isArray(current)) {
      fail(`Cannot write through non-object story path '${path.join(".")}'`);
    }
    parent = parent[segment];
  }
  return { parent, key: path.at(-1) };
}

function applyContactEffect(game, effect) {
  game.addContact(effect.npcId);
}

function applyChatEffect(game, effect) {
  game.startChat(effect.id);
}

function applyStoryMutation(game, effect) {
  const context = createWGRuntimeContext(game);
  const value = evaluateWGExpression(effect.value, context);
  const { parent, key } = storyParent(game, effect.path);
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

function applyFlagEffect(game, effect) {
  game.setFlag(effect.flag, effect.value);
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

function applyGradeEffect(game, effect) {
  game.player.adjustSubjectAchievement(effect.id, effect.amount);
}

function applyAttendanceEffect(game, effect) {
  game.player.recordSubjectAttendance(effect.id, effect.amount);
}

const EFFECT_HANDLERS = new Map([
  ["contact", applyContactEffect],
  ["chat", applyChatEffect],
  ["set", applyStoryMutation],
  ["add", applyStoryMutation],
  ["flag", applyFlagEffect],
  ["reminder", applyReminderEffect],
  ["timer", applyTimerEffect],
  ["daily-flag", applyDailyFlagEffect],
  ["unlock-place", applyUnlockPlaceEffect],
  ["relocate", applyRelocateEffect],
  ["relationship", applyRelationshipEffect],
  ["money", applyMoneyEffect],
  ["skill", applySkillEffect],
  ["stat", applyStatEffect],
  ["grade", applyGradeEffect],
  ["attendance", applyAttendanceEffect],
]);

for (const op of WG_EFFECT_OPS) {
  if (!EFFECT_HANDLERS.has(op)) {
    throw new Error(`WG effect '${op}' has no runtime handler`);
  }
}
for (const op of EFFECT_HANDLERS.keys()) {
  if (!WG_EFFECT_OPS.includes(op)) {
    throw new Error(`WG runtime handler '${op}' has no effect specification`);
  }
}

export const WG_EFFECT_HANDLER_OPS = Object.freeze([...EFFECT_HANDLERS.keys()]);

function runtimeHandler(effect) {
  validateWGEffectReferences(effect, WG_RUNTIME_EFFECT_CATALOG, { fail });
  const handler = EFFECT_HANDLERS.get(effect.op);
  if (!handler) fail(`Unknown WG effect '${String(effect.op)}'`);
  return handler;
}

export function applyWGEffect(game, effect) {
  runtimeHandler(effect)(game, effect);
}

export function applyWGEffects(game, effects) {
  if (!Array.isArray(effects)) fail("WG effect collections must be arrays");
  const handlers = effects.map(runtimeHandler);
  for (let index = 0; index < effects.length; index += 1) {
    handlers[index](game, effects[index]);
  }
}
