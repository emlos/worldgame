import { applyElapsedPlayerState } from "../characters/player/stateDynamics.js";
import { deliverDueChats, nextChatDeadline } from "./chat/runtime.js";
import {
  announcementDayKey,
  collectDailyAnnouncements,
  emptyDailyAnnouncements,
} from "./announcements.js";
import { emitGameEvent } from "./events.js";
import { enforcePlaceClosing } from "./movement.js";
import {
  nextActiveTimerDeadline,
  processDueTimers,
  resyncTimers,
} from "./timers.js";

const MS_PER_MINUTE = 60 * 1000;

export function advanceGameTime(
  game,
  minutes,
  { drainPlayerEnergy = true, activity = "ordinary", restQuality = null } = {},
) {
  const amount = Number(minutes);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new TypeError(
      `Game.advanceMinutes requires positive minutes: ${String(minutes)}`,
    );
  }
  if (typeof drainPlayerEnergy !== "boolean") {
    throw new TypeError(
      "Game.advanceMinutes drainPlayerEnergy must be a boolean",
    );
  }
  if (!["ordinary", "free", "rest", "quiet", "exert"].includes(activity)) {
    throw new TypeError(`Unknown player activity '${String(activity)}'`);
  }

  const target = new Date(game.now.getTime() + amount * MS_PER_MINUTE);
  return changeTimeTo(game, target, {
    mode: "simulate",
    source: "advance",
    drainPlayerEnergy,
    activity,
    restQuality,
  });
}

export function jumpGameTime(game, value, { mode = "resync" } = {}) {
  const target =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(target.getTime())) {
    throw new Error(`Invalid jump date: ${value}`);
  }
  if (mode !== "resync" && mode !== "simulate") {
    throw new Error(`Unknown time jump mode: ${mode}`);
  }

  return changeTimeTo(game, target, {
    mode,
    source: "jump",
    drainPlayerEnergy: true,
    activity: "ordinary",
    restQuality: null,
  });
}

function changeTimeTo(game, target, options) {
  const firstDeadline = Math.min(
    nextChatDeadline(game),
    nextActiveTimerDeadline(game),
  );
  if (
    options.mode !== "simulate" ||
    target <= game.now ||
    firstDeadline > target.getTime()
  ) {
    return changeTimeStep(game, target, options);
  }

  const from = new Date(game.now);
  let ejectedFrom = null;
  let boundaries = 0;
  while (true) {
    const deadlineMs = Math.min(
      nextChatDeadline(game),
      nextActiveTimerDeadline(game),
    );
    if (deadlineMs > target.getTime()) break;
    if (++boundaries > 10000) {
      throw new Error("Scheduled event limit exceeded during one time advance");
    }
    const deadline = new Date(Math.max(game.now.getTime(), deadlineMs));
    if (deadline > game.now) {
      const change = changeTimeStep(game, deadline, options);
      ejectedFrom ||= change.ejectedFrom;
    }
    processDueTimers(game);
    deliverDueChats(game);
  }
  if (target > game.now) {
    const change = changeTimeStep(game, target, options);
    ejectedFrom ||= change.ejectedFrom;
  }
  return {
    from,
    to: new Date(game.now),
    minutes: (game.now - from) / MS_PER_MINUTE,
    ...options,
    ejectedFrom,
  };
}

function changeTimeStep(game, target, { mode, source, drainPlayerEnergy, activity, restQuality }) {
  const from = new Date(game.now.getTime());
  const to = new Date(target.getTime());
  const minutes = (to.getTime() - from.getTime()) / MS_PER_MINUTE;

  if (mode === "simulate" && minutes < 0) {
    throw new RangeError(
      "Simulated time changes cannot run backwards; use resync mode",
    );
  }
  if (minutes === 0) {
    return { from, to, minutes, mode, source, drainPlayerEnergy, activity };
  }

  if (mode === "simulate") {
    game.world.advance(minutes);
    for (const npc of game.npcs.values()) {
      npc.brain?.updateTo(game.now, game);
    }
  } else {
    game.world.setDate(to);
    for (const npc of game.npcs.values()) {
      npc.brain?.resyncAt(game.now, game);
    }
    if (to > from) resyncTimers(game, to);
  }

  applyElapsedPlayerState(game, minutes, {
    drainEnergy: drainPlayerEnergy,
    activity,
    restQuality,
  });
  clearDailyFlagsAfterDateChange(game, from, game.now);
  const ejectedFrom = enforcePlaceClosing(game, from, game.now);
  syncDailyAnnouncementsAfterDateChange(game, from, game.now);

  const change = {
    from,
    to: new Date(game.now.getTime()),
    minutes,
    mode,
    source,
    drainPlayerEnergy,
    activity,
    ejectedFrom,
  };
  game.features.handleTimeChange(game, change);
  if (mode === "simulate") {
    emitGameEvent(game, "time", [game, minutes, change]);
  } else {
    emitGameEvent(game, "timeJump", [game, change]);
  }
  return change;
}

function clearDailyFlagsAfterDateChange(game, from, to) {
  const sameUtcDay =
    from.getUTCFullYear() === to.getUTCFullYear() &&
    from.getUTCMonth() === to.getUTCMonth() &&
    from.getUTCDate() === to.getUTCDate();
  if (!sameUtcDay) game.dailyFlags.clear();
}

function syncDailyAnnouncementsAfterDateChange(game, from, to) {
  if (announcementDayKey(from) === announcementDayKey(to)) return;
  game.dailyAnnouncements =
    to > from
      ? collectDailyAnnouncements(game, to)
      : emptyDailyAnnouncements(to);
}
