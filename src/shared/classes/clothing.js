import { clamp } from "../util/util.js";

// --------------------------
// Clothing
// --------------------------

export const WearSlot = Object.freeze({
  UPPER: "upper body",
  LOWER: "lower body",
  HEAD: "head",
  FACE: "face",
  NECK: "neck",
  HANDS: "hands",
  LEGS: "legs",
  FEET: "feet",
  UNDERWEAR_UPPER: "top underwear",
  UNDERWEAR_LOWER: "bottom underwear",
});

export class Clothing {
  constructor({
    id,
    slot,
    image,
    durability = 1,
    wetness = 0,
    color = "#ffffff",
    genderBias = 0, // -1 (masc) .. +1 (fem)
  } = {}) {
    this.id = id;
    this.slot = slot; // one of WearSlot
    this.image = image; // url/path
    this.durability = clamp(durability, 0, 1);
    this.wetness = clamp(wetness, 0, 1);
    this.color = color;
    this.genderBias = clamp(genderBias, -1, 1);
  }

  toJSON() {
    return {
      id: this.id,
      slot: this.slot,
      image: this.image,
      durability: this.durability,
      wetness: this.wetness,
      color: this.color,
      genderBias: this.genderBias,
    };
  }

  static fromJSON(data) {
    if (data instanceof Clothing) return data;
    return new Clothing(data || {});
  }
}
