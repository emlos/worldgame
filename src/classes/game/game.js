// worldgame/src/game/game.js
import { World, Player, NPC } from "../classes.js";
import { makeRNG } from "../../shared/modules.js";
import { LOCATION_TAGS } from "../../data/data.js";

// High-level orchestrator for world + player + NPCs.
export class Game {
    constructor({
        seed = Date.now(),
        startDate = new Date(),
        playerOptions = {},
        npcTemplates = NPC_REGISTRY,
    } = {}) {
        // --- core random seed ---
        this.seed = seed >>> 0;
        this.rnd = makeRNG(this.seed);

        // --- world ---
        this.world = new World({
            rnd: this.rnd,
            startDate,
        });

        // --- player ---
        this.player = new Player(playerOptions);

        // --- npcs ---
        this.npcs = new Map();
        this._createNPCs(npcTemplates);

        // Where is the player right now?
        this.currentLocationId = playerOptions.startLocationId || this._pickDefaultLocationId();

        // For later: currently active “event/scene”
        this.currentScene = null;

        // Simple log of actions for debugging / history
        this.log = [];

        // simple event system for UI / other systems to subscribe
        this._listeners = {
            time: new Set(), // (game, minutes) => void
            location: new Set(), // (game, newLocationId) => void
            scene: new Set(), // (game, sceneOrNull) => void
        };
    }

    // --------------------------
    // Basic getters
    // --------------------------
    get now() {
        return this.world.time.date;
    }

    get location() {
        return this.world.getLocation(this.currentLocationId);
    }

    get npcsArray() {
        return [...this.npcs.values()];
    }

    // --------------------------
    // Time & actions
    // --------------------------
    /**
     * Advance world time by N minutes.
     * Later this is where you'll hook NPC AI, queued events, etc.
     */
    advanceMinutes(mins) {
        if (!Number.isFinite(mins) || mins <= 0) return;

        this.world.advance(mins);

        // Notify listeners (UI, debug, etc.)
        for (const cb of this._listeners.time) cb(this, mins);
    }

    /**
     * Move player to another location on the world map.
     */
    moveTo(locationId) {
        if (!this.world.locations.has(locationId)) {
            throw new Error(`Unknown location: ${locationId}`);
        }
        if (locationId === this.currentLocationId) return;

        this.currentLocationId = locationId;
        for (const cb of this._listeners.location) cb(this, locationId);
    }

    /**
     * Wrapper for player actions: do stuff, spend time, log it.
     * This is a good fit for your “choices” later.
     */
    runAction({ label, minutes = 0, apply }) {
        if (typeof label === "string" && label) {
            this.log.push({ t: this.now.toISOString(), label });
        }

        if (typeof apply === "function") {
            // let the action mutate game / player / npcs / world
            apply(this);
        }

        if (minutes > 0) {
            this.advanceMinutes(minutes);
        }
    }

    // --------------------------
    // Scenes (events will use this later)
    // --------------------------
    startScene(scene) {
        this.currentScene = scene;
        for (const cb of this._listeners.scene) cb(this, scene);
    }

    endScene() {
        this.currentScene = null;
        for (const cb of this._listeners.scene) cb(this, null);
    }

    // --------------------------
    // Simple event/listener API
    // --------------------------
    /**
     * game.on("time", cb) -> unsubscribe function
     * game.on("location", cb)
     * game.on("scene", cb)
     */
    on(eventName, fn) {
        const set = this._listeners[eventName];
        if (!set) throw new Error(`Unknown event type: ${eventName}`);
        set.add(fn);
        return () => set.delete(fn);
    }

    // --------------------------
    // Save / load
    // --------------------------
    toJSON() {
        return {
            seed: this.seed,
            time: this.now.toISOString(),
            player: this.player, // Player is already a pure data class
            npcs: this.npcsArray, // NPCs as plain objects
            currentLocationId: this.currentLocationId,
            log: this.log,
        };
    }

    static fromJSON(data) {
        const game = new Game({
            seed: data.seed,
            startDate: new Date(data.time),
            playerOptions: data.player,
            npcTemplates: data.npcs,
        });
        game.currentLocationId = data.currentLocationId;
        game.log = Array.isArray(data.log) ? data.log.slice() : [];
        return game;
    }

    _pickDefaultLocationId() {
        const first = this.world.locations.keys().next();
        return first.done ? null : first.value;
    }

    // --------------------------
    // Internals
    // --------------------------
    _createNPCs(templates) {
        for (const def of templates || []) {
            let npc;
            let id;

            if (def instanceof NPC) {
                npc = def;
                id = def.id || def.name;
            } else {
                npc = new NPC(def);
                id = def.id || npc.id || npc.name;
            }

            // Ensure id is always a string
            id = String(id || npc.name);
            npc.id = id;

            // Attach home + starting location
            this._assignHomeForNPC(id, npc);

            this.npcs.set(id, npc);
        }
    }

    /**
     * Pick a random urban/suburban Location, create a home Place there,
     * and wire it back to the NPC.
     *
     * Rules:
     *  - pick random location with "urban" or "suburban" tags (fallback: any location)
     *  - if that location already has an apartment complex -> "<name>'s flat"
     *  - otherwise -> "<name>'s house"
     *  - ignore normal capacity limits (we just push into loc.places)
     */
    _assignHomeForNPC(id, npc) {
        const locations = [...this.world.locations.values()];
        if (!locations.length) return;

        // 1) Find candidate locations: urban / suburban
        const isUrbanish = (loc) =>
            (loc.tags || []).some((t) => t.includes(LOCATION_TAGS.urban) || t.includes(LOCATION_TAGS.suburban));

        const urbanCandidates = locations.filter(isUrbanish);
        const pool = urbanCandidates.length ? urbanCandidates : locations;

        // Random pick using game RNG
        const loc = pool[(this.rnd() * pool.length) | 0];

        // 2) Check for existing apartment complex in this location
        const places = loc.places || (loc.places = []);
        const hasApartmentComplex = places.some((p) => p.key === "apartment_complex");

        const homeDisplayName = hasApartmentComplex ? `${npc.name}'s flat` : `${npc.name}'s house`;

        // 3) Create a new Place for the NPC's home
        const homeId = `home_${id}`;

        const homePlace = new Place({
            id: homeId,
            key: hasApartmentComplex ? "npc_flat" : "npc_house",
            name: homeDisplayName,
            locationId: loc.id,
            props: {
                category: "housing",
                icon: hasApartmentComplex ? "🏢" : "🏠",
                ownerNpcId: id,
                isResidence: true,
            },
        });

        // Ignore capacity limits: just push
        places.push(homePlace);

        // 4) Wire it back to the NPC
        npc.homeLocationId = loc.id;
        npc.homePlaceId = homeId;

        // Start NPC at home by default
        if (!npc.locationId) {
            npc.locationId = loc.id;
        }
    }
}
