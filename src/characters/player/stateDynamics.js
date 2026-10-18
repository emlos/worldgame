import { clamp } from "../../shared/util/util.js";
import {
  PLAYER_ENERGY_DRAIN_PER_MINUTE,
  PLAYER_ENERGY_RECOVERY_PER_MINUTE,
} from "./stats.js";

const round = (value) => Math.round(value * 1_000_000) / 1_000_000;

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
export function playerComfort(game) {
  const player = game.player;
  const temperaturePenalty = {
    comfortable: 0, warm: 4, cool: 6, hot: 14, cold: 18,
    overheating: 30, freezing: 35,
  }[player.temperature] ?? 0;
  const clothes = [...player.clothing.values()];
  const wetness = clothes.length
    ? clothes.reduce((total, item) => total + item.wetness, 0) / clothes.length
    : 0;
  const outdoors = !game.currentPlace;
  const weather = String(game.world?.weather?.kind ?? "").toLowerCase();
  const weatherPenalty = outdoors && /rain|snow|storm/.test(weather) ? 12 : 0;
  const ambient = Number(game.world?.temperatureC);
  const ambientPenalty = outdoors && Number.isFinite(ambient)
    ? Math.max(0, 8 - ambient) * 0.8 + Math.max(0, ambient - 30) * 0.7
    : 0;
  const hygienePenalty = Math.max(0, 45 - player.getStatValue("hygiene")) * 0.2;
  const painPenalty = player.getBodyPain() * 0.22;
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

export function applyElapsedPlayerState(game, minutes, {
  activity = "ordinary",
  drainEnergy = true,
  restQuality = null,
} = {}) {
  const player = game.player;
  player.syncAgeAt(game.now);
  if (minutes <= 0) return;

  const startingEnergy = player.getStatValue("energy");
  if (activity === "rest") {
    const quality = restQuality ?? playerRestQuality(game);
    player.setStatValue("energy", round(
      startingEnergy + minutes * PLAYER_ENERGY_RECOVERY_PER_MINUTE * quality,
    ));
    player.setStatValue("stress", round(
      player.getStatValue("stress") - minutes * 0.035 * quality,
    ));
  } else {
    const pain = player.getBodyPain();
    const drainRate = drainEnergy
      ? PLAYER_ENERGY_DRAIN_PER_MINUTE *
        (activity === "exert" ? 1.5 + pain / 200 : 1)
      : 0;
    if (drainRate) {
      player.setStatValue("energy", round(startingEnergy - minutes * drainRate));
    }
    if (activity === "exert") {
      const minutesBeforeDepletion = drainRate > 0
        ? Math.max(0, (startingEnergy - 20) / drainRate)
        : (startingEnergy < 20 ? 0 : Infinity);
      const depletedMinutes = Math.max(0, minutes - minutesBeforeDepletion);
      player.setStatValue("stress", round(
        player.getStatValue("stress") + depletedMinutes * 0.04,
      ));
    }
    if (activity === "quiet") {
      player.setStatValue("stress", round(
        player.getStatValue("stress") - minutes * 0.025 *
          (0.5 + playerComfort(game) / 200),
      ));
    } else if (pain > 20) {
      player.setStatValue("stress", round(
        player.getStatValue("stress") + minutes * 0.01 * (pain - 20) / 80,
      ));
    }
  }

  const stress = player.getStatValue("stress");
  const recoveryFactor = 1 - stress / 200;
  for (const [name, rate] of [["fear", 0.35], ["anger", 0.18]]) {
    player.setStatValue(name, round(
      player.getStatValue(name) - minutes * rate * recoveryFactor,
    ));
  }
  player.setStatValue("arousal", round(
    player.getStatValue("arousal") - minutes * 0.18,
  ));
}
