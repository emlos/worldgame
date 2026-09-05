import {
  getEligibleWGPoolScenes,
  selectWGPoolScene,
} from "./sceneExposure.js";
import { enterWGTarget, resolveActiveWGStory } from "./storyRuntime.js";

export const WG_INTERRUPT_POOL_ID = "interrupt";

function interruptState(game) {
  const state = game?.interruptState;
  if (
    !state ||
    !Array.isArray(state.latchedSceneIds) ||
    !(state.active === null || typeof state.active === "object") ||
    !(state.pending === null || typeof state.pending === "object")
  ) {
    throw new TypeError("Game interrupt state is invalid");
  }
  return state;
}

function interruptRecord(scene, game) {
  return {
    sceneId: String(scene.id),
    priority: Number(scene.priority ?? 0),
    triggeredAt: game.now.toISOString(),
  };
}

function activateInterrupt(game, record) {
  const state = interruptState(game);
  state.pending = null;
  state.active = { ...record };
  enterWGTarget(game, record.sceneId);
  resolveActiveWGStory(game);
  return true;
}

function refreshLatches(state, eligibleScenes) {
  const eligibleIds = new Set(eligibleScenes.map((scene) => String(scene.id)));
  state.latchedSceneIds = state.latchedSceneIds.filter((id) =>
    eligibleIds.has(String(id)),
  );
}

/**
 * Evaluate authored interrupts after action effects and elapsed time, but before
 * the action's ordinary destination or automatic arrival event is entered.
 * Returns true when the ordinary post-time action must be skipped.
 */
export function resolveWGInterruptCheckpoint(
  game,
  { deferForScene = false } = {},
) {
  const state = interruptState(game);
  const eligible = getEligibleWGPoolScenes(game, WG_INTERRUPT_POOL_ID);
  refreshLatches(state, eligible);

  // Recovery scenes cannot recursively interrupt themselves.
  if (state.active !== null) return false;

  const latched = new Set(state.latchedSceneIds.map(String));
  const fresh = eligible.filter((scene) => !latched.has(String(scene.id)));
  if (!fresh.length) return false;

  // Latch every currently eligible variant. This prevents a generic fallback
  // from firing immediately after a more specific variant has been handled.
  state.latchedSceneIds = [...new Set([
    ...state.latchedSceneIds.map(String),
    ...eligible.map((scene) => String(scene.id)),
  ])].sort();

  const selected = selectWGPoolScene(
    fresh,
    game.getRNG("wg-interrupts"),
  );
  if (!selected) return false;
  const record = interruptRecord(selected, game);

  if (deferForScene) {
    if (
      state.pending === null ||
      record.priority > Number(state.pending.priority)
    ) {
      state.pending = record;
    }
    return false;
  }

  return activateInterrupt(game, record);
}

/** Run after the ordinary story transition so a queued scene interrupt can fire. */
export function finalizeWGInterruptCheckpoint(game) {
  const state = interruptState(game);

  if (
    state.active !== null &&
    game.currentStory?.id !== state.active.sceneId
  ) {
    state.active = null;
  }

  if (state.active !== null || state.pending === null) return false;
  if (game.currentStory) return false;
  return activateInterrupt(game, state.pending);
}
