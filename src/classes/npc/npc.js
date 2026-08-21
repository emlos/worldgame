import {
    Relationship,
    Stat,
    Gender,
    PronounSets,
    Clothing,
    Trait,
    clamp,
    Body,
    HUMAN_BODY_TEMPLATE,
} from "../../shared/modules.js";

function cloneSerializable(value) {
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        return value.map(cloneSerializable).filter((v) => v !== undefined);
    }
    if (typeof value === "function" || typeof value !== "object") return undefined;

    const out = {};
    for (const [key, child] of Object.entries(value)) {
        const cloned = cloneSerializable(child);
        if (cloned !== undefined) out[key] = cloned;
    }
    return out;
}
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
     * @param {object|null} opts.homePreference - preferences used to generate/assign their home
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
        homePreference = null,
        scheduleTemplate = null,
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

        this.flags = {}; // arbitrary boolean flags for game logic

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
        this.homePreference = homePreference; // home assignment rules/template (may contain functions)

        // reference to the template rules
        this.scheduleTemplate = scheduleTemplate;

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

    //sets a flag to a value (default true)
    setFlag(flag, value = true) {
        this.flags[flag] = value;
    }

    //returns the value of a flag
    getFlag(flag) {
        return !!this.flags[flag];
    }

    //returns if a flag exists and is not undefined
    hasFlag(flag) {
        return this.flags[flag] !== undefined;
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

    // --- Save / load -------------------------------------------------------
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            age: this.age,
            stats: Object.fromEntries(
                Object.entries(this.stats).map(([name, stat]) => [name, stat.toJSON()])
            ),
            flags: { ...this.flags },
            gender: this.gender,
            pronouns: { ...this.pronouns },
            traits: [...this.traits.values()].map((trait) => trait.toJSON()),
            relationships: [...this.relationships.entries()].map(([otherId, rel]) => [
                otherId,
                rel.toJSON(),
            ]),
            clothing: [...this.clothing.entries()].map(([slot, item]) => [slot, item.toJSON()]),
            body: this.body?.toJSON?.() ?? null,
            locationId: this.locationId,
            currentPlaceId: this.currentPlaceId ?? null,
            homeLocationId: this.homeLocationId,
            homePlaceId: this.homePlaceId,
            homePreference: cloneSerializable(this.homePreference),
            scheduleTemplate: cloneSerializable(this.scheduleTemplate),
            meta: cloneSerializable(this.meta) || {},
        };
    }

    static fromJSON(data, { template = null, traitResolver = null } = {}) {
        if (data instanceof NPC) return data;

        // Static registry/template objects may contain functions (for example a
        // home nameFn). Saved JSON intentionally cannot contain executable code,
        // so merge saved mutable data over the matching static template.
        const homePreference = {
            ...(template?.homePreference || {}),
            ...(data?.homePreference || {}),
        };
        const scheduleTemplate = data?.scheduleTemplate
            ? {
                  ...(template?.scheduleTemplate || {}),
                  ...data.scheduleTemplate,
              }
            : template?.scheduleTemplate || null;

        const npc = new NPC({
            id: data?.id ?? template?.id ?? template?.key ?? null,
            name: data?.name ?? template?.name ?? "",
            age: data?.age ?? template?.age,
            stats: {},
            gender: data?.gender ?? template?.gender ?? Gender.NB,
            pronouns: data?.pronouns ?? template?.pronouns ?? PronounSets.THEY_THEM,
            bodyTemplate: [],
            locationId: data?.locationId ?? null,
            homeLocationId: data?.homeLocationId ?? null,
            homePlaceId: data?.homePlaceId ?? null,
            homePreference: Object.keys(homePreference).length ? homePreference : null,
            scheduleTemplate,
            meta: { ...(template?.meta || {}), ...(data?.meta || {}) },
        });

        npc.stats = {};
        for (const [name, statData] of Object.entries(data?.stats || {})) {
            npc.stats[name] = Stat.fromJSON(statData);
        }

        npc.flags = data?.flags && typeof data.flags === "object" ? { ...data.flags } : {};

        npc.traits = new Map();
        for (const traitData of data?.traits || []) {
            const trait = Trait.fromJSON(traitData, { resolver: traitResolver });
            if (trait?.id != null) npc.traits.set(trait.id, trait);
        }

        npc.relationships = new Map();
        for (const [otherId, relData] of data?.relationships || []) {
            npc.relationships.set(String(otherId), Relationship.fromJSON(relData));
        }

        npc.clothing = new Map();
        for (const [slot, itemData] of data?.clothing || []) {
            const item = Clothing.fromJSON(itemData);
            npc.clothing.set(String(slot ?? item.slot), item);
        }

        npc.body = data?.body
            ? Body.fromJSON(data.body)
            : new Body(template?.bodyTemplate || HUMAN_BODY_TEMPLATE);
        npc.currentPlaceId = data?.currentPlaceId ?? null;
        return npc;
    }
}
