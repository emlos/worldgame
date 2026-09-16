import { applyWGEffects } from "../story/wg/runtime/effectRuntime.js";
import { DEFAULT_FEATURE_CATALOG } from "../features/index.js";
import {
  GameTimerError,
  failTimer as fail,
  parseTimerClock as parseClock,
  timerIntervalDuration as intervalDuration,
  timerOnceDuration as onceDuration,
  validateTimerDefinition,
} from "./timerDefinitionContract.js";
import {
  failSave,
  requiredSaveField,
  saveDateMilliseconds,
  saveInteger,
  saveRecord,
} from "../shared/util/saveValidation.js";

function validDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(`${label} must be a valid date`);
  return date;
}

function daysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function monthlyCandidate(year, month, day, hour, minute) {
  return new Date(
    Date.UTC(year, month, Math.min(day, daysInUtcMonth(year, month)), hour, minute),
  );
}

export { GameTimerError, validateTimerDefinition };

export function getTimerDefinition(id, features = DEFAULT_FEATURE_CATALOG) {
  const key = String(id);
  return Object.prototype.hasOwnProperty.call(features.timerDefinitions, key)
    ? features.timerDefinitions[key]
    : null;
}

export function validateTimerStateSave(
  value,
  { path = "save.timers", gameTime, features = DEFAULT_FEATURE_CATALOG },
) {
  const timers = saveRecord(value, path);
  for (const [id, stateData] of Object.entries(timers)) {
    const timerPath = `${path}.${id}`;
    if (!getTimerDefinition(id, features)) failSave(timerPath, `references unknown timer '${id}'`);
    const state = saveRecord(stateData, timerPath);
    const dueAt = saveDateMilliseconds(
      requiredSaveField(state, "dueAt", timerPath),
      `${timerPath}.dueAt`,
    );
    if (dueAt <= gameTime) {
      failSave(`${timerPath}.dueAt`, "must be after the current game clock");
    }
    saveInteger(
      requiredSaveField(state, "occurrences", timerPath),
      `${timerPath}.occurrences`,
      { min: 0, max: Number.MAX_SAFE_INTEGER },
    );
  }
  return timers;
}

function requireTimerDefinition(id, features = DEFAULT_FEATURE_CATALOG) {
  const key = String(id);
  const definition = getTimerDefinition(key, features);
  if (!definition) fail(`Unknown timer '${key}'`);
  return { id: key, definition };
}

export function initialTimerDeadline(schedule, fromValue) {
  const from = validDate(fromValue, "Timer start time");

  if (schedule.kind === "interval") {
    return new Date(from.getTime() + intervalDuration(schedule));
  }
  if (schedule.kind === "once") {
    return new Date(from.getTime() + onceDuration(schedule));
  }
  if (schedule.kind === "weekly") {
    const { hour, minute } = parseClock(schedule.at);
    const daysAhead = (schedule.weekday - from.getUTCDay() + 7) % 7;
    const candidate = new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate() + daysAhead,
        hour,
        minute,
      ),
    );
    if (candidate <= from) candidate.setUTCDate(candidate.getUTCDate() + 7);
    return candidate;
  }
  if (schedule.kind === "monthly") {
    const { hour, minute } = parseClock(schedule.at);
    let year = from.getUTCFullYear();
    let month = from.getUTCMonth();
    let candidate = monthlyCandidate(year, month, schedule.day, hour, minute);
    if (candidate <= from) {
      month += 1;
      if (month > 11) {
        year += 1;
        month = 0;
      }
      candidate = monthlyCandidate(year, month, schedule.day, hour, minute);
    }
    return candidate;
  }
  fail(`Unknown timer schedule kind '${String(schedule?.kind)}'`);
}

export function nextTimerDeadlineForSchedule(schedule, previousValue) {
  const previous = validDate(previousValue, "Previous timer deadline");
  if (schedule.kind === "interval") {
    return new Date(previous.getTime() + intervalDuration(schedule));
  }
  if (schedule.kind === "weekly") {
    const next = new Date(previous.getTime());
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (schedule.kind === "monthly") {
    const { hour, minute } = parseClock(schedule.at);
    let year = previous.getUTCFullYear();
    let month = previous.getUTCMonth() + 1;
    if (month > 11) {
      year += 1;
      month = 0;
    }
    return monthlyCandidate(year, month, schedule.day, hour, minute);
  }
  if (schedule.kind === "once") return null;
  fail(`Unknown timer schedule kind '${String(schedule?.kind)}'`);
}

function timerState(game) {
  if (!game?.timers || typeof game.timers !== "object" || Array.isArray(game.timers)) {
    fail("Game timer state must be an object");
  }
  return game.timers;
}

function freshTimerState(definition, now) {
  return {
    dueAt: initialTimerDeadline(definition.schedule, now).toISOString(),
    occurrences: 0,
  };
}

export function startTimer(game, id) {
  const { id: key, definition } = requireTimerDefinition(id, game.features);
  const timers = timerState(game);
  if (Object.prototype.hasOwnProperty.call(timers, key)) return false;
  timers[key] = freshTimerState(definition, game.now);
  return true;
}

export function restartTimer(game, id) {
  const { id: key, definition } = requireTimerDefinition(id, game.features);
  timerState(game)[key] = freshTimerState(definition, game.now);
  return true;
}

export function stopTimer(game, id) {
  const { id: key } = requireTimerDefinition(id, game.features);
  return delete timerState(game)[key];
}

export function nextActiveTimerDeadline(game) {
  let earliest = Infinity;
  for (const state of Object.values(timerState(game))) {
    const dueAt = new Date(state?.dueAt).getTime();
    if (!Number.isFinite(dueAt)) fail("Active timer has an invalid deadline");
    earliest = Math.min(earliest, dueAt);
  }
  return earliest;
}

function advanceRepeatingDeadline(definition, previous) {
  const next = nextTimerDeadlineForSchedule(definition.schedule, previous);
  if (!next || next <= previous) fail("Repeating timer did not advance its deadline");
  return next;
}

export function processDueTimers(game) {
  const timers = timerState(game);
  const nowMs = game.now.getTime();
  const dueIds = Object.keys(timers)
    .filter((id) => new Date(timers[id]?.dueAt).getTime() <= nowMs)
    .sort();

  for (const id of dueIds) {
    const state = timers[id];
    if (!state || new Date(state.dueAt).getTime() > nowMs) continue;
    const { definition } = requireTimerDefinition(id, game.features);
    const dueAt = validDate(state.dueAt, `Timer '${id}' deadline`);
    const occurrence = Number(state.occurrences) + 1;
    if (!Number.isSafeInteger(occurrence) || occurrence <= 0) {
      fail(`Timer '${id}' has an invalid occurrence count`);
    }

    const previousState = {
      dueAt: state.dueAt,
      occurrences: state.occurrences,
    };
    if (definition.repeat) {
      state.dueAt = advanceRepeatingDeadline(definition, dueAt).toISOString();
      state.occurrences = occurrence;
    } else {
      delete timers[id];
    }
    try {
      if (definition.effects) applyWGEffects(game, definition.effects);
      else definition.onDue(game, { id, dueAt: new Date(dueAt), occurrence });
    } catch (error) {
      state.dueAt = previousState.dueAt;
      state.occurrences = previousState.occurrences;
      timers[id] = state;
      throw error;
    }
  }
  return dueIds.length;
}

export function resyncTimers(game, targetValue) {
  const timers = timerState(game);
  const target = validDate(targetValue, "Timer resync target");

  for (const id of Object.keys(timers).sort()) {
    const state = timers[id];
    const { definition } = requireTimerDefinition(id, game.features);
    let dueAt = validDate(state.dueAt, `Timer '${id}' deadline`);
    if (dueAt > target) continue;

    if (!definition.repeat) {
      delete timers[id];
      continue;
    }

    let skipped = 0;
    while (dueAt <= target) {
      dueAt = advanceRepeatingDeadline(definition, dueAt);
      skipped += 1;
      if (skipped > 1_000_000) fail(`Timer '${id}' resync limit exceeded`);
    }
    state.dueAt = dueAt.toISOString();
  }
}
