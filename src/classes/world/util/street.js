// --------------------------
// World Graph
// --------------------------

export class Street {
  // street
  constructor({ a, b, minutes, streetName }) {
    this.a = a; // locationId
    this.b = b; // locationId
    this.minutes = clamp(minutes, 1, 5); // fixed at world-gen
    this.streetName = streetName || "Street";
  }
}


