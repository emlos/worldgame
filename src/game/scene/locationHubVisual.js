import { LOCATION_REGISTRY } from "../../world/data/location.js";
import { createLayeredImageVisual } from "./layeredImage.js";

export const LOCATION_HUB_VISUAL_WIDTH = 256;
export const LOCATION_HUB_VISUAL_HEIGHT = 64;

const SKY_POSITION_COUNT = 5;
const DISTRICT_KEYS = new Set(LOCATION_REGISTRY.map(({ key }) => key));

/** Select the closest of five left-to-right positions within a day/night period. */
export function getCelestialVisualFrame(daylight) {
  if (!daylight || !["day", "night"].includes(daylight.period)) {
    throw new TypeError("A celestial visual requires a valid daylight period");
  }
  if (!Number.isFinite(daylight.progress) || daylight.progress < 0 || daylight.progress > 1) {
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
  if (!location) throw new Error("A location hub visual requires a current location");
  const celestial = getCelestialVisualFrame(game.world.getDaylightAt(game.now));

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
