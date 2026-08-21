// --------------------------
// Traits
// --------------------------

/** Trait defines a named effect, description, and optional stat hooks. */
export class Trait {
  constructor({ id, description = "", has = null, statMods = {} } = {}) {
    this.id = id;
    this.description = description;
    /** optional function(player): boolean – used for context checks */
    this.has = typeof has === "function" ? has : () => true;
    /** statMods: { [statName]: { add?: number[], mult?: number[] } } */
    this.statMods = statMods;
  }

  toJSON() {
    const out = {
      id: this.id,
      description: this.description,
      statMods: this.statMods,
    };

    // Traits sometimes carry small data-only extensions (for example
    // genderBias). Preserve serializable own properties, but never functions.
    for (const [key, value] of Object.entries(this)) {
      if (key === "has" || key in out || typeof value === "function") continue;
      out[key] = value;
    }
    return out;
  }

  static fromJSON(data, { resolver = null } = {}) {
    if (data instanceof Trait) return data;

    const resolved = typeof resolver === "function" ? resolver(data?.id, data) : null;
    const source = resolved instanceof Trait ? resolved : null;
    const trait = new Trait({
      id: data?.id ?? source?.id,
      description: data?.description ?? source?.description ?? "",
      has: source?.has ?? null,
      statMods: data?.statMods ?? source?.statMods ?? {},
    });

    for (const [key, value] of Object.entries(data || {})) {
      if (key === "id" || key === "description" || key === "statMods" || key === "has") continue;
      trait[key] = value;
    }
    return trait;
  }
}