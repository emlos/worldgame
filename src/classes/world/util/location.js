// --------------------------
// Locations & Districts
// --------------------------

/**
 * Location is a node on the world graph. We extend it with:
 *  - districtKey: which entry from LOCATION_REGISTRY it instantiates
 *  - tags: array of strings describing this location's district characteristics
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

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      places: this.places,
      x: this.x,
      y: this.y,
      districtKey: this.districtKey,
      tags: this.tags.slice(),
      meta: this.meta,
    };
  }

  static fromJSON(data, { places = null } = {}) {
    if (data instanceof Location) return data;
    return new Location({
      id: data?.id,
      name: data?.name,
      places: places ?? (Array.isArray(data?.places) ? data.places : []),
      x: Number(data?.x) || 0,
      y: Number(data?.y) || 0,
      districtKey: data?.districtKey ?? null,
      tags: Array.isArray(data?.tags) ? data.tags : [],
      meta: data?.meta && typeof data.meta === "object" ? { ...data.meta } : {},
    });
  }
}

