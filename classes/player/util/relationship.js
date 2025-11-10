
// --------------------------
// Relationships
// --------------------------

export class Relationship {
  constructor({ npcId, met = false, score = 0 } = {}) {
    this.npcId = String(npcId);
    this.met = !!met;
    this.score = clamp(Number(score) || 0, -1, 1);
  }
}