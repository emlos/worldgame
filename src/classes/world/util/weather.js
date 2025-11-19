import { makeRNG, approxNormal01, clamp01 } from "../../../shared/modules.js";
import { WeatherType, Season } from "../../../data/data.js";

// weather.js
// Exports ONLY the Weather class (default). No other functions/constants live here.
// Notes:
// - This class refers to weather kinds by string keys: "clear", "sunny", "cloudy", "rain", "storm", "windy", "snow".
// - If you also have a global const Weather = { CLEAR: "clear", ... }, you can safely keep it elsewhere.
// - Season constants aren’t imported; month->season is handled internally via static method.

export class Weather {
  constructor({ startDate = new Date(), initial = null, rnd } = {}) {
    // Use a provided RNG, or make our own LCG
    this._rnd = rnd;
    this._date = new Date(startDate);
    // Current weather state (string). If not given, pick seasonally at start time.
    const season = Weather.monthToSeason(this._date.getMonth() + 1);
    const hour = this._date.getHours();
    this._state = initial ?? Weather._nextWeather(null, season, this._rnd, hour, 0);
    this._runHours = 0; // how many consecutive hours we’ve stayed in the same state
  }

  // --- Public API ------------------------------------------------------------

  /** Returns the current weather kind (string) */
  get kind() {
    return this._state;
  }

  /** Advance weather over an arbitrary number of minutes, simulating transitions at every hour boundary crossed. */
  step(minutes, startDate = this._date) {
    if (minutes <= 0) return;
    const startMs = new Date(startDate).getTime();
    const endMs = startMs + minutes * 60 * 1000;

    // First hour boundary AFTER start
    let cursor = Math.ceil(startMs / 3600000) * 3600000;

    while (cursor <= endMs - 1) {
      const d = new Date(cursor);
      const season = Weather.monthToSeason(d.getMonth() + 1);
      const next = Weather._nextWeather(this._state, season, this._rnd, d.getHours(), this._runHours);
      if (next === this._state) this._runHours++;
      else {
        this._state = next;
        this._runHours = 0;
      }
      cursor += 3600000;
    }
    this._date = new Date(endMs);
  }

  /** Compute ambient temperature (°C) for a given date and the current weather kind. */
  computeTemperature(date = this._date) {
    const season = Weather.monthToSeason(date.getMonth() + 1);
    const [tMin, tMax] = Weather._seasonalTempBand(season);

    // Diurnal cycle: min ~4:00, max ~15:00
    const h = date.getHours() + date.getMinutes() / 60;
    const phase = Math.sin(((h - 4) / 24) * Math.PI * 2); // -1..1
    const mean = tMin + (tMax - tMin) * 0.6;
    const swing = (tMax - tMin) * 0.5;

    const base = mean + swing * phase + Weather._weatherAdjustment(this._state);
    const noise = (approxNormal01(this._rnd) - 0.5) * 2; // -1..1
    return Math.round((base + noise) * 10) / 10;
  }

  /** Expose a static helper so World can compute season without duplicating logic. */
  static monthToSeason(month) {
    if (month === 12 || month <= 2) return Season.WINTER;
    if (month <= 5) return Season.SPRING;
    if (month <= 8) return Season.SUMMER;
    return Season.AUTUMN;
  }

  // --- Internals -------------------------------------------------------------

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
      [Season.WINTER]: { [WeatherType.CLEAR]: 0.12, [WeatherType.SUNNY]: 0.06, [WeatherType.CLOUDY]: 0.32, [WeatherType.RAIN]: 0.08, [WeatherType.STORM]: 0.05, [WeatherType.WINDY]: 0.12, [WeatherType.SNOW]: 0.25 },
      [Season.SPRING]: { [WeatherType.CLEAR]: 0.18, [WeatherType.SUNNY]: 0.14, [WeatherType.CLOUDY]: 0.28, [WeatherType.RAIN]: 0.2, [WeatherType.STORM]: 0.05, [WeatherType.WINDY]: 0.09, [WeatherType.SNOW]: 0.06 },
      [Season.SUMMER]: { [WeatherType.CLEAR]: 0.18, [WeatherType.SUNNY]: 0.32, [WeatherType.CLOUDY]: 0.22, [WeatherType.RAIN]: 0.16, [WeatherType.STORM]: 0.07, [WeatherType.WINDY]: 0.05, [WeatherType.SNOW]: 0.0 },
      [Season.AUTUMN]: { [WeatherType.CLEAR]: 0.16, [WeatherType.SUNNY]: 0.1, [WeatherType.CLOUDY]: 0.34, [WeatherType.RAIN]: 0.22, [WeatherType.STORM]: 0.06, [WeatherType.WINDY]: 0.09, [WeatherType.SNOW]: 0.03 },
    }[season];

    // “from current → next” biases (no self-edges; persistence added below)
    const tx = {
      [WeatherType.CLEAR]: { [WeatherType.CLOUDY]: 0.35, [WeatherType.SUNNY]: 0.25, [WeatherType.WINDY]: 0.15, [WeatherType.RAIN]: 0.1, [WeatherType.STORM]: 0.03, [WeatherType.SNOW]: 0.0 },
      [WeatherType.SUNNY]: { [WeatherType.CLEAR]: 0.3, [WeatherType.CLOUDY]: 0.3, [WeatherType.RAIN]: 0.12, [WeatherType.WINDY]: 0.12, [WeatherType.STORM]: 0.04, [WeatherType.SNOW]: 0.0 },
      [WeatherType.CLOUDY]: { [WeatherType.RAIN]: 0.3, [WeatherType.CLEAR]: 0.22, [WeatherType.SUNNY]: 0.18, [WeatherType.WINDY]: 0.12, [WeatherType.STORM]: 0.06, [WeatherType.SNOW]: 0.02 },
      [WeatherType.RAIN]: { [WeatherType.SUNNY]: 0.28, [WeatherType.CLOUDY]: 0.28, [WeatherType.CLEAR]: 0.18, [WeatherType.STORM]: 0.1, [WeatherType.WINDY]: 0.08, [WeatherType.SNOW]: 0.0 },
      [WeatherType.STORM]: { [WeatherType.RAIN]: 0.45, [WeatherType.CLOUDY]: 0.25, [WeatherType.CLEAR]: 0.12, [WeatherType.WINDY]: 0.1, [WeatherType.SUNNY]: 0.06, [WeatherType.SNOW]: 0.02 },
      [WeatherType.WINDY]: { [WeatherType.CLEAR]: 0.28, [WeatherType.CLOUDY]: 0.28, [WeatherType.RAIN]: 0.18, [WeatherType.SUNNY]: 0.14, [WeatherType.STORM]: 0.08, [WeatherType.SNOW]: 0.04 },
      [WeatherType.SNOW]: { [WeatherType.CLOUDY]: 0.38, [WeatherType.CLEAR]: 0.22, [WeatherType.WINDY]: 0.14, [WeatherType.RAIN]: 0.06, [WeatherType.STORM]: 0.05, [WeatherType.SUNNY]: 0.05 },
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
        [Season.WINTER]: { [WeatherType.CLEAR]: 0.3, [WeatherType.SUNNY]: 0.2, [WeatherType.CLOUDY]: 0.35, [WeatherType.RAIN]: 0.25, [WeatherType.STORM]: 0.18, [WeatherType.WINDY]: 0.3, [WeatherType.SNOW]: 0.45 },
        [Season.SPRING]: { [WeatherType.CLEAR]: 0.32, [WeatherType.SUNNY]: 0.3, [WeatherType.CLOUDY]: 0.34, [WeatherType.RAIN]: 0.28, [WeatherType.STORM]: 0.16, [WeatherType.WINDY]: 0.28, [WeatherType.SNOW]: 0.12 },
        [Season.SUMMER]: { [WeatherType.CLEAR]: 0.34, [WeatherType.SUNNY]: 0.4, [WeatherType.CLOUDY]: 0.3, [WeatherType.RAIN]: 0.24, [WeatherType.STORM]: 0.14, [WeatherType.WINDY]: 0.26, [WeatherType.SNOW]: 0.0 },
        [Season.AUTUMN]: { [WeatherType.CLEAR]: 0.3, [WeatherType.SUNNY]: 0.24, [WeatherType.CLOUDY]: 0.36, [WeatherType.RAIN]: 0.26, [WeatherType.STORM]: 0.16, [WeatherType.WINDY]: 0.28, [WeatherType.SNOW]: 0.08 },
      }[season];

      const persistence = (perSeason && perSeason[current]) != null ? perSeason[current] : 0.25;
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
      [Season.WINTER]: { [WeatherType.CLEAR]: 0.3, [WeatherType.SUNNY]: 0.2, [WeatherType.CLOUDY]: 0.35, [WeatherType.RAIN]: 0.25, [WeatherType.STORM]: 0.1, [WeatherType.WINDY]: 0.28, [WeatherType.SNOW]: 0.55 },
      [Season.SPRING]: { [WeatherType.CLEAR]: 0.3, [WeatherType.SUNNY]: 0.3, [WeatherType.CLOUDY]: 0.32, [WeatherType.RAIN]: 0.26, [WeatherType.STORM]: 0.1, [WeatherType.WINDY]: 0.26, [WeatherType.SNOW]: 0.08 },
      [Season.SUMMER]: { [WeatherType.CLEAR]: 0.32, [WeatherType.SUNNY]: 0.42, [WeatherType.CLOUDY]: 0.28, [WeatherType.RAIN]: 0.2, [WeatherType.STORM]: 0.08, [WeatherType.WINDY]: 0.22, [WeatherType.SNOW]: 0.0 },
      [Season.AUTUMN]: { [WeatherType.CLEAR]: 0.28, [WeatherType.SUNNY]: 0.22, [WeatherType.CLOUDY]: 0.34, [WeatherType.RAIN]: 0.24, [WeatherType.STORM]: 0.1, [WeatherType.WINDY]: 0.26, [WeatherType.SNOW]: 0.06 },
    };

    const b = base[season]?.[current] ?? 0.25;
    // ramp: each consecutive hour in same weather adds +0.05, capped at +0.30
    const ramp = Math.min(runHours, 6) * 0.05;
    return clamp01(Math.min(b + ramp, 0.95));
  }
}

