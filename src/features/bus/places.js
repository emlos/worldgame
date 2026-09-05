import { LOCATION_TAGS } from "../../world/data/location.js";
import { hoursAllDay } from "../../world/data/openingHours.js";
import { BUS_STOP_KEY } from "./config.js";

export const BUS_PLACE_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: BUS_STOP_KEY,
    label: "Bus Stop",
    distribution: Object.freeze({
      kind: "graph-coverage",
      locationsPerInstance: Object.freeze({ min: 2, max: 4 }),
      maxGraphDistance: 2,
    }),
    allowedTags: Object.freeze([...Object.values(LOCATION_TAGS)]),
    props: Object.freeze({
      icon: "🚌",
      category: Object.freeze(["transport"]),
      openingHours: hoursAllDay(),
    }),
    nameFn: ({ index }) => `Bus Stop ${index + 1}`,
    unlocked: true,
  }),
]);
