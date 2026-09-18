import { PLAYER_ENERGY_RECOVERY_PER_MINUTE } from "../characters/player/stats.js";
import {
  failSave,
  requiredSaveField,
  saveArray,
  saveDateMilliseconds,
  saveInteger,
  saveRecord,
  saveString,
} from "../shared/util/saveValidation.js";
import { WorldTime } from "../world/model/time.js";
import {
  beginGameEventTransaction,
  commitGameEventTransaction,
  rollbackGameEventTransaction,
} from "./events.js";
import { advanceGameTime } from "./timeline.js";
import { refreshJournalAvailability } from "./journal/runtime.js";

const ENERGY_PRECISION = 1_000_000;
const CHECKPOINT_ROOT_KEYS = new Set(["features", "_listeners"]);

export function validateActionHistorySave(save, { path = "save", gameTime }) {
  saveInteger(
    requiredSaveField(save, "actionRevision", path),
    `${path}.actionRevision`,
    { min: 0 },
  );
  const log = saveArray(requiredSaveField(save, "log", path), `${path}.log`);
  log.forEach((entryData, index) => {
    const entryPath = `${path}.log[${index}]`;
    const entry = saveRecord(entryData, entryPath);
    const timestamp = saveDateMilliseconds(
      requiredSaveField(entry, "t", entryPath),
      `${entryPath}.t`,
    );
    if (timestamp > gameTime)
      failSave(`${entryPath}.t`, "cannot be after the game clock");
    saveString(
      requiredSaveField(entry, "label", entryPath),
      `${entryPath}.label`,
      {
        nonEmpty: true,
      },
    );
  });
  return log;
}

export function runGameAction(
  game,
  {
    label,
    minutes = 0,
    energyFree = false,
    resting = false,
    apply,
    after,
    interrupt,
  },
) {
  let amount = 0;
  if (minutes !== 0) {
    amount = Number(minutes);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new TypeError(
        `runAction requires positive minutes: ${String(minutes)}`,
      );
    }
  }
  if (typeof energyFree !== "boolean") {
    throw new TypeError("runAction energyFree must be a boolean");
  }
  if (typeof resting !== "boolean") {
    throw new TypeError("runAction resting must be a boolean");
  }
  if (resting && !energyFree) {
    throw new TypeError("runAction resting actions must be energy-free");
  }

  const checkpoint = captureActionCheckpoint(game);
  const startedAt = game.now.toISOString();
  let timeChange = null;

  beginGameEventTransaction(game);
  try {
    if (typeof apply === "function") apply(game);

    if (resting && amount > 0) {
      const energy = game.player.adjustStat(
        "energy",
        amount * PLAYER_ENERGY_RECOVERY_PER_MINUTE,
      );
      game.player.setStatValue(
        "energy",
        Math.round(energy * ENERGY_PRECISION) / ENERGY_PRECISION,
      );
    }

    if (amount > 0) {
      timeChange = advanceGameTime(game, amount, {
        drainPlayerEnergy: !energyFree,
      });
    }

    const skipAfter =
      typeof interrupt === "function"
        ? interrupt(game, "before-after", timeChange) === true
        : false;
    if (!skipAfter && typeof after === "function") after(game);
    if (typeof interrupt === "function") {
      interrupt(game, "after-after", timeChange);
    }

    game.actionRevision += 1;
    if (typeof label === "string" && label) {
      game.log.push({ t: startedAt, label });
    }
    refreshJournalAvailability(game);
  } catch (error) {
    rollbackGameEventTransaction(game);
    restoreActionCheckpoint(game, checkpoint);
    throw error;
  }

  // Events are observable side effects. Publish them only after the game state
  // has committed so a later action failure can never leak an event describing
  // state that was subsequently rolled back. Listener failures happen after
  // commit and therefore must not rewind the committed game state.
  commitGameEventTransaction(game);
  return { timeChange };
}

function captureActionCheckpoint(game) {
  const listeners = game._listeners;
  const listenerSets = Object.fromEntries(
    Object.entries(listeners).map(([name, callbacks]) => [name, callbacks]),
  );
  const listenerMembership = Object.fromEntries(
    Object.entries(listeners).map(([name, callbacks]) => [
      name,
      [...callbacks],
    ]),
  );

  return {
    save: game.toJSON(),
    references: captureReferenceGraph(game, {
      rootSkippedKeys: CHECKPOINT_ROOT_KEYS,
    }),
    listeners,
    listenerSets,
    listenerMembership,
  };
}

function restoreActionCheckpoint(game, checkpoint) {
  const restored = game.constructor.fromJSON(checkpoint.save, {
    features: game.features,
  });

  restoreReferenceGraph(checkpoint.references, restored);
  restoreListeners(game, checkpoint);
}

function restoreListeners(game, checkpoint) {
  game._listeners = checkpoint.listeners;

  for (const name of Object.keys(game._listeners)) {
    if (!Object.prototype.hasOwnProperty.call(checkpoint.listenerSets, name)) {
      delete game._listeners[name];
    }
  }

  for (const [name, listeners] of Object.entries(checkpoint.listenerSets)) {
    game._listeners[name] = listeners;
    listeners.clear();
    for (const callback of checkpoint.listenerMembership[name]) {
      listeners.add(callback);
    }
  }
}

function captureReferenceGraph(
  value,
  { rootSkippedKeys = new Set() } = {},
  seen = new WeakMap(),
  isRoot = true,
) {
  if (!isReference(value)) return null;
  const existing = seen.get(value);
  if (existing) return existing;

  const node = {
    value,
    children: new Map(),
    mapEntries: null,
    rootSkippedKeys: isRoot ? rootSkippedKeys : null,
  };
  seen.set(value, node);

  if (typeof value === "function" || value instanceof Date || value instanceof WorldTime) {
    return node;
  }

  if (value instanceof Map) {
    node.mapEntries = new Map();
    for (const [key, child] of value) {
      if (isReference(child)) {
        node.mapEntries.set(
          key,
          captureReferenceGraph(child, { rootSkippedKeys }, seen, false),
        );
      }
    }
    return node;
  }

  if (value instanceof Set) return node;

  const keys = Array.isArray(value) ? value.keys() : Object.keys(value);
  for (const key of keys) {
    if (isRoot && rootSkippedKeys.has(key)) continue;
    const child = value[key];
    if (!isReference(child)) continue;
    node.children.set(
      key,
      captureReferenceGraph(child, { rootSkippedKeys }, seen, false),
    );
  }
  return node;
}

function restoreReferenceGraph(root, restoredRoot) {
  const restoredToOriginal = new WeakMap();
  restoreReferenceNode(root, restoredRoot, restoredToOriginal, true);
}

function restoreReferenceNode(node, restored, restoredToOriginal, isRoot = false) {
  const original = node.value;
  if (!isReference(restored)) return restored;

  const alreadyMapped = restoredToOriginal.get(restored);
  if (alreadyMapped) return alreadyMapped;
  restoredToOriginal.set(restored, original);

  if (typeof original === "function") {
    if (
      typeof original.setState === "function" &&
      typeof restored.getState === "function"
    ) {
      original.setState(restored.getState());
    }
    return original;
  }

  if (original instanceof Date && restored instanceof Date) {
    original.setTime(restored.getTime());
    return original;
  }

  if (original instanceof WorldTime && restored instanceof WorldTime) {
    original.setDate(restored.toDate());
    return original;
  }

  if (original instanceof Set && restored instanceof Set) {
    original.clear();
    for (const value of restored) original.add(value);
    return original;
  }

  if (original instanceof Map && restored instanceof Map) {
    const entries = [];
    for (const [key, restoredValue] of restored) {
      const childNode = node.mapEntries?.get(key);
      entries.push([
        key,
        childNode && isReference(restoredValue)
          ? restoreReferenceNode(childNode, restoredValue, restoredToOriginal)
          : restoredValue,
      ]);
    }
    original.clear();
    for (const entry of entries) original.set(...entry);
    return original;
  }

  if (Object.isFrozen(original)) return original;

  const skippedKeys = isRoot ? node.rootSkippedKeys : null;
  for (const key of Object.keys(original)) {
    if (skippedKeys?.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(restored, key)) {
      const descriptor = Object.getOwnPropertyDescriptor(original, key);
      if (descriptor?.configurable !== false) delete original[key];
    }
  }

  const restoredKeys = Array.isArray(restored)
    ? [...restored.keys()]
    : Object.keys(restored);
  if (Array.isArray(original)) original.length = restored.length;

  for (const key of restoredKeys) {
    if (skippedKeys?.has(key)) continue;

    const restoredValue = restored[key];
    const childNode = node.children.get(key);
    const value = childNode && isReference(restoredValue)
      ? restoreReferenceNode(childNode, restoredValue, restoredToOriginal)
      : restoredValue;

    const descriptor = Object.getOwnPropertyDescriptor(original, key);
    if (descriptor && !descriptor.writable && !descriptor.set) continue;
    original[key] = value;
  }

  return original;
}

function isReference(value) {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
