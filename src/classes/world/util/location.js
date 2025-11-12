
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