import { PLAYER_ENERGY_RECOVERY_PER_MINUTE } from "../characters/player/stats.js";
import { dismissDailyAnnouncements } from "./announcements.js";
import { advanceGameTime } from "./timeline.js";

const ENERGY_PRECISION = 1_000_000;

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

  const startedAt = game.now.toISOString();
  let timeChange = null;
  dismissDailyAnnouncements(game);

  if (typeof apply === "function") apply(game);

  if (resting && amount > 0) {
    const energy = game.player.adjustStatBase(
      "energy",
      amount * PLAYER_ENERGY_RECOVERY_PER_MINUTE,
    );
    game.player.setStatBase(
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
  return { timeChange };
}
