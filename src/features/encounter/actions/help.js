import { WeatherType } from "../../../world/data/weather.js";
import { controlledParticipantId } from "../roles.js";
import { requireEncounterObjective } from "../objectives/index.js";
import {
  actionInstance,
  chanceRoll,
  failAction,
  proposeOutcome,
} from "./helpers.js";

const WEATHER_MULTIPLIER = Object.freeze({
  [WeatherType.RAIN]: 0.625,
  [WeatherType.SNOW]: 0.625,
  [WeatherType.STORM]: 0.375,
});

/**
 * A fair daytime call has the requested 40% chance. Darkness halves it;
 * precipitation makes voices harder to notice, with storms applying the
 * largest penalty. Night and weather penalties compound.
 */
export function calculateScreamForHelpChance({ daylightPeriod, weather }) {
  const daylightMultiplier = daylightPeriod === "day" ? 1 : 0.5;
  const weatherMultiplier = WEATHER_MULTIPLIER[weather] ?? 1;
  return Math.round(0.4 * daylightMultiplier * weatherMultiplier * 10000) / 10000;
}

export function screamForHelpEnvironment(context) {
  const daylightPeriod = context.game.world.getDaylightAt(context.game.now).period;
  const weather = context.game.world.currentWeather;
  return {
    daylightPeriod,
    weather,
    chance: calculateScreamForHelpChance({ daylightPeriod, weather }),
  };
}

export const SCREAM_FOR_HELP = Object.freeze({
  id: "scream-for-help",
  tags: Object.freeze(["escape", "support"]),
  durationSeconds: 2,
  usableBy: "controlled",
  playerOrder: 1,
  availabilityHint: "Only the player can call for outside help.",

  enumerateTargets(_context, actorId) {
    return [actionInstance(this.id, actorId, actorId)];
  },

  isAvailable(context, instance) {
    return instance.actorId === controlledParticipantId(context.state);
  },

  label() {
    return "Scream for help";
  },

  intentLabel() {
    return "screams for help";
  },

  resolve(context, instance, runtime) {
    const environment = screamForHelpEnvironment(context);
    if (!chanceRoll(
      context,
      instance,
      runtime,
      "heard-by-bystander",
      environment.chance,
      {
        daylightPeriod: environment.daylightPeriod,
        weather: environment.weather,
      },
    )) {
      failAction(runtime, instance, "help-not-heard");
      return;
    }

    runtime.events.push({
      type: "help.heard",
      actorId: instance.actorId,
      daylightPeriod: environment.daylightPeriod,
      weather: environment.weather,
    });
    const outcome = requireEncounterObjective(context.state)
      .outcomeForTargetRescue(context, runtime.events);
    proposeOutcome(runtime, outcome);
  },
});
