// --------------------------
// World Graph
// --------------------------

export class Street {
  // street
  constructor({ a, b, minutes, distance, streetName }) {
    this.a = a; // locationId
    this.b = b; // locationId
    this.minutes = clamp(minutes, 1, 10); // fixed at world-gen
    this.distance = Math.max(50, Math.round(distance)); // meters
    this.streetName = streetName || "Street";
  }
}

export const STREET_REGISTRY = [
  {
    key: "kings_way",
    name: "King's Way",
    tags: ["urban_core", "urban_center", "urban", "commercial", "dense"],
  },
  {
    key: "maple_blvd",
    name: "Maple Blvd",
    tags: ["suburban", "urban", "residential", "commercial"],
  },
  {
    key: "oak_st",
    name: "Oak St",
    tags: ["urban", "suburban", "residential", "parkland"],
  },
  {
    key: "river_rd",
    name: "River Rd",
    tags: ["urban_edge", "rural", "parkland", "coastal"],
  },
  {
    key: "sunset_ave",
    name: "Sunset Ave",
    tags: ["urban", "suburban", "suburban_hub", "commercial"],
  },
  {
    key: "old_mill_rd",
    name: "Old Mill Rd",
    tags: ["rural", "historic", "industrial", "urban_edge"],
  },

  // Themed after Harbor / Industrial / Coastal
  {
    key: "harborfront_rd",
    name: "Harborfront Rd",
    tags: ["coastal", "industrial", "urban_edge", "urban"],
  },
  {
    key: "dockside_ave",
    name: "Dockside Ave",
    tags: ["coastal", "industrial", "urban_edge"],
  },

  // Themed after Market District / Downtown
  {
    key: "market_st",
    name: "Market St",
    tags: ["urban_core", "urban_center", "urban", "commercial", "historic", "tourism"],
  },
  {
    key: "union_blvd",
    name: "Union Blvd",
    tags: ["urban_center", "urban", "commercial", "suburban_hub", "dense"],
  },

  // Themed after Campus / Education
  {
    key: "campus_way",
    name: "Campus Way",
    tags: ["education", "urban", "suburban", "dense"],
  },

  // Themed after Parklands / Green belts
  {
    key: "parkview_dr",
    name: "Parkview Dr",
    tags: ["parkland", "urban", "suburban", "residential"],
  },

  // Old Town / Historic core
  {
    key: "church_row",
    name: "Church Row",
    tags: ["historic", "urban_center", "urban", "residential"],
  },

  // Residential fringe / rural edge
  {
    key: "hillside_ln",
    name: "Hillside Ln",
    tags: ["suburban", "rural", "residential"],
  },
];
