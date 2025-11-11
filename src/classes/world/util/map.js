// --------------------------
// World Graph
// --------------------------

export class Place {
  constructor({ id, name, kind = "point of interest" } = {}) {
    this.id = String(id);
    this.name = name || "Place";
    this.kind = kind; // e.g., 'cafe', 'market', 'home', 'office'
  }
}

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

export class Location {
  constructor({ id, name, places = [], x = 0, y = 0 } = {}) {
    this.id = String(id);
    this.name = name || `Loc ${id}`;
    this.places = places; // array<Place>
    this.neighbors = new Map(); // neighborId -> Edge
    this.x = x; // screen/world space (arbitrary units)
    this.y = y;
  }
  connect(other, edge) {
    this.neighbors.set(other.id, edge);
  }
}