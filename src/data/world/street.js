import { LOCATION_TAGS } from "../data.js";

export const STREET_REGISTRY = [
  {
    key: "kings_way",
    name: "King's Way",
    tags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.urban_center, LOCATION_TAGS.urban, LOCATION_TAGS.commercial, LOCATION_TAGS.dense],
  },
  {
    key: "maple_blvd",
    name: "Maple Blvd",
    tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.urban, LOCATION_TAGS.residential, LOCATION_TAGS.commercial],
  },
  {
    key: "oak_st",
    name: "Oak St",
    tags: [LOCATION_TAGS.urban, LOCATION_TAGS.suburban, LOCATION_TAGS.residential, LOCATION_TAGS.parkland],
  },
  {
    key: "river_rd",
    name: "River Rd",
    tags: [LOCATION_TAGS.urban_edge, LOCATION_TAGS.rural, LOCATION_TAGS.parkland, LOCATION_TAGS.coastal],
  },
  {
    key: "sunset_ave",
    name: "Sunset Ave",
    tags: [LOCATION_TAGS.urban, LOCATION_TAGS.suburban, LOCATION_TAGS.suburban_hub, LOCATION_TAGS.commercial],
  },
  {
    key: "old_mill_rd",
    name: "Old Mill Rd",
    tags: [LOCATION_TAGS.rural, LOCATION_TAGS.historic, LOCATION_TAGS.industrial, LOCATION_TAGS.urban_edge],
  },

  // Themed after Harbor / Industrial / Coastal
  {
    key: "harborfront_rd",
    name: "Harborfront Rd",
    tags: [LOCATION_TAGS.coastal, LOCATION_TAGS.industrial, LOCATION_TAGS.urban_edge, LOCATION_TAGS.urban],
  },
  {
    key: "dockside_ave",
    name: "Dockside Ave",
    tags: [LOCATION_TAGS.coastal, LOCATION_TAGS.industrial, LOCATION_TAGS.urban_edge],
  },

  // Themed after Market District / Downtown
  {
    key: "market_st",
    name: "Market St",
    tags: [LOCATION_TAGS.urban_core, LOCATION_TAGS.urban_center, LOCATION_TAGS.urban, LOCATION_TAGS.commercial, LOCATION_TAGS.historic, LOCATION_TAGS.tourism],
  },
  {
    key: "union_blvd",
    name: "Union Blvd",
    tags: [LOCATION_TAGS.urban_center, LOCATION_TAGS.urban, LOCATION_TAGS.commercial, LOCATION_TAGS.suburban_hub, LOCATION_TAGS.dense],
  },

  // Themed after Campus / Education
  {
    key: "campus_way",
    name: "Campus Way",
    tags: [LOCATION_TAGS.education, LOCATION_TAGS.urban, LOCATION_TAGS.suburban, LOCATION_TAGS.dense],
  },

  // Themed after Parklands / Green belts
  {
    key: "parkview_dr",
    name: "Parkview Dr",
    tags: [LOCATION_TAGS.parkland, LOCATION_TAGS.urban, LOCATION_TAGS.suburban, LOCATION_TAGS.residential],
  },

  // Old Town / Historic core
  {
    key: "church_row",
    name: "Church Row",
    tags: [LOCATION_TAGS.historic, LOCATION_TAGS.urban_center, LOCATION_TAGS.urban, LOCATION_TAGS.residential],
  },

  // Residential fringe / rural edge
  {
    key: "hillside_ln",
    name: "Hillside Ln",
    tags: [LOCATION_TAGS.suburban, LOCATION_TAGS.rural, LOCATION_TAGS.residential],
  },
];