import {
    Relationship,
    Stat,
    Gender,
    PronounSets,
    Clothing,
    clamp,
    Body,
    HUMAN_BODY_TEMPLATE,
} from "../../shared/modules.js";

import { Place } from "../world/module.js";
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
     * @param {Array<object>} [opts.bodyTemplate] body template, defaults to HUMAN_BODY_TEMPLATE
     * @param {string|null} [opts.locationId] current location id in world map
     * @param {string|null} [opts.homePlaceId] place id for this NPC’s home
     */
    constructor({
        name,
        age,
        stats = {},
        gender = Gender.NB,
        pronouns = PronounSets.THEY_THEM,
        bodyTemplate = HUMAN_BODY_TEMPLATE,
        locationId = null,
        homePlaceId = null,
    } = {}) {
        this.name = String(name || "");
        this.age = Number(age) || 0;

        // Stats are immutable for NPCs (no training/tan/etc.)
        this.stats = {};
        for (const [k, v] of Object.entries(stats)) {
            const s = new Stat(Number(v) || 0);
            Object.freeze(s);
            this.stats[k] = s;
        }
        Object.freeze(this.stats);

        // Identity
        this.gender = gender;
        this.pronouns = { ...pronouns };

        // Body (instance, based on template)
        this.body = new Body({ template: bodyTemplate });

        // Location & home
        this.locationId = locationId; // Location.id in the world
        this.homePlaceId = homePlaceId; // Place.id of this NPC’s home

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
        this.relationships.set(
            String(npcId),
            new Relationship({ npcId, met, score })
        );
    }
    getRelationship(npcId) {
        return (
            this.relationships.get(String(npcId)) || new Relationship({ npcId })
        );
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
        if (!(item instanceof Clothing))
            throw new Error("equip expects Clothing");
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

    // --- Location / movement ---

    /**
     * Set current location by id (e.g. world.locations[i].id)
     */
    setLocation(locationId) {
        this.locationId = locationId == null ? null : String(locationId);
    }

    /**
     * Set / override home place id (world Place.id)
     */
    setHome(placeId) {
        this.homePlaceId = placeId == null ? null : String(placeId);
    }

    /**
     * Assigns a home to an NPC in the given world.
     * - Picks a random urban / suburban location.
     * - Creates a Place for their home.
     * - Names it "<name>'s flat" if there is an apartment_complex in that location.
     *   Otherwise "<name>'s house".
     *
     * @param {World} world
     * @returns {Place} the created home place
     */

    assignHome(world) {
        const rnd = world.rnd;

        const locations = world.locations || [];
        if (!locations.length) throw new Error("World has no locations");

        // Prefer urban / suburban
        const urbanish = locations.filter((loc) =>
            (loc.tags || []).some((t) => t === "urban" || t === "suburban")
        );
        const pool = urbanish.length ? urbanish : locations;

        const location = pick(pool, rnd);

        const hasApartmentComplex = (location.places || []).some(
            (p) => p.key === "apartment_complex"
        );

        const placeName = hasApartmentComplex
            ? `${this.name}'s flat`
            : `${this.name}'s house`;

        const placeId = `home_${location.id}_${Math.floor(rnd() * 1e9)}`;

        const homePlace = new Place({
            id: placeId,
            key: "npc_home",
            name: placeName,
            locationId: location.id,
            props: {
                icon: hasApartmentComplex ? "🏢" : "🏠",
                category: "housing",
                isNpcHome: true,
                ownerName: this.name,
                // if you later have npc.id or similar, stick it here
                // ownerId: npc.id,
            },
        });

        location.places.push(homePlace);

        this.setHome(homePlace.id);
        if (!this.locationId) {
            this.setLocation(location.id);
        }

        return homePlace;
    }
}
