import { clamp } from "../../shared/util/util.js";

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


  toJSON() {
    return {
      a: this.a,
      b: this.b,
      minutes: this.minutes,
      streetName: this.streetName,
    };
  }

  static fromJSON(data) {
    if (data instanceof Street) return data;
    return new Street(data || {});
  }
}


