
import { Season } from "./enums.js";
// --------------------------
// 
// Weather, Temperature
// --------------------------

export function monthToSeason(month) {
  // 1..12
  if (month === 12 || month <= 2) return Season.WINTER;
  if (month <= 5) return Season.SPRING;
  if (month <= 8) return Season.SUMMER;
  return Season.AUTUMN;
}

export function seasonalTempBand(season) {
  // [min,max] daily mean anchor
  switch (season) {
    case Season.WINTER:
      return [-2, 5];
    case Season.SPRING:
      return [8, 18];
    case Season.SUMMER:
      return [20, 30];
    case Season.AUTUMN:
      return [8, 16];
  }
}

export function weatherAdjustment(weather) {
  // degrees C delta
  switch (weather) {
    case Weather.CLEAR:
      return 0;
    case Weather.CLOUDY:
      return -1;
    case Weather.WINDY:
      return -1.5;
    case Weather.RAIN:
      return -3;
    case Weather.STORM:
      return -4.5;
    case Weather.SNOW:
      return -6;
  }
}

export function nextWeather(current, season, rnd) {
  // Simple season‑aware transition with inertia
  const roll = rnd();
  const weights = {
    [Season.WINTER]: {
      clear: 0.15,
      cloudy: 0.25,
      snow: 0.35,
      windy: 0.1,
      rain: 0.1,
      storm: 0.05,
    },
    [Season.SPRING]: {
      clear: 0.25,
      cloudy: 0.3,
      rain: 0.25,
      windy: 0.1,
      storm: 0.07,
      snow: 0.03,
    },
    [Season.SUMMER]: {
      clear: 0.4,
      cloudy: 0.25,
      rain: 0.18,
      storm: 0.07,
      windy: 0.08,
      snow: 0.02,
    },
    [Season.AUTUMN]: {
      clear: 0.22,
      cloudy: 0.33,
      rain: 0.26,
      windy: 0.1,
      storm: 0.07,
      snow: 0.02,
    },
  }[season];

  // Slight persistence of current weather
  const bias = 0.15;
  if (current) weights[current] = clamp((weights[current] || 0) + bias, 0, 1);
  const entries = Object.entries(weights);
  let acc = 0;
  for (const [k, w] of entries) {
    acc += w;
    if (roll <= acc) return k;
  }
  return "clear";
}
