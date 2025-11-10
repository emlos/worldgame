import { Relationship, Stat, makeFlagSkill, makeMeterSkill} from "./modules.js";
import { Gender, PronounSets, adjustHexLightness, Clothing, clamp, deepFreeze } from "../../shared/modules.js";

/*
  Text Adventure Core – Player model (vanilla JS, no build step)
  ----------------------------------------------------------------
  This file defines the data model for a Twine-like, text‑based HTML game.
  It focuses on Player state, including:
    - Stats with base values and modifiers
    - Physical appearance & colors (incl. tan/losenTan helpers)
    - Traits (world/interaction/stat modifiers)
    - Relationships with NPCs
    - Skills (flag or meter 0..1)
    - Gender, pronouns, and perceived gender (derived)
    - Clothing inventory & wear slots
*/

// --------------------------
// Player
// --------------------------

export class Player {
  /**
   * @param {object} opts
   * @param {object} opts.stats e.g., { looks: 5, strength: 3, intelligence: 4 }
   * @param {object} opts.appearance { head, body, face, hair } -> image paths
   * @param {string} opts.skinTone hex color string (e.g., #d2a679)
   * @param {string} opts.eyeColor hex
   * @param {string} opts.hairColor hex
   * @param {('m'|'f'|'nb')} opts.gender
   * @param {object} opts.pronouns PronounSets.* or custom
   */
  constructor({
    stats = {},
    appearance = { head: "head/1.png", body: "body/1.png", face: "head/1.png", hair: "hair/1.png" },
    skinTone = "#f2d3b3",
    eyeColor = "#5b7fa6",
    hairColor = "#5a3b1f",
    gender = Gender.NB,
    pronouns = PronounSets.THEY_THEM,
  } = {}) {
    // Stats ----------------------------------------------------
    this.stats = {};
    for (const [k, v] of Object.entries(stats)) this.stats[k] = new Stat(Number(v) || 0);

    // Appearance -----------------------------------------------
    this._bodyImmutable = deepFreeze({ body: appearance.body }); // body fixed after creation
    this.appearance = {
      head: appearance.head,
      face: appearance.face,
      hair: appearance.hair,
      // body exposed via getter to guarantee immutability
    };

    this._skinTone = skinTone; // hex
    this.eyeColor = eyeColor; // hex
    this.hairColor = hairColor; // hex

    // Identity --------------------------------------------------
    this.gender = gender; // declared gender
    this.pronouns = { ...pronouns };

    // Traits, Relationships, Skills ----------------------------
    this.traits = new Map(); // id -> Trait
    this.relationships = new Map(); // npcId -> Relationship
    this.skills = new Map(); // name -> {type, value}

    // Clothing --------------------------------------------------
    this.clothing = new Map(); // slot -> Clothing
  }

  // --- Appearance & color ---
  get body() {
    return this._bodyImmutable.body;
  } // immutable
  set hair(path) {
    this.appearance.hair = path;
  }
  get hair() {
    return this.appearance.hair;
  }

  get skinTone() {
    return this._skinTone;
  }
  set skinTone(hex) {
    this._skinTone = hex;
  }
  /** Darken skin by step (0..1 small). */
  tan(step = 0.05) {
    this._skinTone = adjustHexLightness(this._skinTone, -Math.abs(step));
    return this._skinTone;
  }
  /** Lighten skin by step (0..1 small). */
  loseTan(step = 0.05) {
    this._skinTone = adjustHexLightness(this._skinTone, Math.abs(step));
    return this._skinTone;
  }

  // --- Stats ---
  getStatBase(name) {
    return this.stats[name]?.base ?? 0;
  }
  setStatBase(name, v) {
    if (!this.stats[name]) this.stats[name] = new Stat(0);
    this.stats[name].base = v;
  }
  /**
   * Compute stat with trait modifiers applied. You can extend with item buffs, etc.
   */
  getStatValue(name) {
    const s = this.stats[name] || new Stat(0);
    // clear temporary before apply
    s.clearModifiers();
    // apply trait modifiers
    for (const trait of this.traits.values()) {
      if (!trait.has(this)) continue;
      const mods = trait.statMods?.[name];
      if (mods?.add) mods.add.forEach((v) => s.addFlat(v));
      if (mods?.mult) mods.mult.forEach((m) => s.addMult(m));
    }
    // clothing / other systems could hook here later
    return s.value;
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

  // --- Relationships ---
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

  // --- Skills ---
  setFlagSkill(name, value = true) {
    this.skills.set(name, makeFlagSkill(value));
  }
  setMeterSkill(name, value = 0) {
    this.skills.set(name, makeMeterSkill(value));
  }
  getSkill(name) {
    return this.skills.get(name);
  }
  improveSkill(name, delta = 0.05) {
    const sk = this.skills.get(name);
    if (!sk) return;
    if (sk.type === "meter") sk.value = clamp(sk.value + delta, 0, 1);
    if (sk.type === "flag") sk.value = true; // flags just set true once earned
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

  // --- Perceived gender ---
  /**
   * Returns { score: -1..+1, label: 'm'|'f'|'nb' }
   * Heuristic combining clothing bias and trait cues; can be extended later
   */
  get perceivedGender() {
    let score = 0;
    // clothing contribution
    score += this.totalClothingGenderBias();
    // trait cues (opt-in): a trait may expose a genderBias property
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
