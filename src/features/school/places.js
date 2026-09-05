import { LOCATION_TAGS } from "../../world/data/location.js";
import { hoursWeekdays } from "../../world/data/openingHours.js";
import { HIGH_SCHOOL_PLACE_KEY } from "./config.js";

export const SCHOOL_PLACE_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: HIGH_SCHOOL_PLACE_KEY,
    label: "High School",
    allowedTags: Object.freeze([
      LOCATION_TAGS.urban,
      LOCATION_TAGS.suburban,
      LOCATION_TAGS.urban_edge,
      LOCATION_TAGS.suburban_hub,
      LOCATION_TAGS.residential,
    ]),
    props: Object.freeze({
      icon: "🏫",
      category: Object.freeze(["education"]),
      ejectAtClose: true,
      openingHours: hoursWeekdays({ from: "07:00", to: "17:00" }),
    }),
    nameFn: ({ rnd }) => {
      const names = [
        "St. Genevieve's High School",
        "Riverside High",
        "Docktown High",
      ];
      return names[(rnd() * names.length) | 0];
    },
    unlocked: true,
  }),
]);
