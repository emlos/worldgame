import { WG_BUNDLE } from "../../../../generated/wg/scenes.js";
import { evaluateWGExpression, resolveWGPath } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";

export const PLAYER_HOME_WG_SCENE_ID = "taylor.study.peek";

export class WGRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = "WGRuntimeError";
  }
}

function fail(message) {
  throw new WGRuntimeError(message);
}

export function getWGScene(sceneId) {
  const id = String(sceneId);
  return WG_BUNDLE.scenes[id] || null;
}

function storyParent(game, path) {
  if (!Array.isArray(path) || path[0] !== "story" || path.length < 2) {
    fail("WG story mutations require a story.* path");
  }

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

function applyWGEffect(game, effect) {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    fail("WG effects must be objects");
  }

  if (effect.op === "set" || effect.op === "add") {
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
    return;
  }

  if (effect.op === "flag") {
    if (typeof effect.flag !== "string" || !effect.flag) fail("WG flag effect needs an id");
    game.setFlag(effect.flag, effect.value);
    return;
  }

  if (effect.op === "relationship") {
    if (!game.npcs.has(String(effect.npcId))) {
      fail(`WG relationship effect references unknown NPC '${String(effect.npcId)}'`);
    }
    if (!Number.isFinite(effect.amount)) fail("WG relationship effect needs a finite amount");
    game.player.bumpRelationship(effect.npcId, effect.amount);
    return;
  }

  fail(`Unknown WG effect '${String(effect.op)}'`);
}

export function applyWGEffects(game, effects) {
  if (!Array.isArray(effects)) fail("WG effect collections must be arrays");
  for (const effect of effects) applyWGEffect(game, effect);
}

export function enterWGScene(game, sceneId) {
  const definition = getWGScene(sceneId);
  if (!definition) fail(`Unknown WG scene '${String(sceneId)}'`);

  game.currentStorySceneId = definition.id;
  game.storySceneRevision += 1;
  applyWGEffects(game, definition.onEnter || []);
}

export function exitWGScene(game) {
  game.currentStorySceneId = null;
  game.storySceneRevision += 1;
}

export function followWGChoice(game, choice) {
  applyWGEffects(game, choice.action.effects || []);
  if (choice.action.target === "@exit") exitWGScene(game);
  else enterWGScene(game, choice.action.target);
}
