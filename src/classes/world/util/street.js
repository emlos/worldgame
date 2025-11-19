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


