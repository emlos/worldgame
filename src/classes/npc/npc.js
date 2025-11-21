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
// --------------------------
// NPC
// --------------------------
export class NPC {
    /**
     * @param {object} opts
     * @param {string} opts.id         - world-unique id (fallback: name)
     * @param {string} opts.name
     * @param {number} opts.age
     * @param {object} opts.stats
     * @param {'m'|'f'|'nb'} opts.gender
     * @param {object} opts.pronouns
     * @param {Array}  opts.bodyTemplate - optional Body template (defaults to HUMAN_BODY_TEMPLATE)
     * @param {string|null} opts.locationId - current world Location id
     * @param {string|null} opts.homeLocationId - where their home is
     * @param {string|null} opts.homePlaceId    - Place.id of their home
     * @param {object} opts.meta - arbitrary metadata (tags, registry key, etc)
     */
    constructor({
        id = null,
        name,
        age,
        stats = {},
        gender = Gender.NB,
        pronouns = PronounSets.THEY_THEM,
        bodyTemplate = HUMAN_BODY_TEMPLATE,
        locationId = null,
        homeLocationId = null,
        homePlaceId = null,
        meta = {},
    } = {}) {
        this.id = id || String(name || "");
        this.name = String(name || "");
        this.age = Number.isFinite(age) ? age : null;

        // Stats ----------------------------------------------------
        this.stats = {};
        for (const [k, v] of Object.entries(stats)) {
            this.stats[k] = new Stat(Number(v) || 0);
        }

        // Identity -------------------------------------------------
        this.gender = gender;
        this.pronouns = { ...pronouns };

        // Traits / relationships / clothing -----------------------
        this.traits = new Map(); // id -> Trait
        this.relationships = new Map(); // npcId -> Relationship (other NPCs OR player if you want)
        this.clothing = new Map(); // slot -> Clothing

        // Body -----------------------------------------------------
        // Body will default to HUMAN_BODY_TEMPLATE if template is null/undefined
        this.body = new Body(bodyTemplate);

        // World placement ------------------------------------------
        this.locationId = locationId; // "where are they now?"
        this.homeLocationId = homeLocationId; // which Location contains their home
        this.homePlaceId = homePlaceId; // Place.id of their home inside that location

        // Misc metadata (tags, registry key, etc.)
        this.meta = { ...meta };
    }

    // --- Location helpers --------------------------------------
    setLocation(locationId) {
        this.locationId = locationId;
    }

    // If you ever track both location + which Place inside it:
    setLocationAndPlace(locationId, placeId = null) {
        this.locationId = locationId;
        this.currentPlaceId = placeId;
    }

    // --- Relationship helpers (NPC <-> NPC) --------------------
    getRelationship(otherId) {
        return this.relationships.get(String(otherId)) || null;
    }

    ensureRelationship(otherId) {
        const key = String(otherId);
        let rel = this.relationships.get(key);
        if (!rel) {
            rel = new Relationship({ npcId: key });
            this.relationships.set(key, rel);
        }
        return rel;
    }

    setRelationshipScore(otherId, score) {
        const rel = this.ensureRelationship(otherId);
        rel.score = clamp(score, -1, 1);
        return rel;
    }

    getStatBase(name) {
        return this.stats[name]?.base ?? 0;
    }
    getStatValue(name) {
        const base = this.getStatBase(name);
        const temp = new Stat(base);
        for (const trait of this.traits.values()) {
            if (!trait.has(this)) continue;
            const mods = trait.statMods?.[name];
            if (mods?.add) mods.add.forEach((v) => temp.addFlat(v));
            if (mods?.mult) mods.mult.forEach((m) => temp.addMult(m));
        }
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
