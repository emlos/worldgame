import { Relationship, Stat, Gender, PronounSets, Clothing, clamp } from "../../shared/modules.js";
// --------------------------
// NPC
// --------------------------

export class NPC {
  /**
   * @param {object} opts
   * @param {string} opts.name
   * @param {number} opts.age
   * @param {object} opts.stats base stats, e.g. { looks: 4, strength: 2 }
   * @param {('m'|'f'|'nb')} opts.gender
   * @param {object} opts.pronouns PronounSets.* or custom
   */
  constructor({ name, age, stats = {}, gender = Gender.NB, pronouns = PronounSets.THEY_THEM } = {}) {
    this.name = String(name || "");
    this.age = Number(age) || 0;

    // Stats are immutable for NPCs (no training/tan/etc.)
    this.stats = {};
    for (const [k, v] of Object.entries(stats)) {
      const s = new Stat(Number(v) || 0);
      Object.freeze(s); // lock base & internals; computation will use a temp Stat
      this.stats[k] = s;
    }
    Object.freeze(this.stats);

    // Identity
    this.gender = gender;
    this.pronouns = { ...pronouns };

    // Traits, Relationships, Clothing
    this.traits = new Map(); // id -> Trait
    this.relationships = new Map(); // npcId -> Relationship
    this.clothing = new Map(); // slot -> Clothing
  }

  // --- Stats (read-only base, computed value with trait/clothing mods) ---
  getStatBase(name) {
    return this.stats[name]?.base ?? 0;
  }
  getStatValue(name) {
    const base = this.getStatBase(name);
    // Use a temporary Stat so we never mutate the frozen ones
    const temp = new Stat(base);
    // apply trait modifiers
    for (const trait of this.traits.values()) {
      if (!trait.has(this)) continue;
      const mods = trait.statMods?.[name];
      if (mods?.add) mods.add.forEach((v) => temp.addFlat(v));
      if (mods?.mult) mods.mult.forEach((m) => temp.addMult(m));
    }
    // clothing hooks could be added here later
    return temp.value;
  }

  // --- Traits ---
  addTrait(trait) {
    this.traits.set(trait.id, trait);
    return this;
  }
  removeTrait(id) {
    this.traits.delete(id);
  }
  hasTrait(id) {
    return this.traits.has(id) && this.traits.get(id).has(this);
  }

  // --- Relationships with other NPCs ---
  setRelationship({ npcId, met = true, score = 0 }) {
    this.relationships.set(String(npcId), new Relationship({ npcId, met, score }));
  }
  getRelationship(npcId) {
    return this.relationships.get(String(npcId)) || new Relationship({ npcId });
  }
  bumpRelationship(npcId, delta) {
    const r = this.getRelationship(npcId);
    r.met = true;
    r.score = clamp(r.score + delta, -1, 1);
    this.relationships.set(String(npcId), r);
    return r.score;
  }

  // --- Clothing ---
  equip(item) {
    if (!(item instanceof Clothing)) throw new Error("equip expects Clothing");
    this.clothing.set(item.slot, item);
  }
  unequip(slot) {
    this.clothing.delete(slot);
  }
  getEquipped(slot) {
    return this.clothing.get(slot) || null;
  }
  totalClothingGenderBias() {
    let sum = 0;
    for (const item of this.clothing.values()) sum += item.genderBias || 0;
    return clamp(sum, -1, 1);
  }

  // --- Perceived gender (derived) ---
  get perceivedGender() {
    let score = 0;
    score += this.totalClothingGenderBias();
    for (const t of this.traits.values()) {
      if (typeof t.genderBias === "number") score += t.genderBias;
    }
    score = clamp(score, -1, 1);
    let label = Gender.NB;
    if (score <= -0.33) label = Gender.M;
    else if (score >= 0.33) label = Gender.F;
    return { score, label };
  }
}
