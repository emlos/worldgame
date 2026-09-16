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
import { advanceGameTime } from "./timeline.js";
import { refreshJournalAvailability } from "./journal/runtime.js";

const ENERGY_PRECISION = 1_000_000;

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
    return { timeChange };
  } catch (error) {
    restoreActionCheckpoint(game, checkpoint);
    throw error;
  }
}

function captureActionCheckpoint(game) {
  const listeners = game._listeners;
  const listenerMembership = Object.fromEntries(
    Object.entries(listeners).map(([name, callbacks]) => [
      name,
      [...callbacks],
    ]),
  );
  return { save: game.toJSON(), listeners, listenerMembership };
}

function restoreActionCheckpoint(game, checkpoint) {
  const restored = game.constructor.fromJSON(checkpoint.save, {
    features: game.features,
  });
  const features = game.features;

  Object.assign(game, restored);
  game.features = features;
  game._listeners = checkpoint.listeners;

  for (const [name, callbacks] of Object.entries(
    checkpoint.listenerMembership,
  )) {
    const listeners = game._listeners[name];
    listeners.clear();
    for (const callback of callbacks) listeners.add(callback);
  }
}
