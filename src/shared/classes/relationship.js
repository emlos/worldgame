
import { clamp } from "../util/util.js";

// --------------------------
// Relationships
// --------------------------

export class Relationship {
  constructor({ npcId, met = false, score = 0 } = {}) {
    this.npcId = String(npcId);
    this.met = !!met;
    this.score = clamp(Number(score) || 0, -1, 1);
  }

  toJSON() {
    return {
      npcId: this.npcId,
      met: this.met,
      score: this.score,
    };
  }

  static fromJSON(data) {
    if (data instanceof Relationship) return data;
    return new Relationship(data || {});
  }
}