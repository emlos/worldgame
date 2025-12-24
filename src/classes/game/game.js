// worldgame/src/game/game.js
import { World, Player, NPC } from "../classes.js";
import { makeRNG } from "../../shared/modules.js";
import { PLACE_TAGS } from "../../data/data.js";
import { NPCScheduler } from "./util/npcai.js";

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

        this.scheduleManager = new NPCScheduler({
            world: this.world,
            rnd: this.rnd,
        });

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

    // NPC scheduling

    getCurrentWeekScheduleForNPC(npc) {
        const weekStart = this.scheduleManager._weekStartForDate(this.world.time.date);
        return this.scheduleManager.getWeekSchedule(npc, weekStart);
    }

    peekNPCIntent(npc, nextMinutes) {
        return this.scheduleManager.peek(npc, nextMinutes, this.world.time.date);
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
            // (legacy) preferLocationsWith -> homePreference.withPlaceCategory
            if (!npc.homePreference && def && Array.isArray(def.preferLocationsWith)) {
                npc.homePreference = { withPlaceCategory: def.preferLocationsWith };
            }
            this._assignHomeForNPC(id, npc);

            this.npcs.set(id, npc);
        }
    }

    /**
     * Assign a unique home Location + create a unique home Place for an NPC
     * based on npc.homePreference.
     *
     * homePreference supports selecting ONE strategy at random from:
     *  - withKey: pick random location that already contains any Place.key in the list
     *  - withPlaceCategory: pick location with the most places whose props.category matches any tag
     *  - withLocationCategory: pick location with the most location.tags matches
     *
     * nameFn(chosenLocation) is used to name the created home Place.
     */
    _assignHomeForNPC(id, npc) {
        const pref = npc?.homePreference;
        if (!pref) {
            throw new Error(`NPC '${id}' has no homePreference`);
        }

        const strategies = [];
        if (Array.isArray(pref.withKey) && pref.withKey.length) {
            strategies.push({ kind: "withKey", values: pref.withKey });
        }
        if (Array.isArray(pref.withPlaceCategory) && pref.withPlaceCategory.length) {
            strategies.push({ kind: "withPlaceCategory", values: pref.withPlaceCategory });
        }
        if (Array.isArray(pref.withLocationCategory) && pref.withLocationCategory.length) {
            strategies.push({ kind: "withLocationCategory", values: pref.withLocationCategory });
        }

        if (!strategies.length) {
            throw new Error(
                `homePreference for NPC '${id}' must include at least one of withKey, withPlaceCategory, withLocationCategory`
            );
        }

        const pick = strategies[(this.rnd() * strategies.length) | 0];
        const allLocations = [...this.world.locations.values()];
        if (!allLocations.length) throw new Error("World has no locations");

        const pickRandom = (arr) => arr[(this.rnd() * arr.length) | 0];

        const placeHasAnyCategory = (place, wantedSet) => {
            const cat = place?.props?.category;
            if (!cat) return false;
            const cats = Array.isArray(cat) ? cat : [cat];
            for (const c of cats) if (wantedSet.has(c)) return true;
            return false;
        };

        let chosenLocation = null;

        if (pick.kind === "withKey") {
            const wantedKeys = new Set(pick.values.map(String));
            const candidates = allLocations.filter((loc) =>
                (loc.places || []).some((p) => wantedKeys.has(String(p.key)))
            );
            if (!candidates.length) {
                throw new Error(`No location contains any place with key in [${[...wantedKeys].join(", ")}]`);
            }
            chosenLocation = pickRandom(candidates);
        }

        if (pick.kind === "withPlaceCategory") {
            const wanted = new Set(pick.values);
            let bestScore = -1;
            let best = [];

            for (const loc of allLocations) {
                let score = 0;
                for (const pl of loc.places || []) {
                    if (placeHasAnyCategory(pl, wanted)) score++;
                }

                if (score > bestScore) {
                    bestScore = score;
                    best = [loc];
                } else if (score === bestScore) {
                    best.push(loc);
                }
            }

            if (bestScore <= 0) {
                throw new Error(
                    `No location has any places with category in [${[...wanted].join(", ")}]`
                );
            }
            chosenLocation = pickRandom(best);
        }

        if (pick.kind === "withLocationCategory") {
            const wanted = new Set(pick.values);
            let bestScore = -1;
            let best = [];

            for (const loc of allLocations) {
                const tags = Array.isArray(loc.tags) ? loc.tags : [];
                let score = 0;
                for (const t of tags) if (wanted.has(t)) score++;

                if (score > bestScore) {
                    bestScore = score;
                    best = [loc];
                } else if (score === bestScore) {
                    best.push(loc);
                }
            }

            if (bestScore <= 0) {
                throw new Error(
                    `No location has any tags in [${[...wanted].join(", ")}]`
                );
            }
            chosenLocation = pickRandom(best);
        }

        if (!chosenLocation) {
            throw new Error(`Failed to choose a home location for NPC '${id}'`);
        }

        // Create a unique home Place at the chosen location
        const homeId = `home_${id}`;
        const displayName =
            typeof pref.nameFn === "function" ? pref.nameFn(chosenLocation) : `${npc.name}'s home`;

        const homePlace = this.world.createPlaceAt(
            {
                id: homeId,
                key: homeId,
                name: displayName,
                props: {
                    category: [PLACE_TAGS.housing],
                    ownerNpcId: id,
                    isResidence: true,
                    discovered: false,
                    icon: "🏠",
                },
            },
            chosenLocation.id
        );

        npc.homeLocationId = String(chosenLocation.id);
        npc.homePlaceId = homePlace ? homePlace.id : homeId;

        // Start NPC at home by default
        if (!npc.locationId) {
            npc.locationId = String(chosenLocation.id);
        }
    }
}
