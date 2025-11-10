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
}