/**
 * A single scene definition.
 *
 * Scenes are mostly data, plus a little bit of logic to decide:
 * - "Can I fire now?" (location, time, flags, NPCs, etc.)
 * - "What content do I show?" (text + choices)
 */
export class Scene {
  constructor(config) {
    if (!config?.id) {
      throw new Error("Scene needs an id");
    }

    this.id = config.id;

    // Where this scene can appear.
    // - string: specific location id
    // - array of ids
    // - function(game): boolean (for fancy stuff, e.g., any 'park' type)
    this.locations = config.locations ?? null;

    // Weight (chance relative to other scenes)
    this.weight = config.weight ?? 1;

    // If true, the scene should only ever appear once per save.
    this.once = !!config.once;

    // Optional tags like ["intro", "park", "npc:alex"]
    this.tags = new Set(config.tags || []);

    // Conditions: array of (game) => boolean
    // e.g. requiresFlag("met_alex"), duringHours(8, 20), etc.
    this.conditions = Array.isArray(config.conditions) ? config.conditions : config.conditions ? [config.conditions] : [];

    // Required NPC ids (all must be present & available at this location)
    this.npcIds = config.npcIds || [];

    // Optional custom NPC filter if you need more complex logic.
    // fn(game, npcsAtLocation) => boolean
    this.npcCondition = config.npcCondition || null;

    // Content builder: (game) => { text, choices: [...] }
    // This is where your writer puts text + choices.
    this.build = config.build;
    if (typeof this.build !== "function") {
      throw new Error(`Scene ${this.id} needs a build(game) function`);
    }
  }

  hasTag(tag) {
    return this.tags.has(tag);
  }

  /**
   * Whether this scene has already been seen (for one-time scenes).
   * Needs a simple "seenScenes" object on game.flags.
   */
  wasSeen(game) {
    return !!game.flags?.seenScenes?.[this.id];
  }

  /**
   * Mark the scene as seen on this save.
   */
  markSeen(game) {
    if (!game.flags) game.flags = {};
    if (!game.flags.seenScenes) game.flags.seenScenes = {};
    game.flags.seenScenes[this.id] = true;
  }

  /**
   * Can this scene fire right now for this game state?
   */
  canFire(game) {
    if (!game) return false;

    // One-time scenes
    if (this.once && this.wasSeen(game)) return false;

    // Location
    if (!this._checkLocation(game)) return false;

    // NPC presence & availability
    if (!this._checkNPCs(game)) return false;

    // Conditions: all must pass
    for (const cond of this.conditions) {
      if (!cond(game)) return false;
    }

    return true;
  }

  _checkLocation(game) {
    if (!this.locations) return true; // anywhere

    const currentId = game.currentLocationId;
    if (!currentId) return false;

    if (typeof this.locations === "string") {
      return this.locations === currentId;
    }

    if (Array.isArray(this.locations)) {
      return this.locations.includes(currentId);
    }

    if (typeof this.locations === "function") {
      return !!this.locations(game);
    }

    return false;
  }

  _checkNPCs(game) {
    if (!this.npcIds.length && !this.npcCondition) return true;

    const npcsAtLocation = [];
    for (const npc of game.npcs.values()) {
      if (npc.locationId === game.currentLocationId) {
        npcsAtLocation.push(npc);
      }
    }

    // Required explicit NPC ids must be present & available
    for (const id of this.npcIds) {
      const npc = game.npcs.get(id);
      if (!npc) return false;
      if (npc.locationId !== game.currentLocationId) return false;

      // interprets both npc.available and npc.isAvailable, default true
      const avail = "available" in npc ? npc.available : "isAvailable" in npc ? npc.isAvailable : true;

      if (!avail) return false;
    }

    if (this.npcCondition) {
      return !!this.npcCondition(game, npcsAtLocation);
    }

    return true;
  }

  /**
   * Build the scene content: { text, choices }
   */
  buildScene(game) {
    return this.build(game);
  }
}

/**
 * Utility to choose a random scene from a list,
 * based on canFire() and weight.
 */
export function pickRandomScene(game, scenes, rng) {
  const rnd = rng;

  const candidates = [];
  for (const scene of scenes) {
    if (scene.canFire(game)) {
      candidates.push(scene);
    }
  }

  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, s) => sum + (s.weight || 1), 0);
  let roll = rnd() * totalWeight;

  for (const scene of candidates) {
    const w = scene.weight || 1;
    if (roll < w) {
      return scene;
    }
    roll -= w;
  }

  return candidates[candidates.length - 1];
}
