import { LOCATION_REGISTRY } from "../../world/data/location.js";
import { createLayeredImageVisual } from "./layeredImage.js";

export const LOCATION_HUB_VISUAL_WIDTH = 256;
export const LOCATION_HUB_VISUAL_HEIGHT = 64;
export const DAY_START_MINUTES = 6 * 60;
export const NIGHT_START_MINUTES = 18 * 60;

const PERIOD_MINUTES = 12 * 60;
const SKY_POSITION_COUNT = 5;
const DISTRICT_KEYS = new Set(LOCATION_REGISTRY.map(({ key }) => key));

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`Invalid sky visual date: ${String(value)}`);
  }
  return date;
}

function minutesSinceMidnight(date) {
  return (
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60 +
    date.getUTCMilliseconds() / 60_000
  );
}

/** Select the closest of five left-to-right positions during a 12-hour period. */
export function getCelestialVisualFrame(value) {
  const date = validDate(value);
  const minutes = minutesSinceMidnight(date);
  const daytime = minutes >= DAY_START_MINUTES && minutes < NIGHT_START_MINUTES;
  const elapsed = daytime
    ? minutes - DAY_START_MINUTES
    : minutes >= NIGHT_START_MINUTES
      ? minutes - NIGHT_START_MINUTES
      : minutes + 24 * 60 - NIGHT_START_MINUTES;
  const position = Math.min(
    SKY_POSITION_COUNT - 1,
    Math.round((elapsed / PERIOD_MINUTES) * (SKY_POSITION_COUNT - 1)),
  );
  const frame = SKY_POSITION_COUNT - position;
  const kind = daytime ? "sun" : "moon";
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
  if (!location) throw new Error("A location hub visual requires a current location");
  const celestial = getCelestialVisualFrame(game.now);

  return createLayeredImageVisual({
    width: LOCATION_HUB_VISUAL_WIDTH,
    height: LOCATION_HUB_VISUAL_HEIGHT,
    alt: null,
    layers: [
      {
        id: "district",
        src: districtBaseVisualSource(location.districtKey),
      },
      { id: "celestial", src: celestial.src },
    ],
  });
}
