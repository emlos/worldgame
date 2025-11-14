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
  { key: "downtown", label: "Downtown", tags: ["urban", "commercial", "transit", "dense"], weight: 3, min: 1 },
  { key: "residential_core", label: "Residential Core", tags: ["urban", "residential", "dense"], weight: 4 },
  { key: "suburb", label: "Suburb", tags: ["suburban", "residential"], weight: 6 },
  { key: "industrial", label: "Industrial Park", tags: ["industrial", "urban"], weight: 2 },
  { key: "campus", label: "University District", tags: ["education", "suburban", "urban"], weight: 1, max: 1 },
  { key: "old_town", label: "Old Town", tags: ["urban", "historic", "tourism", "commercial"], weight: 2 },
  { key: "harbor", label: "Harbor", tags: ["industrial", "coastal", "commercial"], weight: 1, max: 1 },
  { key: "market_district", label: "Market District", tags: ["urban", "commercial"], weight: 2 },
  { key: "parklands", label: "Parklands", tags: ["green", "recreation"], weight: 2 },
  { key: "rural_edge", label: "Rural Edge", tags: ["rural", "residential", "sparse"], weight: 2 },
];
