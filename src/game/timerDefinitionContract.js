import { validateWGEffectShape } from "../story/wg/shared/effects/registry.js";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/;

export class GameTimerError extends Error {
  constructor(message) {
    super(message);
    this.name = "GameTimerError";
  }
}

export function failTimer(message) {
  throw new GameTimerError(message);
}

export function parseTimerClock(value) {
  const match = String(value ?? "").match(CLOCK_PATTERN);
  if (!match) failTimer("Timer calendar schedules require an HH:MM UTC time");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    failTimer("Timer calendar schedules require an HH:MM UTC time");
  }
  return { hour, minute };
}

function intervalMilliseconds(schedule, field, unit) {
  const amount = Number(schedule[field]);
  if (!Number.isFinite(amount) || amount <= 0) {
    failTimer(`Timer ${schedule.kind} schedule requires positive ${field}`);
  }
  return amount * unit;
}

export function timerIntervalDuration(schedule) {
  const hasHours = Object.prototype.hasOwnProperty.call(schedule, "hours");
  const hasDays = Object.prototype.hasOwnProperty.call(schedule, "days");
  if (hasHours === hasDays) {
    failTimer("Timer interval schedule requires exactly one of hours or days");
  }
  return hasHours
    ? intervalMilliseconds(schedule, "hours", MS_PER_HOUR)
    : intervalMilliseconds(schedule, "days", MS_PER_DAY);
}

export function timerOnceDuration(schedule) {
  return intervalMilliseconds(schedule, "afterHours", MS_PER_HOUR);
}

export function validateTimerDefinition(id, definition) {
  if (typeof id !== "string" || !id) failTimer("Timer definitions require an id");
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    failTimer(`Timer '${id}' definition must be an object`);
  }
  const schedule = definition.schedule;
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    failTimer(`Timer '${id}' requires a schedule`);
  }
  if (typeof definition.repeat !== "boolean") {
    failTimer(`Timer '${id}' requires an explicit repeat boolean`);
  }
  const definesEffects = Object.prototype.hasOwnProperty.call(definition, "effects");
  const definesCallback = Object.prototype.hasOwnProperty.call(definition, "onDue");
  if (definesEffects && !Array.isArray(definition.effects)) {
    failTimer(`Timer '${id}' effects must be an array`);
  }
  if (definesCallback && typeof definition.onDue !== "function") {
    failTimer(`Timer '${id}' onDue must be a function`);
  }
  const hasEffects = definesEffects && Array.isArray(definition.effects);
  const hasCallback = definesCallback && typeof definition.onDue === "function";
  if (hasEffects === hasCallback) {
    failTimer(`Timer '${id}' requires exactly one of effects or an onDue callback`);
  }
  if (hasEffects) {
    if (!definition.effects.length) failTimer(`Timer '${id}' effects cannot be empty`);
    for (const effect of definition.effects) {
      validateWGEffectShape(effect, {
        fail: (message) => failTimer(`Timer '${id}' has invalid effects: ${message}`),
      });
    }
  }

  if (schedule.kind === "interval") timerIntervalDuration(schedule);
  else if (schedule.kind === "once") {
    timerOnceDuration(schedule);
    if (definition.repeat) failTimer(`One-shot timer '${id}' cannot repeat`);
  } else if (schedule.kind === "weekly") {
    if (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6) {
      failTimer(`Timer '${id}' weekly weekday must be an integer from 0 to 6`);
    }
    parseTimerClock(schedule.at);
  } else if (schedule.kind === "monthly") {
    if (!Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > 31) {
      failTimer(`Timer '${id}' monthly day must be an integer from 1 to 31`);
    }
    parseTimerClock(schedule.at);
  } else {
    failTimer(`Timer '${id}' has unknown schedule kind '${String(schedule.kind)}'`);
  }
  return definition;
}
