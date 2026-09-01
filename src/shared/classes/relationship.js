
import { clamp } from "../util/util.js";

// --------------------------
// Relationships
// --------------------------

export const RELATIONSHIP_MIN = 0;
export const RELATIONSHIP_MAX = 100;

export class Relationship {
  constructor({ npcId, met = false, score = 0 } = {}) {
    this.npcId = String(npcId);
    this.met = !!met;
    this.score = clamp(
      Number(score) || RELATIONSHIP_MIN,
      RELATIONSHIP_MIN,
      RELATIONSHIP_MAX,
    );
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
