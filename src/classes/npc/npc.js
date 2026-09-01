import { normalizeRelationshipProfileDefinition } from "../../shared/classes/relationship.js";
import { Stat } from "../../shared/classes/stat.js";
import { Gender, PronounSets } from "../../shared/classes/pronouns.js";
import { Clothing } from "../../shared/classes/clothing.js";
import { clamp } from "../../shared/util/util.js";
import { Body, HUMAN_BODY_TEMPLATE } from "../../shared/classes/body.js";
import { NPCBrain } from "./npcBrain.js";

function cloneSerializable(value) {
    if (
        value == null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
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

/**
 * Clone an NPC behavior definition while enforcing the save-file contract.
 * Behavior is engine data, not executable template code: functions, special
 * objects, non-finite numbers, and cycles are rejected instead of disappearing
 * silently during JSON serialization.
 */
function cloneBehaviorData(value, path = "behavior", ancestors = new WeakSet()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new TypeError(`${path} must contain finite numbers`);
        return value;
    }
    if (typeof value !== "object") {
        throw new TypeError(`${path} contains unsupported ${typeof value} data`);
    }
    if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference`);

    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map((child, index) =>
                cloneBehaviorData(child, `${path}[${index}]`, ancestors),
            );
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError(`${path} must contain only plain objects and arrays`);
        }

        const clone = {};
        for (const [key, child] of Object.entries(value)) {
            clone[key] = cloneBehaviorData(child, `${path}.${key}`, ancestors);
        }
        return clone;
    } finally {
        ancestors.delete(value);
    }
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
     * @param {object|null} opts.behavior - static goal rules interpreted by NPCBrain
     * @param {object|null} opts.relationshipProfile - player-facing named meter definitions
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
        behavior = null,
        relationshipProfile = null,
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

        // Player-facing relationship profile / clothing ----------
        this.relationshipProfile = normalizeRelationshipProfileDefinition(relationshipProfile);
        this.clothing = new Map(); // slot -> Clothing

        // Body -----------------------------------------------------
        // Body will default to HUMAN_BODY_TEMPLATE if template is null/undefined
        this.body = new Body(bodyTemplate);

        // World placement ------------------------------------------
        this.locationId = locationId; // "where are they now?"
        this.currentPlaceId = null;
        this.homeLocationId = homeLocationId; // which Location contains their home
        this.homePlaceId = homePlaceId; // Place.id of their home inside that location
        this.homePreference = homePreference; // home assignment rules/template (may contain functions)

        // Behavior is immutable save data. Clone it so registry/template edits
        // cannot rewrite a running NPC from the outside.
        this.behavior = behavior == null ? null : cloneBehaviorData(behavior);
        this.brain = this.behavior ? new NPCBrain(this, this.behavior) : null;

        // Misc metadata (tags, registry key, etc.)
        this.meta = { ...meta };
    }

    // --- Location helpers --------------------------------------
    setLocation(locationId) {
        this.locationId = locationId;
        this.currentPlaceId = null;
    }

    // If you ever track both location + which Place inside it:
    setLocationAndPlace(locationId, placeId = null) {
        this.locationId = locationId;
        this.currentPlaceId = placeId;
    }

    getStatBase(name) {
        return this.stats[name]?.base ?? 0;
    }
    getStatValue(name) {
        return (this.stats[name] || new Stat(0)).value;
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
                Object.entries(this.stats).map(([name, stat]) => [name, stat.toJSON()]),
            ),
            flags: { ...this.flags },
            gender: this.gender,
            pronouns: { ...this.pronouns },
            relationshipProfile: cloneSerializable(this.relationshipProfile),
            clothing: [...this.clothing.entries()].map(([slot, item]) => [slot, item.toJSON()]),
            body: this.body?.toJSON?.() ?? null,
            locationId: this.locationId,
            currentPlaceId: this.currentPlaceId ?? null,
            homeLocationId: this.homeLocationId,
            homePlaceId: this.homePlaceId,
            homePreference: cloneSerializable(this.homePreference),
            behavior: this.behavior == null ? null : cloneBehaviorData(this.behavior),
            brain: this.brain?.toJSON?.() ?? null,
            meta: cloneSerializable(this.meta) || {},
        };
    }

    static fromJSON(data) {
        if (data instanceof NPC) return data;
        if (!data || typeof data !== "object") {
            throw new TypeError("NPC.fromJSON expects an NPC save object");
        }
        if (!Object.prototype.hasOwnProperty.call(data, "behavior")) {
            throw new TypeError("NPC save is missing its behavior definition");
        }
        if (!data.body || typeof data.body !== "object") {
            throw new TypeError("NPC save is missing its body state");
        }

        const npc = new NPC({
            id: data.id ?? null,
            name: data.name ?? "",
            age: data.age,
            stats: {},
            gender: data.gender ?? Gender.NB,
            pronouns: data.pronouns ?? PronounSets.THEY_THEM,
            bodyTemplate: [],
            locationId: data.locationId ?? null,
            homeLocationId: data.homeLocationId ?? null,
            homePlaceId: data.homePlaceId ?? null,
            homePreference: cloneSerializable(data.homePreference) ?? null,
            behavior: data.behavior,
            relationshipProfile: data.relationshipProfile,
            meta: cloneSerializable(data.meta) || {},
        });

        npc.stats = {};
        for (const [name, statData] of Object.entries(data?.stats || {})) {
            npc.stats[name] = Stat.fromJSON(statData);
        }

        npc.flags = data?.flags && typeof data.flags === "object" ? { ...data.flags } : {};

        npc.clothing = new Map();
        for (const [slot, itemData] of data?.clothing || []) {
            const item = Clothing.fromJSON(itemData);
            npc.clothing.set(String(slot ?? item.slot), item);
        }

        npc.body = Body.fromJSON(data.body);
        npc.currentPlaceId = data?.currentPlaceId ?? null;
        if (npc.brain && data?.brain) npc.brain.restoreJSON(data.brain);
        return npc;
    }
}
