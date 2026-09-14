// body.js
// -----------------------------------------------------------------------------
// Granular body model for combat / injury / pain.
// Designed to be:
//  - More detailed than WearSlot
//  - Still mappable back to clothing slots (upper body, head, etc)
//  - Non-gorey, but expressive enough for boxing/fights/accidents.
// -----------------------------------------------------------------------------

import { clamp, deepFreeze } from "../../shared/util/util.js";
import { WearSlot } from "./clothing.js";
import { finiteNumber } from "../../shared/util/util.js";

// If you want to hard-link to WearSlot, you can import it and reuse its values.

/**
 * Higher-level regions that intentionally share names with WearSlot values
 * where possible ("upper body", "lower body", "head", etc.).
 * You can also just point these at WearSlot.HEAD, WearSlot.UPPER, etc.
 */
export const BodyRegion = Object.freeze({
    HEAD: WearSlot.HEAD, // WearSlot.HEAD
    FACE: WearSlot.FACE, // WearSlot.FACE
    NECK: WearSlot.NECK, // WearSlot.NECK
    UPPER: WearSlot.UPPER, // WearSlot.UPPER
    LOWER: WearSlot.LOWER, // WearSlot.LOWER
    HANDS: WearSlot.HANDS, // WearSlot.HANDS
    LEGS: WearSlot.LEGS, // WearSlot.LEGS
    FEET: WearSlot.FEET, // WearSlot.FEET
});

/**
 * Internal identifiers for granular body parts.
 * These are the "hit locations" you'll use in combat.
 */
export const BodyPartId = Object.freeze({
    HEAD: "head",
    FACE: "face",
    NECK: "neck",

    SHOULDER_L: "shoulder_l",
    SHOULDER_R: "shoulder_r",

    UPPER_ARM_L: "upper_arm_l",
    UPPER_ARM_R: "upper_arm_r",
    LOWER_ARM_L: "lower_arm_l",
    LOWER_ARM_R: "lower_arm_r",

    HAND_L: "hand_l",
    HAND_R: "hand_r",

    CHEST: "chest",
    BACK: "back",
    ABDOMEN: "abdomen",
    GROIN: "groin",

    THIGH_L: "thigh_l",
    THIGH_R: "thigh_r",
    KNEE_L: "knee_l",
    KNEE_R: "knee_r",
    CALF_L: "calf_l",
    CALF_R: "calf_r",
    ANKLE_L: "ankle_l",
    ANKLE_R: "ankle_r",
    FOOT_L: "foot_l",
    FOOT_R: "foot_r",
});

/**
 * The deliberately limited set of visible body-part conditions.
 * Bruised is currently the only supported condition.
 */

export const InjuryCondition = Object.freeze({
    BRUISED: "bruised",
});

/**
 * Damage categories used to distinguish blunt, sharp, and impact injuries.
 */
export const DamageType = Object.freeze({
    BLUNT: "blunt", // punches, falls
    SHARP: "sharp", // knives, shards, etc.
    IMPACT: "impact", // car crash, tackles, etc.
});

/**
 * Template describing one part of the body.
 * This is immutable and used to initialize per-instance state.
 */

export const HUMAN_BODY_TEMPLATE = deepFreeze([
    // Head / face ------------------------------------------------
    {
        id: BodyPartId.HEAD,
        displayName: "Head",
        region: BodyRegion.HEAD,
        maxHealth: 100,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.FACE,
        displayName: "Face",
        region: BodyRegion.FACE,
        maxHealth: 80,
        painMultiplier: 1.7,
    },
    {
        id: BodyPartId.NECK,
        displayName: "Neck",
        region: BodyRegion.NECK,
        maxHealth: 80,
        painMultiplier: 1.6,
    },

    // Torso ------------------------------------------------------
    {
        id: BodyPartId.CHEST,
        displayName: "Chest",
        region: BodyRegion.UPPER,
        maxHealth: 120,
        painMultiplier: 1.3,
    },
    {
        id: BodyPartId.BACK,
        displayName: "Back",
        region: BodyRegion.UPPER,
        maxHealth: 120,
        painMultiplier: 1.2,
    },
    {
        id: BodyPartId.ABDOMEN,
        displayName: "Abdomen",
        region: BodyRegion.LOWER,
        maxHealth: 100,
        painMultiplier: 1.4,
    },
    {
        id: BodyPartId.GROIN,
        displayName: "Groin",
        region: BodyRegion.LOWER,
        maxHealth: 60,
        painMultiplier: 2.0,
    },
    // Arms / hands -----------------------------------------------
    {
        id: BodyPartId.SHOULDER_L,
        displayName: "Left shoulder",
        region: BodyRegion.UPPER,
        maxHealth: 90,
        painMultiplier: 1.1,
    },
    {
        id: BodyPartId.SHOULDER_R,
        displayName: "Right shoulder",
        region: BodyRegion.UPPER,
        maxHealth: 90,
        painMultiplier: 1.1,
    },
    {
        id: BodyPartId.UPPER_ARM_L,
        displayName: "Left upper arm",
        region: BodyRegion.UPPER,
        maxHealth: 90,
        painMultiplier: 1.0,
    },
    {
        id: BodyPartId.UPPER_ARM_R,
        displayName: "Right upper arm",
        region: BodyRegion.UPPER,
        maxHealth: 90,
        painMultiplier: 1.0,
    },
    {
        id: BodyPartId.LOWER_ARM_L,
        displayName: "Left forearm",
        region: BodyRegion.UPPER,
        maxHealth: 80,
        painMultiplier: 1.1,
    },
    {
        id: BodyPartId.LOWER_ARM_R,
        displayName: "Right forearm",
        region: BodyRegion.UPPER,
        maxHealth: 80,
        painMultiplier: 1.1,
    },
    {
        id: BodyPartId.HAND_L,
        displayName: "Left hand",
        region: BodyRegion.HANDS,
        maxHealth: 70,
        painMultiplier: 1.4,
    },
    {
        id: BodyPartId.HAND_R,
        displayName: "Right hand",
        region: BodyRegion.HANDS,
        maxHealth: 70,
        painMultiplier: 1.4,
    },

    // Legs / feet ------------------------------------------------
    // Legs / feet ------------------------------------------------
    {
        id: BodyPartId.THIGH_L,
        displayName: "Left thigh",
        region: BodyRegion.LEGS,
        maxHealth: 100,
        painMultiplier: 1.2,
    },
    {
        id: BodyPartId.THIGH_R,
        displayName: "Right thigh",
        region: BodyRegion.LEGS,
        maxHealth: 100,
        painMultiplier: 1.2,
    },
    {
        id: BodyPartId.KNEE_L,
        displayName: "Left knee",
        region: BodyRegion.LEGS,
        maxHealth: 80,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.KNEE_R,
        displayName: "Right knee",
        region: BodyRegion.LEGS,
        maxHealth: 80,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.CALF_L,
        displayName: "Left calf",
        region: BodyRegion.LEGS,
        maxHealth: 90,
        painMultiplier: 1.3,
    },
    {
        id: BodyPartId.CALF_R,
        displayName: "Right calf",
        region: BodyRegion.LEGS,
        maxHealth: 90,
        painMultiplier: 1.3,
    },
    {
        id: BodyPartId.ANKLE_L,
        displayName: "Left ankle",
        region: BodyRegion.FEET,
        maxHealth: 70,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.ANKLE_R,
        displayName: "Right ankle",
        region: BodyRegion.FEET,
        maxHealth: 70,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.FOOT_L,
        displayName: "Left foot",
        region: BodyRegion.FEET,
        maxHealth: 70,
        painMultiplier: 1.3,
    },
    {
        id: BodyPartId.FOOT_R,
        displayName: "Right foot",
        region: BodyRegion.FEET,
        maxHealth: 70,
        painMultiplier: 1.3,
    },
]);

/**
 * Instance state for one body part.
 *
 * health:    0..maxHealth
 * pain:      0..100 (abstract pain meter for that part)
 * conditions:Set(InjuryCondition.*)
 */
export class BodyPartState {
    constructor(template) {
        this.id = template.id;
        this.displayName = template.displayName;
        this.region = template.region;
        this.maxHealth = template.maxHealth;
        this.health = template.maxHealth;
        this.painMultiplier = template.painMultiplier ?? 1;

        this.pain = 0; // local pain
        this.conditions = new Set();
    }

    get isBruised() {
        return this.conditions.has(InjuryCondition.BRUISED);
    }

    /**
     * Useful for "is this part basically okay?" checks.
     */
    get integrityRatio() {
        return this.health / this.maxHealth;
    }

    toJSON() {
        return {
            id: this.id,
            displayName: this.displayName,
            region: this.region,
            maxHealth: this.maxHealth,
            health: this.health,
            painMultiplier: this.painMultiplier,
            pain: this.pain,
            conditions: [...this.conditions],
        };
    }

    static fromJSON(data) {
        if (data instanceof BodyPartState) return data;

        const part = new BodyPartState({
            id: data?.id,
            displayName: data?.displayName,
            region: data?.region,
            maxHealth: Number(data?.maxHealth) || 0,
            painMultiplier: Number.isFinite(Number(data?.painMultiplier))
                ? Number(data.painMultiplier)
                : 1,
        });
        part.health = clamp(Number(data?.health), 0, part.maxHealth);
        part.pain = clamp(Number(data?.pain) || 0, 0, 100);
        const conditions = Array.isArray(data?.conditions) ? data.conditions.map(String) : [];
        if (conditions.some((condition) => condition !== InjuryCondition.BRUISED)) {
            throw new TypeError("Body part conditions support only 'bruised'");
        }
        part.conditions = new Set(conditions);
        return part;
    }
}

/**
 * Body: collection of BodyPartState with helpers to apply damage, heal,
 * and query overall pain / injury.
 */
export class Body {
    constructor(template = HUMAN_BODY_TEMPLATE) {
        this.parts = new Map(); // id -> BodyPartState

        for (const def of template) {
            const part = new BodyPartState(def);
            this.parts.set(part.id, part);
        }
    }

    toJSON() {
        return {
            parts: [...this.parts.values()].map((part) => part.toJSON()),
        };
    }

    static fromJSON(data) {
        if (data instanceof Body) return data;

        const body = new Body([]);
        for (const partData of data?.parts || []) {
            const part = BodyPartState.fromJSON(partData);
            if (part?.id != null) body.parts.set(part.id, part);
        }
        return body;
    }

    // --- Access helpers --------------------------------------------------------

    getPart(partId) {
        return this.parts.get(partId) || null;
    }

    /**
     * Convenience: iterate all parts.
     */
    *allParts() {
        for (const part of this.parts.values()) yield part;
    }

    /**
     * Return all parts that belong to a wear-region (upper body, legs, etc).
     * This is the bridge to clothing slots.
     */
    getPartsByRegion(region) {
        const list = [];
        for (const p of this.parts.values()) {
            if (p.region === region) list.push(p);
        }
        return list;
    }

    /** Combined current health across every body part. */
    getTotalHealth() {
        let total = 0;
        for (const part of this.allParts()) total += part.health;
        return total;
    }

    /** Combined maximum health across every body part. */
    getMaximumHealth() {
        let total = 0;
        for (const part of this.allParts()) total += part.maxHealth;
        return total;
    }

    /** Overall health as the pooled body-part percentage, from 0 through 100. */
    getHealthPercentage() {
        const maximum = this.getMaximumHealth();
        return maximum > 0 ? clamp((this.getTotalHealth() / maximum) * 100, 0, 100) : 0;
    }

    // --- Damage / healing ------------------------------------------------------

    /**
     * Apply damage to a specific body part.
     * - amount: numeric damage
     * - partId: BodyPartId.*
     * - damageType: DamageType.*
     */
    applyDamage({ partId, amount, damageType = DamageType.BLUNT }) {
        amount = finiteNumber(amount, "Damage");
        const part = this.getPart(partId);
        if (!part || amount <= 0) return null;

        // Reduce health
        part.health = clamp(part.health - amount, 0, part.maxHealth);

        // Update conditions based on remaining health ratio
        this._updateConditionsFromHealth(part);

        // Pain is proportional to damage and part sensitivity
        const painDelta = amount * part.painMultiplier;
        part.pain = clamp(part.pain + painDelta, 0, 100);

        return part;
    }

    /**
     * Variant of applyDamage that uses randomness to decide whether the impact
     * leaves a visible bruise.
     *
     * - rnd: function that returns a float in [0, 1), normally a seeded game RNG such as game.rnd.
     */
    applyDamageRandomized({ partId, amount, damageType = DamageType.BLUNT, rnd }) {
        amount = finiteNumber(amount, "Randomized damage");
        if (typeof rnd !== "function") {
            throw new Error("applyDamageRandomized expects an rnd() function");
        }
        const part = this.getPart(partId);
        if (!part || amount <= 0) return null;

        part.health = clamp(part.health - amount, 0, part.maxHealth);

        const painDelta = amount * part.painMultiplier;
        part.pain = clamp(part.pain + painDelta, 0, 100);

        this._applyRandomBruise(part, amount, damageType, rnd);

        return part;
    }

    /**
     * Heal a part by a certain amount (not removing all conditions by default).
     */
    healPart(partId, amount) {
        amount = finiteNumber(amount, "Healing");
        const part = this.getPart(partId);
        if (!part || amount <= 0) return null;

        part.health = clamp(part.health + amount, 0, part.maxHealth);

        // If health comes back up, you might want to auto-downgrade conditions.
        this._downgradeConditionsFromHealth(part);

        // Pain eases as well
        part.pain = clamp(part.pain - amount * 0.5, 0, 100);

        return part;
    }

    /**
     * Hard reset: fully heal the body.
     */
    fullyHeal() {
        for (const part of this.allParts()) {
            part.health = part.maxHealth;
            part.pain = 0;
            part.conditions.clear();
        }
    }

    // --- Pain / status queries -------------------------------------------------

    /**
     * Whole-body pain load from local pain values.
     *
     * The worst injury supplies the baseline while additional injuries add a
     * smaller cumulative burden. This keeps one serious injury legible without
     * letting a handful of modest bruises immediately saturate the meter.
     */
    getTotalPain() {
        return clamp(this._getRawPainLoad(), 0, 100);
    }

    _getRawPainLoad() {
        const pains = [...this.allParts()]
            .map((part) => clamp(Number(part.pain) || 0, 0, 100))
            .sort((left, right) => right - left);
        if (!pains.length) return 0;
        const [worst, ...additional] = pains;
        return worst + additional.reduce((sum, pain) => sum + pain * 0.3, 0);
    }

    /**
     * Ease a whole-body amount of pain while preserving where that pain came
     * from. Bruise integrity recovers by the same proportion, making combat
     * impairment temporary without a separate treatment system.
     */
    relievePain(amount) {
        amount = finiteNumber(amount, "Pain relief");
        if (amount <= 0) return this.getTotalPain();
        const raw = this._getRawPainLoad();
        const visible = clamp(raw, 0, 100);
        if (visible <= 0) return 0;
        const target = Math.max(0, visible - amount);
        const scale = target / raw;
        for (const part of this.allParts()) {
            part.pain = clamp(part.pain * scale, 0, 100);
            const missingHealth = part.maxHealth - part.health;
            part.health = clamp(part.health + missingHealth * (1 - scale), 0, part.maxHealth);
            this._downgradeConditionsFromHealth(part);
        }
        return this.getTotalPain();
    }

    /**
     * Simple qualitative label from total pain.
     * You can use this directly in narrative text.
     */
    getPainLabel() {
        const pain = this.getTotalPain();
        if (pain === 0) return "fine";
        if (pain < 25) return "sore";
        if (pain < 50) return "hurting";
        if (pain < 75) return "badly hurt";
        return "in severe pain";
    }

    /**
     * Rough combat-usable metric:
     * 0 = fine, 1 = minor penalty, 2 = major, 3 = near incapacitated.
     */
    getPainStage() {
        const pain = this.getTotalPain();
        if (pain < 20) return 0;
        if (pain < 45) return 1;
        if (pain < 75) return 2;
        return 3;
    }

    /**
     * Example helper you could plug into stat calculations:
     * Returns a multiplier for physical performance based on pain.
     * 1.0 = unaffected, 0.5 = at half strength, etc.
     */
    getPhysicalPerformanceMultiplier() {
        return clamp(1 - this.getTotalPain() * 0.005, 0.5, 1);
    }

    // --- Internal helpers ------------------------------------------------------

    _updateConditionsFromHealth(part) {
        const ratio = part.integrityRatio;
        if (ratio < 1) part.conditions.add(InjuryCondition.BRUISED);
    }

    _downgradeConditionsFromHealth(part) {
        const ratio = part.integrityRatio;

        if (ratio >= 0.9) {
            part.conditions.delete(InjuryCondition.BRUISED);
        }
    }

    /**
     * Internal helper: uses damage amount, type, and current integrity plus
     * rnd() to decide whether to apply the only supported condition: bruised.
     */
    _applyRandomBruise(part, amount, damageType, rnd) {
        const ratio = part.integrityRatio; // 0..1 (remaining)
        const fracOfMax = clamp(amount / part.maxHealth, 0, 1); // 0..1 (how big this hit was)

        // Damage-type multiplier: tweak to taste
        let typeFactor = 1;
        if (damageType === DamageType.IMPACT) typeFactor = 1.2;
        else if (damageType === DamageType.SHARP) typeFactor = 1.1;

        const bruiseChance = clamp(fracOfMax * 1.5 * typeFactor + (1 - ratio) * 0.5, 0, 1);
        if (rnd() < bruiseChance || ratio < 0.7) {
            part.conditions.add(InjuryCondition.BRUISED);
        }
    }
}
