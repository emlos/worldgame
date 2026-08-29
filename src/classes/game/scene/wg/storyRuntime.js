import { WG_BUNDLE } from "../../../../generated/wg/scenes.js";
import { applyWGEffects } from "./effectRuntime.js";
import { resolveWGBody } from "./storyResolver.js";
import { createWGSystemState } from "./storySystemRegistry.js";
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

export { applyWGEffects };

export function getWGScene(sceneId) {
  const id = String(sceneId);
  return WG_BUNDLE.scenes[id] || null;
}

export function getWGSequence(sequenceId) {
  const id = String(sequenceId);
  return WG_BUNDLE.sequences?.[id] || null;
}

function activeStoryBody(game) {
  const frame = game.currentStory;
  if (!frame) return null;
  if (frame.type === "scene") {
    const definition = getWGScene(frame.id);
    if (!definition) fail(`Unknown active WG scene '${String(frame.id)}'`);
    return {
      nodes: definition.body,
      instanceKey: [
        "scene",
        definition.id,
        game.storyRevision,
        game.now.toISOString(),
      ].join(":"),
    };
  }
  if (frame.type === "sequence") {
    const definition = getWGSequence(frame.id);
    if (!definition) fail(`Unknown active WG sequence '${String(frame.id)}'`);
    const passage = definition.passages?.find(
      (candidate) => candidate.id === frame.passageId,
    );
    if (!passage) {
      fail(`Unknown active passage '${String(frame.passageId)}' in '${frame.id}'`);
    }
    return {
      nodes: passage.body,
      instanceKey: [
        "sequence",
        definition.id,
        passage.id,
        game.storyRevision,
        game.now.toISOString(),
      ].join(":"),
    };
  }
  fail(`Unknown active WG story type '${String(frame.type)}'`);
}

export function resolveActiveWGStory(game) {
  const frame = game.currentStory;
  if (!frame) return null;
  if (frame.type === "sequence") {
    const definition = getWGSequence(frame.id);
    if (!definition) fail(`Unknown active WG sequence '${String(frame.id)}'`);
    if (definition.system) {
      if (!frame.system || frame.system.id !== definition.system.id) {
        fail(`Active WG system state does not match sequence '${definition.id}'`);
      }
      if (!Object.prototype.hasOwnProperty.call(frame.system, "state")) {
        frame.system.state = createWGSystemState(
          game,
          definition,
          frame.system.instanceKey,
        );
      }
      return frame.system;
    }
  }
  if (frame.resolution) {
    if (frame.resolution.revision !== game.storyRevision) {
      fail("Active WG story resolution does not match the story revision");
    }
    return frame.resolution;
  }

  const active = activeStoryBody(game);
  const resolution = {
    revision: game.storyRevision,
    ...resolveWGBody(game, active.nodes, { instanceKey: active.instanceKey }),
  };
  frame.resolution = resolution;
  return resolution;
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

  if (definition.system) {
    if (passageId !== null) {
      fail(`WG system sequence '${definition.id}' does not have passages`);
    }
    const revision = game.storyRevision + 1;
    game.currentStory = {
      type: "sequence",
      id: definition.id,
      system: {
        id: definition.system.id,
        instanceKey: [
          "wg-system-v1",
          definition.id,
          revision,
          game.actionRevision,
          game.now.toISOString(),
        ].join(":"),
        revision: 0,
      },
    };
    game.storyRevision = revision;
    if (runOnEnter) applyWGEffects(game, definition.onEnter || []);
    return;
  }

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

export function suspendWGContinuation(
  game,
  outcome,
  { poolId, entryId, choiceId } = {},
) {
  const frame = game.currentStory;
  if (!frame) fail("WG event pools require an active source story");
  const target = outcome?.target;
  if (typeof target !== "string" || !target) {
    fail("WG event-pool continuations require a target");
  }

  game.storyContinuations.push({
    target,
    sequenceId: outcome.sequenceId || null,
    schoolClass: frame.schoolClass ? { ...frame.schoolClass } : null,
    poolId: String(poolId),
    entryId: String(entryId),
    sourceStoryId: String(frame.id),
    sourcePassageId:
      frame.type === "sequence" ? String(frame.passageId) : null,
    sourceChoiceId: String(choiceId),
  });
}

export function returnWGStory(game) {
  const continuation = game.storyContinuations.pop();
  if (!continuation) fail("@return requires an active WG event continuation");

  if (continuation.target.startsWith(".")) {
    if (!continuation.sequenceId) {
      fail("Local WG event continuation has no owning sequence");
    }
    game.currentStory = {
      type: "sequence",
      id: continuation.sequenceId,
      passageId: continuation.sourcePassageId,
      ...(continuation.schoolClass
        ? { schoolClass: { ...continuation.schoolClass } }
        : {}),
    };
  }
  enterWGTarget(game, continuation.target, {
    sequenceId: continuation.sequenceId,
  });
}

export function exitWGStory(game) {
  game.currentStory = null;
  game.storyContinuations.length = 0;
  game.storyRevision += 1;
}

export function enterWGTarget(
  game,
  target,
  { sequenceId = null, runOnEnter = true } = {},
) {
  if (target === "@return") {
    returnWGStory(game);
    return;
  }
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
