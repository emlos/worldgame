import { WG_BUNDLE } from "../../../../generated/wg/scenes.js";
import { evaluateWGExpression, resolveWGPath } from "./expressionEvaluator.js";
import { createWGRuntimeContext } from "./runtimeContext.js";
import { SKILLS, STATS } from "../../../../data/player/stats.js";
import { SCHOOL_SUBJECTS } from "../../../../data/player/education.js";
import {
  getSchoolDayState,
  SCHOOL_PHASE,
} from "../../../../data/player/schedule.js";

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

export function getWGSequence(sequenceId) {
  const id = String(sequenceId);
  return WG_BUNDLE.sequences?.[id] || null;
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

  if (effect.op === "daily-flag") {
    if (typeof effect.flag !== "string" || !effect.flag) {
      fail("WG daily-flag effect needs an id");
    }
    game.setDailyFlag(effect.flag, effect.value);
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
    game.player.adjustSubjectGrade(effect.id, effect.amount);
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

export function enterWGScene(game, sceneId, { runOnEnter = true } = {}) {
  const definition = getWGScene(sceneId);
  if (!definition) fail(`Unknown WG scene '${String(sceneId)}'`);

  game.currentStory = { type: "scene", id: definition.id };
  game.storyRevision += 1;
  if (runOnEnter) applyWGEffects(game, definition.onEnter || []);
}

export function enterWGSequence(game, sequenceId, passageId = null, { runOnEnter = true } = {}) {
  const definition = getWGSequence(sequenceId);
  if (!definition) fail(`Unknown WG sequence '${String(sequenceId)}'`);

  let resolvedPassageId = passageId ?? definition.passages?.[0]?.id;
  let schoolClass = null;
  if (definition.schoolClass && runOnEnter) {
    const state = getSchoolDayState(game);
    const subjectId = definition.schoolClass.subjectId;
    if (!state.atSchool || state.phase !== SCHOOL_PHASE.class) {
      fail(`School class '${definition.id}' can only begin during class at school`);
    }
    if (state.subjectId !== subjectId) {
      fail(
        `School class '${definition.id}' requires '${subjectId}', but '${String(state.subjectId)}' is scheduled`,
      );
    }
    if (!Number.isInteger(state.segment) || state.segment < 1) {
      fail(`School class '${definition.id}' has no active timetable segment`);
    }
    if (
      typeof state.periodStartsAt !== "string" ||
      !Number.isFinite(state.minutesIntoPeriod)
    ) {
      fail(`School class '${definition.id}' has invalid arrival timing`);
    }

    resolvedPassageId = `segment-${state.segment}`;
    schoolClass = {
      periodId: state.periodId,
      subjectId,
      scheduledAt: state.periodStartsAt,
      arrivedAt: game.now.toISOString(),
      minutesLate: Math.max(0, state.minutesIntoPeriod),
      startingSegment: state.segment,
    };
  } else if (
    !runOnEnter &&
    game.currentStory?.type === "sequence" &&
    game.currentStory.id === definition.id &&
    game.currentStory.schoolClass
  ) {
    schoolClass = { ...game.currentStory.schoolClass };
  }

  if (!definition.passages?.some((passage) => passage.id === resolvedPassageId)) {
    fail(`Unknown passage '${String(resolvedPassageId)}' in WG sequence '${definition.id}'`);
  }

  game.currentStory = {
    type: "sequence",
    id: definition.id,
    passageId: resolvedPassageId,
    ...(schoolClass ? { schoolClass } : {}),
  };
  game.storyRevision += 1;
  if (runOnEnter) applyWGEffects(game, definition.onEnter || []);
}

export function exitWGStory(game) {
  game.currentStory = null;
  game.storyRevision += 1;
}

export function enterWGTarget(
  game,
  target,
  { sequenceId = null, runOnEnter = true } = {},
) {
  if (target === "@exit") {
    exitWGStory(game);
    return;
  }
  if (typeof target !== "string" || !target) fail("WG story targets must be non-empty strings");
  if (target.startsWith(".")) {
    if (!sequenceId) fail(`Local passage target '${target}' has no owning sequence`);
    enterWGSequence(game, sequenceId, target.slice(1), { runOnEnter: false });
    return;
  }
  if (getWGScene(target)) {
    enterWGScene(game, target, { runOnEnter });
    return;
  }
  if (getWGSequence(target)) {
    enterWGSequence(game, target, null, { runOnEnter });
    return;
  }
  fail(`Unknown WG story target '${target}'`);
}

export function followWGChoice(game, choice) {
  followWGOutcome(game, choice.action);
}

export function followWGOutcome(game, outcome) {
  applyWGEffects(game, outcome.effects || []);
  enterWGTarget(game, outcome.target, { sequenceId: outcome.sequenceId || null });
}

export function advanceWGSequence(game, action) {
  const frame = game.currentStory;
  if (frame?.type !== "sequence" || frame.id !== action.sequenceId) {
    fail("WG sequence navigation no longer matches the active sequence");
  }
  enterWGTarget(game, action.target, {
    sequenceId: action.sequenceId,
    runOnEnter: false,
  });
}
