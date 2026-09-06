import { LOCATION_REGISTRY } from "../../world/data/location.js";
import { WeatherType } from "../../world/data/weather.js";
import {
  CANVAS_PLAYBACK_TYPE,
  createCanvasVisual,
} from "./canvasVisual.js";

export const LOCATION_HUB_VISUAL_WIDTH = 256;
export const LOCATION_HUB_VISUAL_HEIGHT = 64;

const SKY_POSITION_COUNT = 5;
const DISTRICT_KEYS = new Set(LOCATION_REGISTRY.map(({ key }) => key));
const WEATHER_TYPES = new Set(Object.values(WeatherType));

const STATIC_PLAYBACK = Object.freeze({ type: CANVAS_PLAYBACK_TYPE.static });

const WEATHER_FRAMES = Object.freeze({
  sunny: ["assets/locations/weather/sunny.png"],
  windy: [1, 2, 3].map(
    (frame) => `assets/locations/weather/wind_${String(frame).padStart(2, "0")}.png`,
  ),
  rain: [1, 2, 3].map(
    (frame) => `assets/locations/weather/rain_${String(frame).padStart(2, "0")}.png`,
  ),
  snow: [1, 2].map(
    (frame) => `assets/locations/weather/snow_${String(frame).padStart(2, "0")}.png`,
  ),
  storm: [1, 2, 3, 4, 5, 6].map(
    (frame) => `assets/locations/weather/storm_${String(frame).padStart(2, "0")}.png`,
  ),
  cloudy: [1, 2, 3, 4].map(
    (frame) => `assets/locations/weather/cloudy_${String(frame).padStart(2, "0")}.png`,
  ),
});

function staticLayer(id, src) {
  return { id, frames: [src], playback: STATIC_PLAYBACK };
}

function loopingLayer(id, fps) {
  return {
    id,
    frames: WEATHER_FRAMES[id],
    playback: { type: CANVAS_PLAYBACK_TYPE.loop, fps },
  };
}

function stormLayer() {
  return {
    id: "storm",
    frames: WEATHER_FRAMES.storm,
    playback: {
      type: CANVAS_PLAYBACK_TYPE.burst,
      fps: 12,
      groupSize: 2,
      intervalMs: { min: 2_000, max: 6_000 },
    },
  };
}

/** Weather tracks in back-to-front drawing order. */
export function getWeatherVisualLayers(weather, daylightPeriod) {
  if (!WEATHER_TYPES.has(weather)) {
    throw new Error(`Unknown weather type '${String(weather)}'`);
  }
  if (!["day", "night"].includes(daylightPeriod)) {
    throw new Error(`Unknown daylight period '${String(daylightPeriod)}'`);
  }
  const layers = [];
  if (weather === WeatherType.SUNNY && daylightPeriod === "day") {
    layers.push(staticLayer("sunny", WEATHER_FRAMES.sunny[0]));
  }
  if (weather === WeatherType.WINDY) layers.push(loopingLayer("windy", 1));
  if (weather === WeatherType.RAIN || weather === WeatherType.STORM) {
    layers.push(loopingLayer("rain", 6));
  }
  if (weather === WeatherType.SNOW) layers.push(loopingLayer("snow", 1));
  if (weather === WeatherType.STORM) layers.push(stormLayer());
  if (
    weather === WeatherType.CLOUDY ||
    weather === WeatherType.RAIN ||
    weather === WeatherType.STORM ||
    weather === WeatherType.SNOW
  ) {
    layers.push(loopingLayer("cloudy", 1.5));
  }
  return layers;
}

/** Select the closest of five left-to-right positions within a day/night period. */
export function getCelestialVisualFrame(daylight) {
  if (!daylight || !["day", "night"].includes(daylight.period)) {
    throw new TypeError("A celestial visual requires a valid daylight period");
  }
  if (
    !Number.isFinite(daylight.progress) ||
    daylight.progress < 0 ||
    daylight.progress > 1
  ) {
    throw new RangeError("Daylight progress must be between 0 and 1");
  }
  const position = Math.min(
    SKY_POSITION_COUNT - 1,
    Math.round(daylight.progress * (SKY_POSITION_COUNT - 1)),
  );
  const frame = SKY_POSITION_COUNT - position;
  const kind = daylight.period === "day" ? "sun" : "moon";
  const frameLabel = String(frame).padStart(2, "0");

  return {
    kind,
    frame,
    src: `assets/locations/time/${kind}_${frameLabel}.png`,
  };
}

export function districtBaseVisualSource(districtKey) {
  const key = String(districtKey ?? "");
  if (!DISTRICT_KEYS.has(key)) {
    throw new Error(`Unknown location district key '${key}'`);
  }
  return `assets/locations/base/${key}.png`;
}

export function buildLocationHubVisual(game) {
  const location = game?.location;
  if (!location) {
    throw new Error("A location hub visual requires a current location");
  }
  const daylight = game.world.getDaylightAt(game.now);
  const celestial = getCelestialVisualFrame(daylight);
  const weather = game.world.currentWeather;

  return createCanvasVisual({
    width: LOCATION_HUB_VISUAL_WIDTH,
    height: LOCATION_HUB_VISUAL_HEIGHT,
    alt: null,
    animationSeed: `${game.seed}:${location.id}:${weather}:${game.now.getTime()}`,
    layers: [
      staticLayer("district", districtBaseVisualSource(location.districtKey)),
      staticLayer("celestial", celestial.src),
      ...getWeatherVisualLayers(weather, daylight.period),
    ],
  });
}
