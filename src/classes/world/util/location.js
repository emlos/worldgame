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
    this.tags = Array.from(new Set(tags)); // e.g., [LOCATION_TAGS.urban,LOCATION_TAGS.commercial]
    this.meta = meta;
  }

  connect(other, edge) {
    this.neighbors.set(other.id, edge);
  }
}

