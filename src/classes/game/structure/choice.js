
// --------------------------
// Choice
// --------------------------

/**
 * A single option the player can pick in a scene.
 *
 * It’s intentionally simple:
 *  - label: what the player sees
 *  - minutes: how long it takes
 *  - condition(state): can the player choose this?
 *  - onSelect(state): apply effects (stats, flags, etc.)
 *  - nextSceneId: optional follow-up scene id (for chains)
 */
export class Choice {
  constructor({ id, label, description = "", minutes = 0, condition = null, weight = 1, onSelect = null, nextSceneId = null } = {}) {
    if (!id) throw new Error("Choice requires an id");
    if (!label) throw new Error(`Choice '${id}' requires a label`);

    this.id = id;
    this.label = label;
    this.description = description;
    this.minutes = minutes;
    this.condition = condition;
    this.weight = weight;
    this.onSelect = onSelect;
    this.nextSceneId = nextSceneId;
  }

  isAvailable(state) {
    if (typeof this.condition === "function") {
      return !!this.condition(state);
    }
    return true;
  }

  apply(state) {
    if (typeof this.onSelect === "function") {
      this.onSelect(state);
    }
  }
}
