import { TIMER_DEFINITIONS } from "./timerDefinitions.js";
import { validateWGEffectShape } from "../story/wg/shared/effects/registry.js";
import { applyWGEffects } from "../story/wg/runtime/effectRuntime.js";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/;

export class GameTimerError extends Error {
  constructor(message) {
    super(message);
    this.name = "GameTimerError";
  }
}

function fail(message) {
  throw new GameTimerError(message);
}

function validDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(`${label} must be a valid date`);
  return date;
}

function parseClock(value) {
  const match = String(value ?? "").match(CLOCK_PATTERN);
  if (!match) fail("Timer calendar schedules require an HH:MM UTC time");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    fail("Timer calendar schedules require an HH:MM UTC time");
  }
  return { hour, minute };
}

function intervalMilliseconds(schedule, field, unit) {
  const amount = Number(schedule[field]);
  if (!Number.isFinite(amount) || amount <= 0) {
    fail(`Timer ${schedule.kind} schedule requires positive ${field}`);
  }
  return amount * unit;
}

function intervalDuration(schedule) {
  const hasHours = Object.prototype.hasOwnProperty.call(schedule, "hours");
  const hasDays = Object.prototype.hasOwnProperty.call(schedule, "days");
  if (hasHours === hasDays) {
    fail("Timer interval schedule requires exactly one of hours or days");
  }
  return hasHours
    ? intervalMilliseconds(schedule, "hours", MS_PER_HOUR)
    : intervalMilliseconds(schedule, "days", MS_PER_DAY);
}

function onceDuration(schedule) {
  return intervalMilliseconds(schedule, "afterHours", MS_PER_HOUR);
}

function daysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function monthlyCandidate(year, month, day, hour, minute) {
  return new Date(
    Date.UTC(year, month, Math.min(day, daysInUtcMonth(year, month)), hour, minute),
  );
}

export function validateTimerDefinition(id, definition) {
  if (typeof id !== "string" || !id) fail("Timer definitions require an id");
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    fail(`Timer '${id}' definition must be an object`);
  }
  const schedule = definition.schedule;
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    fail(`Timer '${id}' requires a schedule`);
  }
  if (typeof definition.repeat !== "boolean") {
    fail(`Timer '${id}' requires an explicit repeat boolean`);
  }
  const definesEffects = Object.prototype.hasOwnProperty.call(definition, "effects");
  const definesCallback = Object.prototype.hasOwnProperty.call(definition, "onDue");
  if (definesEffects && !Array.isArray(definition.effects)) {
    fail(`Timer '${id}' effects must be an array`);
  }
  if (definesCallback && typeof definition.onDue !== "function") {
    fail(`Timer '${id}' onDue must be a function`);
  }
  const hasEffects = definesEffects && Array.isArray(definition.effects);
  const hasCallback = definesCallback && typeof definition.onDue === "function";
  if (hasEffects === hasCallback) {
    fail(`Timer '${id}' requires exactly one of effects or an onDue callback`);
  }
  if (hasEffects) {
    if (!definition.effects.length) fail(`Timer '${id}' effects cannot be empty`);
    for (const effect of definition.effects) {
      validateWGEffectShape(effect, {
        fail: (message) => fail(`Timer '${id}' has invalid effects: ${message}`),
      });
    }
  }

  if (schedule.kind === "interval") intervalDuration(schedule);
  else if (schedule.kind === "once") {
    onceDuration(schedule);
    if (definition.repeat) fail(`One-shot timer '${id}' cannot repeat`);
  } else if (schedule.kind === "weekly") {
    if (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6) {
      fail(`Timer '${id}' weekly weekday must be an integer from 0 to 6`);
    }
    parseClock(schedule.at);
  } else if (schedule.kind === "monthly") {
    if (!Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > 31) {
      fail(`Timer '${id}' monthly day must be an integer from 1 to 31`);
    }
    parseClock(schedule.at);
  } else {
    fail(`Timer '${id}' has unknown schedule kind '${String(schedule.kind)}'`);
  }
  return definition;
}

for (const [id, definition] of Object.entries(TIMER_DEFINITIONS)) {
  validateTimerDefinition(id, definition);
}

export function getTimerDefinition(id) {
  const key = String(id);
  return Object.prototype.hasOwnProperty.call(TIMER_DEFINITIONS, key)
    ? TIMER_DEFINITIONS[key]
    : null;
}

function requireTimerDefinition(id) {
  const key = String(id);
  const definition = getTimerDefinition(key);
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
  const { id: key, definition } = requireTimerDefinition(id);
  const timers = timerState(game);
  if (Object.prototype.hasOwnProperty.call(timers, key)) return false;
  timers[key] = freshTimerState(definition, game.now);
  return true;
}

export function restartTimer(game, id) {
  const { id: key, definition } = requireTimerDefinition(id);
  timerState(game)[key] = freshTimerState(definition, game.now);
  return true;
}

export function stopTimer(game, id) {
  const { id: key } = requireTimerDefinition(id);
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
    const { definition } = requireTimerDefinition(id);
    const dueAt = validDate(state.dueAt, `Timer '${id}' deadline`);
    const occurrence = Number(state.occurrences) + 1;
    if (!Number.isSafeInteger(occurrence) || occurrence <= 0) {
      fail(`Timer '${id}' has an invalid occurrence count`);
    }

    if (definition.repeat) {
      state.dueAt = advanceRepeatingDeadline(definition, dueAt).toISOString();
      state.occurrences = occurrence;
    } else {
      delete timers[id];
    }
    if (definition.effects) applyWGEffects(game, definition.effects);
    else definition.onDue(game, { id, dueAt: new Date(dueAt), occurrence });
  }
  return dueIds.length;
}

export function resyncTimers(game, targetValue) {
  const timers = timerState(game);
  const target = validDate(targetValue, "Timer resync target");

  for (const id of Object.keys(timers).sort()) {
    const state = timers[id];
    const { definition } = requireTimerDefinition(id);
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
