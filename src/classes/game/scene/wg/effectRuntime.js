import { evaluateWGExpression, resolveWGPath } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";
import { SKILLS, STATS } from "../../../../data/player/stats.js";
import { SCHOOL_SUBJECTS } from "../../../../data/player/education.js";
import { PLACE_REGISTRY } from "../../../../data/world/place.js";
import { NPC_REGISTRY } from "../../../../data/npc/npcs.js";
import { addContact, startChat } from "../../chats.js";

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

export function applyWGEffect(game, effect) {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    fail("WG effects must be objects");
  }

  if (effect.op === "contact" && effect.action === "add") {
    addContact(game, effect.npcId);
    return;
  }
  if (effect.op === "chat" && effect.action === "start") {
    startChat(game, effect.id);
    return;
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

  if (effect.op === "reminder") {
    if (effect.action !== "add" && effect.action !== "clear") {
      fail("WG reminder effect requires add or clear");
    }
    try {
      if (effect.action === "add") game.addReminder(effect.id);
      else game.clearReminder(effect.id);
    } catch (error) {
      fail(error.message);
    }
    return;
  }

  if (effect.op === "daily-flag") {
    if (typeof effect.flag !== "string" || !effect.flag) {
      fail("WG daily-flag effect needs an id");
    }
    game.setDailyFlag(effect.flag, effect.value);
    return;
  }

  if (effect.op === "unlock-place") {
    if (
      typeof effect.placeKey !== "string" ||
      (!PLACE_REGISTRY.some((place) => place.key === effect.placeKey) &&
        !NPC_REGISTRY.some((npc) => `home_${npc.id}` === effect.placeKey))
    ) {
      fail("WG unlock effect references unknown place key '" + String(effect.placeKey) + "'");
    }
    game.unlockPlacesByKey(effect.placeKey);
    return;
  }

  if (effect.op === "relocate") {
    try {
      game.relocatePlayer(effect.destination);
    } catch (error) {
      fail(error.message);
    }
    return;
  }

  if (effect.op === "relationship") {
    const npc = game.npcs.get(String(effect.npcId));
    if (!npc) {
      fail(`WG relationship effect references unknown NPC '${String(effect.npcId)}'`);
    }
    if (!Number.isFinite(effect.amount)) fail("WG relationship effect needs a finite amount");
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
    return;
  }

  if (effect.op === "money") {
    if (!Number.isFinite(effect.amount)) fail("WG money effect needs a finite amount");
    if (!Number.isFinite(game.player.money + effect.amount)) {
      fail("WG money effect produced a non-finite balance");
    }
    game.player.adjustMoney(effect.amount);
    return;
  }

  if (effect.op === "skill") {
    if (!SKILLS[effect.id]) {
      fail("WG skill effect references unknown skill '" + String(effect.id) + "'");
    }
    if (!Number.isFinite(effect.amount)) fail("WG skill effect needs a finite amount");
    game.player.adjustSkill(effect.id, effect.amount);
    return;
  }

  if (effect.op === "stat") {
    if (!STATS[effect.id]) {
      fail("WG stat effect references unknown stat '" + String(effect.id) + "'");
    }
    if (!Number.isFinite(effect.amount)) fail("WG stat effect needs a finite amount");
    game.player.adjustStatBase(effect.id, effect.amount);
    return;
  }

  if (effect.op === "grade") {
    if (!SCHOOL_SUBJECTS[effect.id]) {
      fail("WG grade effect references unknown school subject '" + String(effect.id) + "'");
    }
    if (!Number.isFinite(effect.amount)) fail("WG grade effect needs a finite amount");
    game.player.adjustSubjectAchievement(effect.id, effect.amount);
    return;
  }

  if (effect.op === "attendance") {
    if (!SCHOOL_SUBJECTS[effect.id]) {
      fail("WG attendance effect references unknown school subject '" + String(effect.id) + "'");
    }
    if (!Number.isInteger(effect.amount) || effect.amount <= 0) {
      fail("WG attendance effect needs a positive whole number");
    }
    game.player.recordSubjectAttendance(effect.id, effect.amount);
    return;
  }

  fail(`Unknown WG effect '${String(effect.op)}'`);
}

export function applyWGEffects(game, effects) {
  if (!Array.isArray(effects)) fail("WG effect collections must be arrays");
  for (const effect of effects) applyWGEffect(game, effect);
}
