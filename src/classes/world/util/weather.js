import { Season, WeatherType } from "../module.js";
import { makeRNG, approxNormal01 } from "../../../shared/modules.js";

// weather.js
// Exports ONLY the Weather class (default). No other functions/constants live here.
// Notes:
// - This class refers to weather kinds by string keys: "clear", "sunny", "cloudy", "rain", "storm", "windy", "snow".
// - If you also have a global const Weather = { CLEAR: "clear", ... }, you can safely keep it elsewhere.
// - Season constants aren’t imported; month->season is handled internally via static method.

export class Weather {
  constructor({ seed = Date.now(), startDate = new Date(), initial = null, rnd = null } = {}) {
    // Use a provided RNG, or make our own LCG
    this._rnd = typeof rnd === "function" ? rnd : makeRNG(seed);
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
      winter: { clear: 0.12, sunny: 0.06, cloudy: 0.32, rain: 0.08, storm: 0.05, windy: 0.12, snow: 0.25 },
      spring: { clear: 0.18, sunny: 0.14, cloudy: 0.28, rain: 0.2, storm: 0.05, windy: 0.09, snow: 0.06 },
      summer: { clear: 0.18, sunny: 0.32, cloudy: 0.22, rain: 0.16, storm: 0.07, windy: 0.05, snow: 0.0 },
      autumn: { clear: 0.16, sunny: 0.1, cloudy: 0.34, rain: 0.22, storm: 0.06, windy: 0.09, snow: 0.03 },
    }[season];

    // “from current → next” biases (no self-edges; persistence added below)
    const tx = {
      clear: { cloudy: 0.35, sunny: 0.25, windy: 0.15, rain: 0.1, storm: 0.03, snow: 0.0 },
      sunny: { clear: 0.3, cloudy: 0.3, rain: 0.12, windy: 0.12, storm: 0.04, snow: 0.0 },
      cloudy: { rain: 0.3, clear: 0.22, sunny: 0.18, windy: 0.12, storm: 0.06, snow: 0.02 },
      rain: { sunny: 0.28, cloudy: 0.28, clear: 0.18, storm: 0.1, windy: 0.08, snow: 0.0 },
      storm: { rain: 0.45, cloudy: 0.25, clear: 0.12, windy: 0.1, sunny: 0.06, snow: 0.02 },
      windy: { clear: 0.28, cloudy: 0.28, rain: 0.18, sunny: 0.14, storm: 0.08, snow: 0.04 },
      snow: { cloudy: 0.38, clear: 0.22, windy: 0.14, rain: 0.06, storm: 0.05, sunny: 0.05 },
    };

    const weights = { ...base };

    if (current && tx[current]) {
      const blend = 1; // higher -> more “use the transition table” vs. season base
      for (const k of Object.keys(weights)) {
        const bias = tx[current][k] || 0;
        weights[k] = weights[k] * (1 - blend) + bias * blend;
      }
    }

    // Persistence/self-transition bias (season & state aware)
    if (current) {
      const perSeason = {
        winter: { clear: 0.3, sunny: 0.2, cloudy: 0.35, rain: 0.25, storm: 0.18, windy: 0.3, snow: 0.45 },
        spring: { clear: 0.32, sunny: 0.3, cloudy: 0.34, rain: 0.28, storm: 0.16, windy: 0.28, snow: 0.12 },
        summer: { clear: 0.34, sunny: 0.4, cloudy: 0.3, rain: 0.24, storm: 0.14, windy: 0.26, snow: 0.0 },
        autumn: { clear: 0.3, sunny: 0.24, cloudy: 0.36, rain: 0.26, storm: 0.16, windy: 0.28, snow: 0.08 },
      }[season];

      const persistence = (perSeason && perSeason[current]) != null ? perSeason[current] : 0.25;
      // Optional ramp: the longer it’s been the same, the stickier (max +30%)
      const ramp = 1 + Math.min(runHours || 0, 6) * 0.05;
      weights[current] = (weights[current] || 0) + persistence * ramp;
    }

    // Diurnal tweak: midday favors SUNNY/CLEAR; night dampens them
    if (hourOfDay >= 10 && hourOfDay <= 16) {
      weights.sunny = (weights.sunny || 0) * 1.25;
      weights.clear = (weights.clear || 0) * 1.1;
    } else if (hourOfDay >= 20 || hourOfDay < 6) {
      weights.sunny = (weights.sunny || 0) * 0.75;
      weights.clear = (weights.clear || 0) * 0.9;
    }

    // Normalize & roll
    let total = 0;
    for (const v of Object.values(weights)) total += v;
    const roll = rnd();
    let acc = 0;
    for (const [k, v] of Object.entries(weights)) {
      acc += v / (total || 1);
      if (roll <= acc) return k;
    }
    return WeatherType.CLEAR;
  }
}
