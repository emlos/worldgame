import {
  deriveSeed,
  keyedRandom01,
  normalizeSeed,
  rollSeed,
} from "../../shared/util/random.js";
import { clamp01 } from "../../shared/util/util.js";
import { WeatherType, Season } from "../data/weather.js";

const HOUR_MS = 60 * 60 * 1000;
const WEATHER_SAVE_VERSION = 2;
const WEATHER_ALGORITHM_VERSION = 1;

function asValidDate(value, label = "weather date") {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error(`Invalid ${label}: ${value}`);
  return date;
}

function cloneSnapshot(snapshot) {
  return {
    date: new Date(snapshot.date.getTime()),
    kind: snapshot.kind,
    runHours: snapshot.runHours,
  };
}

function serializeSnapshot(snapshot) {
  return {
    date: snapshot.date.toISOString(),
    kind: snapshot.kind,
    runHours: snapshot.runHours,
  };
}

function restoreSnapshot(data, label) {
  if (!data || typeof data !== "object") throw new Error(`Missing ${label}`);
  return {
    date: asValidDate(data.date, `${label} date`),
    kind: String(data.kind ?? WeatherType.CLEAR),
    runHours: Math.max(0, Math.floor(Number(data.runHours) || 0)),
  };
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export class Weather {
  constructor({
    startDate = new Date(),
    initial = null,
    seed = rollSeed(),
  } = {}) {
    this._seed = normalizeSeed(seed);
    this._temperatureSeed = deriveSeed(this._seed, "temperature");
    this._checkpoints = new Map();

    const date = asValidDate(startDate, "weather start date");
    const kind =
      initial == null ? this._initialWeatherAt(date) : String(initial);
    this._origin = { date, kind, runHours: 0 };
    this._current = cloneSnapshot(this._origin);
  }

  // --- Public API ------------------------------------------------------------

  /** Returns the current weather kind (string) */
  get kind() {
    return this._current.kind;
  }

  get date() {
    return new Date(this._current.date.getTime());
  }

  get runHours() {
    return this._current.runHours;
  }

  get snapshot() {
    return cloneSnapshot(this._current);
  }

  get originDate() {
    return new Date(this._origin.date.getTime());
  }

  /** Return deterministic weather state for a date without changing current weather. */
  stateAt(date = this._current.date) {
    const target = asValidDate(date);
    if (target < this._origin.date) {
      throw new RangeError(
        `Weather history begins at ${this._origin.date.toISOString()}; cannot query ${target.toISOString()}`,
      );
    }

    return cloneSnapshot(this._simulate(this._bestSnapshotFor(target), target));
  }

  /** Commit the deterministic timeline state at a date. Rewinding is allowed within known history. */
  advanceTo(date) {
    const target = asValidDate(date);
    if (target < this._origin.date) {
      throw new RangeError(
        `Weather history begins at ${this._origin.date.toISOString()}; cannot advance to ${target.toISOString()}`,
      );
    }

    this._current = this._simulate(this._bestSnapshotFor(target), target);
    return this.snapshot;
  }

  /** Advance from the committed weather time by an arbitrary number of minutes. */
  step(minutes) {
    const amount = Number(minutes);
    if (!Number.isFinite(amount) || amount === 0) return this.snapshot;
    return this.advanceTo(
      new Date(this._current.date.getTime() + amount * 60 * 1000),
    );
  }

  /** Compute ambient temperature (°C) for a date and its deterministic weather state. */
  computeTemperature(date = this._current.date, weatherKind = null) {
    const d = asValidDate(date, "temperature date");
    const kind =
      weatherKind == null ? this.stateAt(d).kind : String(weatherKind);
    const season = Weather.monthToSeason(d.getUTCMonth() + 1);
    const [tMin, tMax] = Weather._seasonalTempBand(season);

    // Asymmetric daily cycle: exact minimum at 04:00, maximum at 15:00.
    const h =
      d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const phase = Weather._diurnalPhase(h);
    const mean = (tMin + tMax) / 2;
    const swing = (tMax - tMin) / 2;

    const base = mean + swing * phase + Weather._weatherAdjustment(kind);

    // Interpolate deterministic hourly samples so temperature changes smoothly
    // instead of receiving unrelated noise every minute.
    const timeMs = d.getTime();
    const hourIndex = Math.floor(timeMs / HOUR_MS);
    const fraction = smoothstep((timeMs - hourIndex * HOUR_MS) / HOUR_MS);
    const noise01 =
      this._temperatureNoiseAtHour(hourIndex) * (1 - fraction) +
      this._temperatureNoiseAtHour(hourIndex + 1) * fraction;
    const noise = (noise01 - 0.5) * 2;
    return Math.round((base + noise) * 10) / 10;
  }

  temperatureAt(date = this._current.date) {
    const d = asValidDate(date, "temperature date");
    return this.computeTemperature(d, this.stateAt(d).kind);
  }

  toJSON() {
    const origin = serializeSnapshot(this._origin);
    const current = serializeSnapshot(this._current);
    return {
      version: WEATHER_SAVE_VERSION,
      algorithmVersion: WEATHER_ALGORITHM_VERSION,
      seed: this._seed,
      origin,
      current,
      // Keep the current snapshot fields convenient for save inspection.
      date: current.date,
      state: current.kind,
      runHours: current.runHours,
    };
  }

  static fromJSON(data, { seed = null } = {}) {
    if (!data || typeof data !== "object") {
      throw new Error("Weather.fromJSON expects a weather save object");
    }

    const weather = Object.create(Weather.prototype);
    weather._seed = normalizeSeed(data.seed ?? seed ?? rollSeed());
    weather._temperatureSeed = deriveSeed(weather._seed, "temperature");
    weather._checkpoints = new Map();

    if (Number(data.version) !== WEATHER_SAVE_VERSION || !data.origin || !data.current) {
      throw new Error("Weather save is missing the current replayable schema");
    }
    if (Number(data.algorithmVersion) !== WEATHER_ALGORITHM_VERSION) {
      throw new Error(
        `Unsupported weather algorithm version: ${data.algorithmVersion}`,
      );
    }
    weather._origin = restoreSnapshot(data.origin, "weather origin");
    weather._current = restoreSnapshot(data.current, "current weather");

    if (weather._current.date < weather._origin.date) {
      throw new Error("Current weather date precedes weather origin");
    }
    return weather;
  }

  /** Expose a static helper so World can compute season without duplicating logic. */
  static monthToSeason(month) {
    if (month === 12 || month <= 2) return Season.WINTER;
    if (month <= 5) return Season.SPRING;
    if (month <= 8) return Season.SUMMER;
    return Season.AUTUMN;
  }

  // --- Internals -------------------------------------------------------------

  _initialWeatherAt(date) {
    const season = Weather.monthToSeason(date.getUTCMonth() + 1);
    const epochHour = Math.floor(date.getTime() / HOUR_MS);
    const roll = keyedRandom01(
      this._seed,
      `weather:v${WEATHER_ALGORITHM_VERSION}:initial:${epochHour}`,
    );
    return Weather._nextWeather(
      null,
      season,
      () => roll,
      date.getUTCHours(),
      0,
    );
  }

  _bestSnapshotFor(target) {
    const targetMs = target.getTime();
    let best = this._origin;

    if (
      this._current.date.getTime() <= targetMs &&
      this._current.date.getTime() >= best.date.getTime()
    ) {
      best = this._current;
    }

    for (const checkpoint of this._checkpoints.values()) {
      const checkpointMs = checkpoint.date.getTime();
      if (checkpointMs <= targetMs && checkpointMs > best.date.getTime())
        best = checkpoint;
    }

    return cloneSnapshot(best);
  }

  _simulate(snapshot, target) {
    const targetMs = target.getTime();
    let state = cloneSnapshot(snapshot);
    if (targetMs < state.date.getTime()) {
      throw new Error(
        "Cannot simulate weather backwards from the selected checkpoint",
      );
    }

    // Strictly after the snapshot. If target is exactly on the next boundary,
    // that transition is included and becomes the weather at that instant.
    let cursor = (Math.floor(state.date.getTime() / HOUR_MS) + 1) * HOUR_MS;
    while (cursor <= targetMs) {
      state = this._transitionAt(state, new Date(cursor));
      this._rememberCheckpoint(state);
      cursor += HOUR_MS;
    }

    state.date = new Date(targetMs);
    return state;
  }

  _transitionAt(snapshot, boundaryDate) {
    const epochHour = Math.floor(boundaryDate.getTime() / HOUR_MS);
    const season = Weather.monthToSeason(boundaryDate.getUTCMonth() + 1);
    const roll = keyedRandom01(
      this._seed,
      `weather:v${WEATHER_ALGORITHM_VERSION}:transition:${epochHour}`,
    );
    const kind = Weather._nextWeather(
      snapshot.kind,
      season,
      () => roll,
      boundaryDate.getUTCHours(),
      snapshot.runHours,
    );

    return {
      date: new Date(boundaryDate.getTime()),
      kind,
      runHours: kind === snapshot.kind ? snapshot.runHours + 1 : 0,
    };
  }

  _rememberCheckpoint(snapshot) {
    const date = snapshot.date;
    if (
      date.getUTCHours() !== 0 ||
      date.getUTCMinutes() !== 0 ||
      date.getUTCSeconds() !== 0 ||
      date.getUTCMilliseconds() !== 0
    ) {
      return;
    }
    this._checkpoints.set(date.getTime(), cloneSnapshot(snapshot));
  }

  _temperatureNoiseAtHour(hourIndex) {
    return (
      (keyedRandom01(this._temperatureSeed, `${hourIndex}:a`) +
        keyedRandom01(this._temperatureSeed, `${hourIndex}:b`) +
        keyedRandom01(this._temperatureSeed, `${hourIndex}:c`)) /
      3
    );
  }

  static _diurnalPhase(hour) {
    const h = ((Number(hour) % 24) + 24) % 24;
    if (h >= 4 && h <= 15) {
      // Warm from the 04:00 minimum to the 15:00 maximum over 11 hours.
      return -Math.cos((Math.PI * (h - 4)) / 11);
    }
    // Cool from 15:00 back to 04:00 over the remaining 13 hours.
    const elapsed = h > 15 ? h - 15 : h + 9;
    return Math.cos((Math.PI * elapsed) / 13);
  }

  static _seasonalTempBand(season) {
    switch (season) {
      case Season.WINTER:
        return [-2, 5];
      case Season.SPRING:
        return [8, 18];
      case Season.SUMMER:
        return [20, 30];
      case Season.AUTUMN:
        return [8, 16];
      default:
        return [10, 20];
    }
  }

  static _weatherAdjustment(kind) {
    switch (kind) {
      case WeatherType.SUNNY:
        return +0.5;
      case WeatherType.CLEAR:
        return 0;
      case WeatherType.CLOUDY:
        return -1;
      case WeatherType.WINDY:
        return -1.5;
      case WeatherType.RAIN:
        return -3;
      case WeatherType.STORM:
        return -4.5;
      case WeatherType.SNOW:
        return -6;
      default:
        return 0;
    }
  }

  // Markov transition with seasonal base, transition bias, diurnal tweak, and persistence
  static _nextWeather(current, season, rnd, hourOfDay = 12, runHours = 0) {
    // Base prevalence by season
    const base = {
      [Season.WINTER]: {
        [WeatherType.CLEAR]: 0.12,
        [WeatherType.SUNNY]: 0.06,
        [WeatherType.CLOUDY]: 0.32,
        [WeatherType.RAIN]: 0.08,
        [WeatherType.STORM]: 0.05,
        [WeatherType.WINDY]: 0.12,
        [WeatherType.SNOW]: 0.25,
      },
      [Season.SPRING]: {
        [WeatherType.CLEAR]: 0.18,
        [WeatherType.SUNNY]: 0.14,
        [WeatherType.CLOUDY]: 0.28,
        [WeatherType.RAIN]: 0.2,
        [WeatherType.STORM]: 0.05,
        [WeatherType.WINDY]: 0.09,
        [WeatherType.SNOW]: 0.06,
      },
      [Season.SUMMER]: {
        [WeatherType.CLEAR]: 0.18,
        [WeatherType.SUNNY]: 0.32,
        [WeatherType.CLOUDY]: 0.22,
        [WeatherType.RAIN]: 0.16,
        [WeatherType.STORM]: 0.07,
        [WeatherType.WINDY]: 0.05,
        [WeatherType.SNOW]: 0.0,
      },
      [Season.AUTUMN]: {
        [WeatherType.CLEAR]: 0.16,
        [WeatherType.SUNNY]: 0.1,
        [WeatherType.CLOUDY]: 0.34,
        [WeatherType.RAIN]: 0.22,
        [WeatherType.STORM]: 0.06,
        [WeatherType.WINDY]: 0.09,
        [WeatherType.SNOW]: 0.03,
      },
    }[season];

    // “from current → next” biases (no self-edges; persistence added below)
    const tx = {
      [WeatherType.CLEAR]: {
        [WeatherType.CLOUDY]: 0.35,
        [WeatherType.SUNNY]: 0.25,
        [WeatherType.WINDY]: 0.15,
        [WeatherType.RAIN]: 0.1,
        [WeatherType.STORM]: 0.03,
        [WeatherType.SNOW]: 0.0,
      },
      [WeatherType.SUNNY]: {
        [WeatherType.CLEAR]: 0.3,
        [WeatherType.CLOUDY]: 0.3,
        [WeatherType.RAIN]: 0.12,
        [WeatherType.WINDY]: 0.12,
        [WeatherType.STORM]: 0.04,
        [WeatherType.SNOW]: 0.0,
      },
      [WeatherType.CLOUDY]: {
        [WeatherType.RAIN]: 0.3,
        [WeatherType.CLEAR]: 0.22,
        [WeatherType.SUNNY]: 0.18,
        [WeatherType.WINDY]: 0.12,
        [WeatherType.STORM]: 0.06,
        [WeatherType.SNOW]: 0.02,
      },
      [WeatherType.RAIN]: {
        [WeatherType.SUNNY]: 0.28,
        [WeatherType.CLOUDY]: 0.28,
        [WeatherType.CLEAR]: 0.18,
        [WeatherType.STORM]: 0.1,
        [WeatherType.WINDY]: 0.08,
        [WeatherType.SNOW]: 0.0,
      },
      [WeatherType.STORM]: {
        [WeatherType.RAIN]: 0.45,
        [WeatherType.CLOUDY]: 0.25,
        [WeatherType.CLEAR]: 0.12,
        [WeatherType.WINDY]: 0.1,
        [WeatherType.SUNNY]: 0.06,
        [WeatherType.SNOW]: 0.02,
      },
      [WeatherType.WINDY]: {
        [WeatherType.CLEAR]: 0.28,
        [WeatherType.CLOUDY]: 0.28,
        [WeatherType.RAIN]: 0.18,
        [WeatherType.SUNNY]: 0.14,
        [WeatherType.STORM]: 0.08,
        [WeatherType.SNOW]: 0.04,
      },
      [WeatherType.SNOW]: {
        [WeatherType.CLOUDY]: 0.38,
        [WeatherType.CLEAR]: 0.22,
        [WeatherType.WINDY]: 0.14,
        [WeatherType.RAIN]: 0.06,
        [WeatherType.STORM]: 0.05,
        [WeatherType.SUNNY]: 0.05,
      },
    };

    const weights = { ...base };

    if (current && tx[current]) {
      const tableBlend = 0.1; // how much to favor transition table over season base
      for (const k of Object.keys(weights)) {
        const bias = tx[current][k] || 0;
        weights[k] = weights[k] * (1 - tableBlend) + bias * tableBlend;
      }
    }

    // Persistence/self-transition bias (season & state aware)
    if (current) {
      const perSeason = {
        [Season.WINTER]: {
          [WeatherType.CLEAR]: 0.3,
          [WeatherType.SUNNY]: 0.2,
          [WeatherType.CLOUDY]: 0.35,
          [WeatherType.RAIN]: 0.25,
          [WeatherType.STORM]: 0.18,
          [WeatherType.WINDY]: 0.3,
          [WeatherType.SNOW]: 0.45,
        },
        [Season.SPRING]: {
          [WeatherType.CLEAR]: 0.32,
          [WeatherType.SUNNY]: 0.3,
          [WeatherType.CLOUDY]: 0.34,
          [WeatherType.RAIN]: 0.28,
          [WeatherType.STORM]: 0.16,
          [WeatherType.WINDY]: 0.28,
          [WeatherType.SNOW]: 0.12,
        },
        [Season.SUMMER]: {
          [WeatherType.CLEAR]: 0.34,
          [WeatherType.SUNNY]: 0.4,
          [WeatherType.CLOUDY]: 0.3,
          [WeatherType.RAIN]: 0.24,
          [WeatherType.STORM]: 0.14,
          [WeatherType.WINDY]: 0.26,
          [WeatherType.SNOW]: 0.0,
        },
        [Season.AUTUMN]: {
          [WeatherType.CLEAR]: 0.3,
          [WeatherType.SUNNY]: 0.24,
          [WeatherType.CLOUDY]: 0.36,
          [WeatherType.RAIN]: 0.26,
          [WeatherType.STORM]: 0.16,
          [WeatherType.WINDY]: 0.28,
          [WeatherType.SNOW]: 0.08,
        },
      }[season];

      const persistence =
        (perSeason && perSeason[current]) != null ? perSeason[current] : 0.25;
      // Optional ramp: the longer it’s been the same, the stickier (max +30%)
      const ramp = 1 + Math.min(runHours || 0, 6) * 0.05;
      weights[current] = (weights[current] || 0) + persistence * ramp;
    }

    // Diurnal tweak: midday favors SUNNY/CLEAR; night dampens them
    if (hourOfDay >= 10 && hourOfDay <= 16) {
      weights[WeatherType.SUNNY] = (weights[WeatherType.SUNNY] || 0) * 1.25;
      weights[WeatherType.CLEAR] = (weights[WeatherType.CLEAR] || 0) * 1.1;
    } else if (hourOfDay >= 20 || hourOfDay < 6) {
      weights[WeatherType.SUNNY] = (weights[WeatherType.SUNNY] || 0) * 0.75;
      weights[WeatherType.CLEAR] = (weights[WeatherType.CLEAR] || 0) * 0.9;
    }

    // Normalize -> probs
    let total = 0;
    for (const v of Object.values(weights)) total += v;
    const probs = {};
    for (const [k, v] of Object.entries(weights)) probs[k] = v / (total || 1);

    // Guarantee at least s probability to stay in the current state.
    if (current) {
      const s = Weather._stickiness(current, season, runHours);
      for (const k of Object.keys(probs)) {
        if (k === current) probs[k] = probs[k] * (1 - s) + s;
        else probs[k] = probs[k] * (1 - s);
      }
    }

    // Roll on probs
    const roll = rnd();
    let acc = 0;
    for (const [k, p] of Object.entries(probs)) {
      acc += p;
      if (roll <= acc) return k;
    }
    return WeatherType.CLEAR;
  }

  static _stickiness(current, season, runHours = 0) {
    // Base stickiness per season/state (tune these to taste)
    const base = {
      [Season.WINTER]: {
        [WeatherType.CLEAR]: 0.3,
        [WeatherType.SUNNY]: 0.2,
        [WeatherType.CLOUDY]: 0.35,
        [WeatherType.RAIN]: 0.25,
        [WeatherType.STORM]: 0.1,
        [WeatherType.WINDY]: 0.28,
        [WeatherType.SNOW]: 0.55,
      },
      [Season.SPRING]: {
        [WeatherType.CLEAR]: 0.3,
        [WeatherType.SUNNY]: 0.3,
        [WeatherType.CLOUDY]: 0.32,
        [WeatherType.RAIN]: 0.26,
        [WeatherType.STORM]: 0.1,
        [WeatherType.WINDY]: 0.26,
        [WeatherType.SNOW]: 0.08,
      },
      [Season.SUMMER]: {
        [WeatherType.CLEAR]: 0.32,
        [WeatherType.SUNNY]: 0.42,
        [WeatherType.CLOUDY]: 0.28,
        [WeatherType.RAIN]: 0.2,
        [WeatherType.STORM]: 0.08,
        [WeatherType.WINDY]: 0.22,
        [WeatherType.SNOW]: 0.0,
      },
      [Season.AUTUMN]: {
        [WeatherType.CLEAR]: 0.28,
        [WeatherType.SUNNY]: 0.22,
        [WeatherType.CLOUDY]: 0.34,
        [WeatherType.RAIN]: 0.24,
        [WeatherType.STORM]: 0.1,
        [WeatherType.WINDY]: 0.26,
        [WeatherType.SNOW]: 0.06,
      },
    };

    const b = base[season]?.[current] ?? 0.25;
    // ramp: each consecutive hour in same weather adds +0.05, capped at +0.30
    const ramp = Math.min(runHours, 6) * 0.05;
    return clamp01(Math.min(b + ramp, 0.95));
  }
}
