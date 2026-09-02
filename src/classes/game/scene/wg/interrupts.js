import {
  getEligibleWGPoolEntries,
  selectWGPoolEntry,
} from "./entryResolver.js";
import { enterWGTarget, resolveActiveWGStory } from "./storyRuntime.js";

export const WG_INTERRUPT_POOL_ID = "interrupt";

function interruptState(game) {
  const state = game?.interruptState;
  if (
    !state ||
    !Array.isArray(state.latchedEntryIds) ||
    !(state.active === null || typeof state.active === "object") ||
    !(state.pending === null || typeof state.pending === "object")
  ) {
    throw new TypeError("Game interrupt state is invalid");
  }
  return state;
}

function interruptRecord(entry, game) {
  return {
    entryId: String(entry.id),
    sceneId: String(entry.sceneId),
    priority: Number(entry.priority ?? 0),
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

function refreshLatches(state, eligibleEntries) {
  const eligibleIds = new Set(eligibleEntries.map((entry) => String(entry.id)));
  state.latchedEntryIds = state.latchedEntryIds.filter((id) =>
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
  { deferForSequence = false } = {},
) {
  const state = interruptState(game);
  const eligible = getEligibleWGPoolEntries(game, WG_INTERRUPT_POOL_ID);
  refreshLatches(state, eligible);

  // Recovery scenes cannot recursively interrupt themselves.
  if (state.active !== null) return false;

  const latched = new Set(state.latchedEntryIds.map(String));
  const fresh = eligible.filter((entry) => !latched.has(String(entry.id)));
  if (!fresh.length) return false;

  // Latch every currently eligible variant. This prevents a generic fallback
  // from firing immediately after a more specific variant has been handled.
  state.latchedEntryIds = [...new Set([
    ...state.latchedEntryIds.map(String),
    ...eligible.map((entry) => String(entry.id)),
  ])].sort();

  const selected = selectWGPoolEntry(
    fresh,
    game.getRNG("wg-interrupts"),
  );
  if (!selected) return false;
  const record = interruptRecord(selected, game);

  if (deferForSequence) {
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

/** Run after the ordinary story transition so a queued sequence interrupt can fire. */
export function finalizeWGInterruptCheckpoint(game) {
  const state = interruptState(game);

  if (
    state.active !== null &&
    game.currentStory?.id !== state.active.sceneId
  ) {
    state.active = null;
  }

  if (state.active !== null || state.pending === null) return false;
  if (game.currentStory?.type === "sequence") return false;
  return activateInterrupt(game, state.pending);
}
