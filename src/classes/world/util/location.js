// --------------------------
// Locations & Districts
// --------------------------

/**
 * Location is a node on the world graph. We extend it with:
 *  - districtKey: which entry from LOCATION_REGISTRY it instantiates
 *  - tags: array of strings describing this location's district traits
 */
export class Location {
  constructor({ id, name, places = [], x = 0, y = 0, districtKey = null, tags = [], meta = {} } = {}) {
    this.id = String(id);
    this.name = name || `Loc ${id}`;
    this.places = places; // array<Place>
    this.neighbors = new Map(); // neighborId -> Edge
    this.x = x;
    this.y = y;
    this.districtKey = districtKey; // e.g., "downtown"
    this.tags = Array.from(new Set(tags)); // e.g., ["urban","commercial"]
    this.meta = meta;
  }

  connect(other, edge) {
    this.neighbors.set(other.id, edge);
  }
}

/**
 * District registry:
 * - key: unique identifier
 * - label: human-readable name
 * - tags: list of tags that characterize this district
 * - weight: relative probability during random generation
 * - min/max (optional): soft constraints for typical counts in a town
 */
export const LOCATION_REGISTRY = [
  // -------- URBAN CORE / CENTER --------
  {
    key: "downtown",
    label: "Downtown",
    tags: ["urban_core", "urban_center", "urban", "commercial", "dense"],
    weight: 3,
    min: 1,
  },
  {
    key: "market_district",
    label: "Market District",
    tags: ["urban_center", "urban", "commercial", "dense"],
    weight: 2,
  },

  // -------- URBAN RESIDENTIAL --------
  {
    key: "residential_core",
    label: "Residential Core",
    tags: ["urban_center", "urban", "residential", "dense"],
    weight: 4,
  },

  // -------- SUBURBAN / HUBS --------
  {
    key: "suburb",
    label: "Suburb",
    tags: ["suburban", "residential"],
    weight: 6,
  },
  {
    key: "suburban_town_center",
    label: "Suburban Town Center",
    tags: ["suburban_hub", "suburban", "commercial", "residential"],
    weight: 3,
  },

  // -------- URBAN EDGE / INDUSTRIAL --------
  {
    key: "industrial",
    label: "Industrial Park",
    tags: ["industrial", "urban_edge", "urban"],
    weight: 2,
  },
  {
    key: "harbor",
    label: "Harbor",
    tags: ["coastal", "industrial", "commercial", "urban_edge"],
    weight: 1,
    max: 1,
  },

  // -------- EDUCATION / CAMPUS --------
  {
    key: "campus",
    label: "University District",
    tags: ["education", "urban", "suburban", "dense"],
    weight: 1,
    max: 1,
  },

  // -------- HISTORIC / TOURISM --------
  {
    key: "old_town",
    label: "Old Town",
    tags: ["historic", "tourism", "urban_center", "urban"],
    weight: 2,
  },

  // -------- PARKLAND / GREEN EDGES --------
  {
    key: "parklands",
    label: "Parklands",
    tags: ["parkland", "suburban", "urban_edge"],
    weight: 2,
  },

  // -------- RURAL / EDGE --------
  {
    key: "rural_edge",
    label: "Rural Edge",
    tags: ["rural", "residential"],
    weight: 2,
  },
];
