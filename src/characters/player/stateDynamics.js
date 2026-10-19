import { clamp } from "../../shared/util/util.js";
import {
  PLAYER_ENERGY_DRAIN_PER_MINUTE,
  PLAYER_ENERGY_RECOVERY_PER_MINUTE,
} from "./stats.js";
import { PlaceShelter, getPlaceShelter } from "../../world/data/shelter.js";
import { WeatherType } from "../../world/data/weather.js";

const round = (value) => Math.round(value * 1_000_000) / 1_000_000;
const ELAPSED_INTEGRAL_TOLERANCES = [0.00001, 0.00001, 0.001, 0.01, 0.1];
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const OUTDOOR_WEATHER_PENALTY = Object.freeze({
  [WeatherType.RAIN]: 12,
  [WeatherType.STORM]: 18,
  [WeatherType.SNOW]: 14,
  [WeatherType.WINDY]: 5,
});
const COVERED_WEATHER_PENALTY = Object.freeze({
  [WeatherType.STORM]: 6,
  [WeatherType.WINDY]: 4,
});

export function playerStressBand(value) {
  if (value >= 100) return "breaking";
  if (value >= 80) return "near_breaking";
  if (value >= 60) return "overwhelmed";
  if (value >= 30) return "strained";
  return "settled";
}

export function playerHygieneBand(value) {
  if (value >= 70) return "clean";
  if (value >= 40) return "presentable";
  if (value >= 15) return "dirty";
  return "filthy";
}

// Comfort is a reading of the present situation, never a second saved meter.
export function playerComfort(game, { pain = game.player.getBodyPain(), environment = null } = {}) {
  const player = game.player;
  const temperaturePenalty = {
    comfortable: 0, warm: 4, cool: 6, hot: 14, cold: 18,
    overheating: 30, freezing: 35,
  }[player.temperature] ?? 0;
  const clothes = [...player.clothing.values()];
  const wetness = clothes.length
    ? clothes.reduce((total, item) => total + item.wetness, 0) / clothes.length
    : 0;
  const shelter = getPlaceShelter(game.currentPlace);
  const weather = environment?.weather ?? game.world?.weather?.kind;
  const weatherPenalty = shelter === PlaceShelter.OUTDOOR
    ? OUTDOOR_WEATHER_PENALTY[weather] ?? 0
    : shelter === PlaceShelter.COVERED
      ? COVERED_WEATHER_PENALTY[weather] ?? 0
      : 0;
  const ambient = Number(environment?.temperature ?? game.world?.temperatureC);
  // A roof stops precipitation, but open-sided places still follow outdoor air.
  const ambientPenalty = shelter !== PlaceShelter.INDOOR && Number.isFinite(ambient)
    ? Math.max(0, 12 - ambient) * 1.2 + Math.max(0, ambient - 30) * 1.2
    : 0;
  const hygienePenalty = Math.max(0, 45 - player.getStatValue("hygiene")) * 0.2;
  const painPenalty = pain * 0.22;
  const homeBonus = game.currentPlaceId != null &&
    String(game.currentPlaceId) === String(game.homePlaceId) ? 10 : 0;
  return round(clamp(
    85 + homeBonus - temperaturePenalty - wetness * 22 - weatherPenalty - ambientPenalty -
      hygienePenalty - painPenalty,
    0, 100,
  ));
}

// Fixed at the start of a rest action so timer/chat boundaries cannot change
// the outcome of one sleep period merely by splitting elapsed time.
export function playerRestQuality(game) {
  const stress = game.player.getStatValue("stress");
  const pain = game.player.getBodyPain();
  const comfort = playerComfort(game);
  return clamp(
    (1 - stress * 0.002 - Math.max(0, stress - 50) * 0.002) *
      (1 - pain * 0.002) *
      (0.7 + comfort * 0.003),
    0.35, 1,
  );
}

// Pain changes during a time advance. Integrating its two effects means a
// timer/chat deadline does not reprice the remainder of an action at a new
// pain reading. Sample the same body recovery used by the time-change handler.
function createPainIntegrator(painAtMinute, comfortAtMinute = null) {
  const samples = new Map();
  const sample = (minute) => {
    if (!samples.has(minute)) {
      const pain = painAtMinute(minute);
      // Total pain, pain above the stress threshold, comfort, and the
      // time-weighted readings needed for average stress over the interval.
      const elevatedPain = Math.max(0, pain - 20);
      const comfort = comfortAtMinute?.(minute, pain) ?? 0;
      samples.set(minute, [
        pain,
        elevatedPain,
        comfort,
        minute * elevatedPain,
        minute * comfort,
      ]);
    }
    return samples.get(minute);
  };
  const simpson = (left, right, start, middle, end) => start.map((value, index) =>
    (right - left) * (value + 4 * middle[index] + end[index]) / 6,
  );
  const refine = (left, right, start, middle, end, whole, tolerance, depth) => {
    const center = left + (right - left) / 2;
    const leftMiddle = sample(left + (center - left) / 2);
    const rightMiddle = sample(center + (right - center) / 2);
    const leftArea = simpson(left, center, start, leftMiddle, middle);
    const rightArea = simpson(center, right, middle, rightMiddle, end);
    const area = leftArea.map((value, index) => value + rightArea[index]);
    if (depth === 0 || area.every((value, index) =>
      Math.abs(value - whole[index]) <= 15 * tolerance[index]
    )) {
      return area.map((value, index) => value + (value - whole[index]) / 15);
    }
    const first = refine(
      left, center, start, leftMiddle, middle, leftArea,
      tolerance.map((value) => value / 2), depth - 1,
    );
    const second = refine(
      center, right, middle, rightMiddle, end, rightArea,
      tolerance.map((value) => value / 2), depth - 1,
    );
    return first.map((value, index) => value + second[index]);
  };
  return (minutes, fromMinute = 0) => {
    if (minutes <= 0) return [0, 0, 0, 0, 0];
    const endMinute = fromMinute + minutes;
    const start = sample(fromMinute);
    const middle = sample(fromMinute + minutes / 2);
    const end = sample(endMinute);
    return refine(
      fromMinute, endMinute, start, middle, end,
      simpson(fromMinute, endMinute, start, middle, end),
      ELAPSED_INTEGRAL_TOLERANCES, 24,
    );
  };
}

function crossingMinute(before, after, hasCrossed) {
  while (after - before > 0.0000001) {
    const middle = before + (after - before) / 2;
    if (hasCrossed(middle)) after = middle;
    else before = middle;
  }
  return (before + after) / 2;
}

export function applyElapsedPlayerState(game, minutes, {
  activity = "ordinary",
  drainEnergy = true,
  restQuality = null,
  painAtMinute = null,
} = {}) {
  const player = game.player;
  player.syncAgeAt(game.now);
  if (minutes <= 0) return;

  const startingEnergy = player.getStatValue("energy");
  const startingStress = player.getStatValue("stress");
  let stressMinutes;
  if (activity === "rest") {
    const quality = restQuality ?? playerRestQuality(game);
    const stressRecoveryRate = 0.035 * quality;
    const stressedMinutes = Math.min(minutes, startingStress / stressRecoveryRate);
    stressMinutes = startingStress * stressedMinutes -
      stressRecoveryRate * stressedMinutes * stressedMinutes / 2;
    player.setStatValue("energy", round(
      startingEnergy + minutes * PLAYER_ENERGY_RECOVERY_PER_MINUTE * quality,
    ));
    player.setStatValue("stress", round(
      startingStress - minutes * stressRecoveryRate,
    ));
  } else {
    const painAt = painAtMinute ?? (() => player.getBodyPain());
    const startedAtMs = game.now.getTime() - minutes * MS_PER_MINUTE;
    const comfortAt = activity === "quiet"
      ? (minute, pain) => playerComfort(game, {
        pain,
        environment: game.world.getEnvironmentAt(
          new Date(startedAtMs + minute * MS_PER_MINUTE),
        ),
      })
      : null;
    const integratePain = createPainIntegrator(painAt, comfortAt);
    const readings = activity === "quiet" ? null : integratePain(minutes);
    const painMinutes = readings?.[0] ?? 0;
    const elevatedPainMinutes = readings?.[1] ?? 0;
    const drain = drainEnergy
      ? PLAYER_ENERGY_DRAIN_PER_MINUTE *
        (activity === "exert" ? 1.5 * minutes + painMinutes / 200 : minutes)
      : 0;
    if (drain) {
      player.setStatValue("energy", round(startingEnergy - drain));
    }
    let depletionMinute = minutes;
    if (activity === "exert") {
      if (startingEnergy <= 20 && drainEnergy) {
        depletionMinute = 0;
      } else if (!drainEnergy) {
        if (startingEnergy < 20) depletionMinute = 0;
      } else if (startingEnergy - drain < 20) {
        // Find when the integrated drain crosses 20 energy. Pain can fall
        // during the action, so a single average drain rate is insufficient.
        depletionMinute = crossingMinute(0, minutes, (middle) => {
          const used = PLAYER_ENERGY_DRAIN_PER_MINUTE *
            (1.5 * middle + integratePain(middle)[0] / 200);
          return startingEnergy - used < 20;
        });
      }
    }
    if (activity === "quiet") {
      // Weather can change on the hour. Integrate each hour separately so a
      // scheduled deadline never changes which weather the quiet time used.
      let comfortMinutes = 0;
      let comfortMoment = 0;
      let elapsed = 0;
      let cutoff = minutes;
      while (elapsed < minutes && startingStress > 0) {
        const timeMs = startedAtMs + elapsed * MS_PER_MINUTE;
        const nextHourMs = (Math.floor(timeMs / MS_PER_HOUR) + 1) * MS_PER_HOUR;
        const duration = Math.min(minutes - elapsed, (nextHourMs - timeMs) / MS_PER_MINUTE);
        const before = elapsed;
        const comfortBefore = comfortMinutes;
        const momentBefore = comfortMoment;
        const interval = integratePain(duration, elapsed);
        comfortMinutes += interval[2];
        comfortMoment += interval[4];
        elapsed += duration;
        if (0.025 * (0.5 * elapsed + comfortMinutes / 200) >= startingStress) {
          cutoff = crossingMinute(before, elapsed, (middle) => {
            const comfortThroughMiddle = comfortBefore +
              integratePain(middle - before, before)[2];
            return 0.025 * (0.5 * middle + comfortThroughMiddle / 200) >= startingStress;
          });
          const partial = integratePain(cutoff - before, before);
          comfortMinutes = comfortBefore + partial[2];
          comfortMoment = momentBefore + partial[4];
          break;
        }
      }
      stressMinutes = startingStress * cutoff - 0.025 * (
        0.25 * cutoff * cutoff +
        (cutoff * comfortMinutes - comfortMoment) / 200
      );
      player.setStatValue("stress", round(
        startingStress - 0.025 * (0.5 * minutes + comfortMinutes / 200),
      ));
    } else {
      const painStressPerMinute = 0.01 / 80;
      const rawStressAt = (minute, values) => startingStress +
        (activity === "exert" ? Math.max(0, minute - depletionMinute) * 0.04 : 0) +
        values[1] * painStressPerMinute;
      const rawStressMinutes = (minute, values) =>
        startingStress * minute +
        (activity === "exert"
          ? Math.max(0, minute - depletionMinute) ** 2 * 0.02
          : 0) +
        (minute * values[1] - values[3]) * painStressPerMinute;
      const rawFinalStress = rawStressAt(minutes, readings);
      if (rawFinalStress > 100 && startingStress < 100) {
        const cutoff = crossingMinute(0, minutes, (middle) =>
          rawStressAt(middle, integratePain(middle)) >= 100,
        );
        stressMinutes = rawStressMinutes(cutoff, integratePain(cutoff)) +
          100 * (minutes - cutoff);
      } else {
        stressMinutes = startingStress >= 100
          ? 100 * minutes
          : rawStressMinutes(minutes, readings);
      }
      player.setStatValue("stress", round(
        startingStress +
          (activity === "exert" ? Math.max(0, minutes - depletionMinute) * 0.04 : 0) +
          elevatedPainMinutes * painStressPerMinute,
      ));
    }
  }

  const recoveryFactor = 1 - clamp(stressMinutes / minutes, 0, 100) / 200;
  for (const [name, rate] of [["fear", 0.35], ["anger", 0.18]]) {
    player.setStatValue(name, round(
      player.getStatValue(name) - minutes * rate * recoveryFactor,
    ));
  }
  player.setStatValue("arousal", round(
    player.getStatValue("arousal") - minutes * 0.18,
  ));
}
