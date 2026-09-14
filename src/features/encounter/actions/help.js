import { WeatherType } from "../../../world/data/weather.js";
import { controlledParticipantId } from "../roles.js";
import { requireEncounterObjective } from "../objectives/index.js";
import {
  actionInstance,
  failAction,
  proposeOutcome,
  roll,
} from "./helpers.js";

export const SCREAM_FOR_HELP_REROLL_SECONDS = 45;

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

function screamForHelpRoll(context, instance) {
  const previous = context.state.screamForHelpRoll;
  if (
    previous
    && context.state.elapsedSeconds - previous.rolledAtSecond < SCREAM_FOR_HELP_REROLL_SECONDS
  ) {
    return { ...previous, reused: true };
  }

  const next = {
    value: roll(context, instance, "heard-by-bystander"),
    rolledAtSecond: context.state.elapsedSeconds,
  };
  context.state.screamForHelpRoll = next;
  return { ...next, reused: false };
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
    const helpRoll = screamForHelpRoll(context, instance);
    const success = helpRoll.value < environment.chance;
    runtime.events.push({
      type: "chance.rolled",
      actorId: instance.actorId,
      actionId: instance.actionId,
      purpose: "heard-by-bystander",
      chance: Math.round(environment.chance * 10000) / 10000,
      roll: Math.round(helpRoll.value * 10000) / 10000,
      success,
      reused: helpRoll.reused,
      rolledAtSecond: helpRoll.rolledAtSecond,
      rerollAtSecond: helpRoll.rolledAtSecond + SCREAM_FOR_HELP_REROLL_SECONDS,
      daylightPeriod: environment.daylightPeriod,
      weather: environment.weather,
    });

    if (!success) {
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
