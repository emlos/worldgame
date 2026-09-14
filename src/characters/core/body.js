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

export const BodyCondition = Object.freeze({
    FINE: "fine",
    HURT: "hurt",
    INJURED: "injured",
    BADLY_INJURED: "badly-injured",
    CRITICAL: "critical",
    INCAPACITATED: "incapacitated",
});

export const BODY_CONDITION_LABEL = Object.freeze({
    [BodyCondition.FINE]: "Fine",
    [BodyCondition.HURT]: "Hurt",
    [BodyCondition.INJURED]: "Injured",
    [BodyCondition.BADLY_INJURED]: "Badly injured",
    [BodyCondition.CRITICAL]: "Critical",
    [BodyCondition.INCAPACITATED]: "Incapacitated",
});

const INJURY_PAIN_FLOOR_FACTOR = 35;
const VITAL_INCAPACITATION_RATIO = Object.freeze({
    [BodyPartId.HEAD]: 0.08,
    [BodyPartId.CHEST]: 0.06,
});

export const BODY_PART_CHAINS = deepFreeze({
    [BodyPartId.HAND_L]: [
        BodyPartId.HAND_L,
        BodyPartId.LOWER_ARM_L,
        BodyPartId.UPPER_ARM_L,
        BodyPartId.SHOULDER_L,
    ],
    [BodyPartId.HAND_R]: [
        BodyPartId.HAND_R,
        BodyPartId.LOWER_ARM_R,
        BodyPartId.UPPER_ARM_R,
        BodyPartId.SHOULDER_R,
    ],
    [BodyPartId.LOWER_ARM_L]: [
        BodyPartId.LOWER_ARM_L,
        BodyPartId.UPPER_ARM_L,
        BodyPartId.SHOULDER_L,
    ],
    [BodyPartId.LOWER_ARM_R]: [
        BodyPartId.LOWER_ARM_R,
        BodyPartId.UPPER_ARM_R,
        BodyPartId.SHOULDER_R,
    ],
    [BodyPartId.UPPER_ARM_L]: [BodyPartId.UPPER_ARM_L, BodyPartId.SHOULDER_L],
    [BodyPartId.UPPER_ARM_R]: [BodyPartId.UPPER_ARM_R, BodyPartId.SHOULDER_R],
    [BodyPartId.FOOT_L]: [
        BodyPartId.FOOT_L,
        BodyPartId.ANKLE_L,
        BodyPartId.CALF_L,
        BodyPartId.KNEE_L,
        BodyPartId.THIGH_L,
    ],
    [BodyPartId.FOOT_R]: [
        BodyPartId.FOOT_R,
        BodyPartId.ANKLE_R,
        BodyPartId.CALF_R,
        BodyPartId.KNEE_R,
        BodyPartId.THIGH_R,
    ],
    [BodyPartId.KNEE_L]: [BodyPartId.KNEE_L, BodyPartId.THIGH_L],
    [BodyPartId.KNEE_R]: [BodyPartId.KNEE_R, BodyPartId.THIGH_R],
    [BodyPartId.HEAD]: [BodyPartId.HEAD, BodyPartId.NECK],
});

export function getBodyPartChain(partId) {
    return BODY_PART_CHAINS[partId] || [partId];
}

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
        maxIntegrity: 100,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.FACE,
        displayName: "Face",
        region: BodyRegion.FACE,
        maxIntegrity: 80,
        painMultiplier: 1.7,
    },
    {
        id: BodyPartId.NECK,
        displayName: "Neck",
        region: BodyRegion.NECK,
        maxIntegrity: 80,
        painMultiplier: 1.6,
    },

    // Torso ------------------------------------------------------
    {
        id: BodyPartId.CHEST,
        displayName: "Chest",
        region: BodyRegion.UPPER,
        maxIntegrity: 120,
        painMultiplier: 1.3,
    },
    {
        id: BodyPartId.BACK,
        displayName: "Back",
        region: BodyRegion.UPPER,
        maxIntegrity: 120,
        painMultiplier: 1.2,
    },
    {
        id: BodyPartId.ABDOMEN,
        displayName: "Abdomen",
        region: BodyRegion.LOWER,
        maxIntegrity: 100,
        painMultiplier: 1.4,
    },
    {
        id: BodyPartId.GROIN,
        displayName: "Groin",
        region: BodyRegion.LOWER,
        maxIntegrity: 60,
        painMultiplier: 2.0,
    },
    // Arms / hands -----------------------------------------------
    {
        id: BodyPartId.SHOULDER_L,
        displayName: "Left shoulder",
        region: BodyRegion.UPPER,
        maxIntegrity: 90,
        painMultiplier: 1.1,
    },
    {
        id: BodyPartId.SHOULDER_R,
        displayName: "Right shoulder",
        region: BodyRegion.UPPER,
        maxIntegrity: 90,
        painMultiplier: 1.1,
    },
    {
        id: BodyPartId.UPPER_ARM_L,
        displayName: "Left upper arm",
        region: BodyRegion.UPPER,
        maxIntegrity: 90,
        painMultiplier: 1.0,
    },
    {
        id: BodyPartId.UPPER_ARM_R,
        displayName: "Right upper arm",
        region: BodyRegion.UPPER,
        maxIntegrity: 90,
        painMultiplier: 1.0,
    },
    {
        id: BodyPartId.LOWER_ARM_L,
        displayName: "Left forearm",
        region: BodyRegion.UPPER,
        maxIntegrity: 80,
        painMultiplier: 1.1,
    },
    {
        id: BodyPartId.LOWER_ARM_R,
        displayName: "Right forearm",
        region: BodyRegion.UPPER,
        maxIntegrity: 80,
        painMultiplier: 1.1,
    },
    {
        id: BodyPartId.HAND_L,
        displayName: "Left hand",
        region: BodyRegion.HANDS,
        maxIntegrity: 70,
        painMultiplier: 1.4,
    },
    {
        id: BodyPartId.HAND_R,
        displayName: "Right hand",
        region: BodyRegion.HANDS,
        maxIntegrity: 70,
        painMultiplier: 1.4,
    },

    // Legs / feet ------------------------------------------------
    // Legs / feet ------------------------------------------------
    {
        id: BodyPartId.THIGH_L,
        displayName: "Left thigh",
        region: BodyRegion.LEGS,
        maxIntegrity: 100,
        painMultiplier: 1.2,
    },
    {
        id: BodyPartId.THIGH_R,
        displayName: "Right thigh",
        region: BodyRegion.LEGS,
        maxIntegrity: 100,
        painMultiplier: 1.2,
    },
    {
        id: BodyPartId.KNEE_L,
        displayName: "Left knee",
        region: BodyRegion.LEGS,
        maxIntegrity: 80,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.KNEE_R,
        displayName: "Right knee",
        region: BodyRegion.LEGS,
        maxIntegrity: 80,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.CALF_L,
        displayName: "Left calf",
        region: BodyRegion.LEGS,
        maxIntegrity: 90,
        painMultiplier: 1.3,
    },
    {
        id: BodyPartId.CALF_R,
        displayName: "Right calf",
        region: BodyRegion.LEGS,
        maxIntegrity: 90,
        painMultiplier: 1.3,
    },
    {
        id: BodyPartId.ANKLE_L,
        displayName: "Left ankle",
        region: BodyRegion.FEET,
        maxIntegrity: 70,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.ANKLE_R,
        displayName: "Right ankle",
        region: BodyRegion.FEET,
        maxIntegrity: 70,
        painMultiplier: 1.5,
    },
    {
        id: BodyPartId.FOOT_L,
        displayName: "Left foot",
        region: BodyRegion.FEET,
        maxIntegrity: 70,
        painMultiplier: 1.3,
    },
    {
        id: BodyPartId.FOOT_R,
        displayName: "Right foot",
        region: BodyRegion.FEET,
        maxIntegrity: 70,
        painMultiplier: 1.3,
    },
]);

/**
 * Instance state for one body part.
 *
 * integrity: 0..maxIntegrity
 * acutePain: 0..100 (short-lived pain above the persistent injury floor)
 * conditions:Set(InjuryCondition.*)
 */
export class BodyPartState {
    constructor(template) {
        this.id = template.id;
        this.displayName = template.displayName;
        this.region = template.region;
        this.maxIntegrity = template.maxIntegrity;
        this.integrity = template.maxIntegrity;
        this.painMultiplier = template.painMultiplier ?? 1;

        this.acutePain = 0;
        this.healingDelayMinutes = 0;
        this.conditions = new Set();
    }

    get isBruised() {
        return this.conditions.has(InjuryCondition.BRUISED);
    }

    /**
     * Useful for "is this part basically okay?" checks.
     */
    get integrityRatio() {
        return this.integrity / this.maxIntegrity;
    }

    get injuryPainFloor() {
        const damageRatio = clamp(1 - this.integrityRatio, 0, 1);
        return clamp(
            INJURY_PAIN_FLOOR_FACTOR * Math.pow(damageRatio, 1.5) * this.painMultiplier,
            0,
            100,
        );
    }

    get pain() {
        return clamp(this.injuryPainFloor + this.acutePain, 0, 100);
    }

    toJSON() {
        return {
            id: this.id,
            displayName: this.displayName,
            region: this.region,
            maxIntegrity: this.maxIntegrity,
            integrity: this.integrity,
            painMultiplier: this.painMultiplier,
            acutePain: this.acutePain,
            healingDelayMinutes: this.healingDelayMinutes,
            conditions: [...this.conditions],
        };
    }

    static fromJSON(data) {
        if (data instanceof BodyPartState) return data;

        const part = new BodyPartState({
            id: data?.id,
            displayName: data?.displayName,
            region: data?.region,
            maxIntegrity: Number(data?.maxIntegrity) || 0,
            painMultiplier: Number.isFinite(Number(data?.painMultiplier))
                ? Number(data.painMultiplier)
                : 1,
        });
        part.integrity = clamp(Number(data?.integrity), 0, part.maxIntegrity);
        part.acutePain = clamp(Number(data?.acutePain) || 0, 0, 100);
        part.healingDelayMinutes = Math.max(0, Number(data?.healingDelayMinutes) || 0);
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

    getStructuralPartCapacity(partId) {
        let capacity = 1;
        for (const id of getBodyPartChain(partId)) {
            const part = this.getPart(id);
            if (!part || part.integrity <= 0) return 0;
            const bruiseMultiplier = part.isBruised ? 0.94 : 1;
            capacity = Math.min(capacity, part.integrityRatio * bruiseMultiplier);
        }
        return clamp(capacity, 0, 1);
    }

    getPartCapacity(partId) {
        let capacity = 1;
        for (const id of getBodyPartChain(partId)) {
            const part = this.getPart(id);
            if (!part || part.integrity <= 0) return 0;
            const bruiseMultiplier = part.isBruised ? 0.94 : 1;
            const painMultiplier = Math.max(0.65, 1 - part.pain * 0.0035);
            capacity = Math.min(
                capacity,
                part.integrityRatio * bruiseMultiplier * painMultiplier,
            );
        }
        return clamp(capacity, 0, 1);
    }

    isStructurallyIncapacitated() {
        for (const [partId, threshold] of Object.entries(VITAL_INCAPACITATION_RATIO)) {
            if (this.getStructuralPartCapacity(partId) <= threshold) return true;
        }
        const bestArm = Math.max(
            this.getStructuralPartCapacity(BodyPartId.HAND_L),
            this.getStructuralPartCapacity(BodyPartId.HAND_R),
        );
        const bestLeg = Math.max(
            this.getStructuralPartCapacity(BodyPartId.FOOT_L),
            this.getStructuralPartCapacity(BodyPartId.FOOT_R),
        );
        return bestArm <= 0.15 && bestLeg <= 0.15;
    }

    getConditionScore() {
        if (this.isStructurallyIncapacitated()) return 0;
        const parts = [...this.allParts()];
        if (!parts.length) return 0;
        const damageRatio = (partId) => clamp(
            1 - Math.min(
                ...getBodyPartChain(partId).map(
                    (id) => this.getPart(id)?.integrityRatio ?? 0,
                ),
            ),
            0,
            1,
        );
        const vitalSeverity = Math.max(
            damageRatio(BodyPartId.HEAD) / (1 - VITAL_INCAPACITATION_RATIO[BodyPartId.HEAD]),
            damageRatio(BodyPartId.CHEST) / (1 - VITAL_INCAPACITATION_RATIO[BodyPartId.CHEST]),
        );
        const worstPartSeverity = Math.max(
            ...parts.map((part) => 1 - part.integrityRatio),
        ) * 0.65;
        const maximumIntegrity = parts.reduce((sum, part) => sum + part.maxIntegrity, 0);
        const missingIntegrity = parts.reduce(
            (sum, part) => sum + part.maxIntegrity - part.integrity,
            0,
        );
        const burdenSeverity = maximumIntegrity > 0
            ? (missingIntegrity / maximumIntegrity) * 2
            : 1;
        const severity = clamp(
            Math.max(vitalSeverity, worstPartSeverity, burdenSeverity),
            0,
            1,
        );
        return Math.round((100 * (1 - severity)) * 100) / 100;
    }

    getCondition() {
        if (this.isStructurallyIncapacitated()) return BodyCondition.INCAPACITATED;
        const score = this.getConditionScore();
        if (score >= 90) return BodyCondition.FINE;
        if (score >= 70) return BodyCondition.HURT;
        if (score >= 45) return BodyCondition.INJURED;
        if (score >= 20) return BodyCondition.BADLY_INJURED;
        return BodyCondition.CRITICAL;
    }

    getConditionLabel() {
        return BODY_CONDITION_LABEL[this.getCondition()];
    }

    // --- Damage / healing ------------------------------------------------------

    /**
     * Apply damage to a specific body part.
     * - integrityDamage: structural damage
     * - painDamage: optional total pain increase; defaults from sensitivity
     * - partId: BodyPartId.*
     * - damageType: DamageType.*
     */
    applyDamage({ partId, integrityDamage, painDamage = null, damageType = DamageType.BLUNT }) {
        integrityDamage = finiteNumber(integrityDamage, "Integrity damage");
        const part = this.getPart(partId);
        if (!part || integrityDamage <= 0) return null;

        const previousFloor = part.injuryPainFloor;
        part.integrity = clamp(part.integrity - integrityDamage, 0, part.maxIntegrity);
        part.healingDelayMinutes = Math.max(part.healingDelayMinutes, 360);

        this._updateConditionsFromIntegrity(part);

        const totalPainDamage = painDamage == null
            ? integrityDamage * part.painMultiplier
            : finiteNumber(painDamage, "Pain damage");
        const floorIncrease = Math.max(0, part.injuryPainFloor - previousFloor);
        part.acutePain = clamp(
            part.acutePain + Math.max(0, totalPainDamage - floorIncrease),
            0,
            100,
        );

        return part;
    }

    /**
     * Variant of applyDamage that uses randomness to decide whether the impact
     * leaves a visible bruise.
     *
     * - rnd: function that returns a float in [0, 1), normally a seeded game RNG such as game.rnd.
     */
    applyDamageRandomized({
        partId,
        integrityDamage,
        painDamage = null,
        damageType = DamageType.BLUNT,
        rnd,
    }) {
        integrityDamage = finiteNumber(integrityDamage, "Randomized integrity damage");
        if (typeof rnd !== "function") {
            throw new Error("applyDamageRandomized expects an rnd() function");
        }
        const part = this.getPart(partId);
        if (!part || integrityDamage <= 0) return null;

        const previousFloor = part.injuryPainFloor;
        part.integrity = clamp(part.integrity - integrityDamage, 0, part.maxIntegrity);
        part.healingDelayMinutes = Math.max(part.healingDelayMinutes, 360);
        const totalPainDamage = painDamage == null
            ? integrityDamage * part.painMultiplier
            : finiteNumber(painDamage, "Randomized pain damage");
        const floorIncrease = Math.max(0, part.injuryPainFloor - previousFloor);
        part.acutePain = clamp(
            part.acutePain + Math.max(0, totalPainDamage - floorIncrease),
            0,
            100,
        );

        this._applyRandomBruise(part, integrityDamage, damageType, rnd);

        return part;
    }

    /**
     * Heal a part by a certain amount (not removing all conditions by default).
     */
    healIntegrity(partId, amount) {
        amount = finiteNumber(amount, "Integrity healing");
        const part = this.getPart(partId);
        if (!part || amount <= 0) return null;

        part.integrity = clamp(part.integrity + amount, 0, part.maxIntegrity);
        if (part.integrity >= part.maxIntegrity) part.healingDelayMinutes = 0;

        this._downgradeConditionsFromIntegrity(part);

        return part;
    }

    /**
     * Hard reset: fully heal the body.
     */
    fullyHeal() {
        for (const part of this.allParts()) {
            part.integrity = part.maxIntegrity;
            part.acutePain = 0;
            part.healingDelayMinutes = 0;
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
            .map((part) => part.pain)
            .sort((left, right) => right - left);
        if (!pains.length) return 0;
        const [worst, ...additional] = pains;
        return worst + additional.reduce((sum, pain) => sum + pain * 0.3, 0);
    }

    /**
     * Ease acute pain without changing body-part integrity or injury floors.
     */
    relievePain(amount) {
        amount = finiteNumber(amount, "Pain relief");
        if (amount <= 0) return this.getTotalPain();
        const raw = this._getRawPainLoad();
        const visible = clamp(raw, 0, 100);
        if (visible <= 0) return 0;
        const injuryFloor = this._painLoadFor((part) => part.injuryPainFloor);
        const target = Math.max(injuryFloor, visible - amount);
        const recoverable = Math.max(0, visible - injuryFloor);
        const scale = recoverable > 0 ? (target - injuryFloor) / recoverable : 0;
        for (const part of this.allParts()) {
            part.acutePain = clamp(part.acutePain * scale, 0, 100);
        }
        return this.getTotalPain();
    }

    decayAcutePain(minutes, { halfLifeMinutes = 90 } = {}) {
        minutes = finiteNumber(minutes, "Pain recovery time");
        halfLifeMinutes = finiteNumber(halfLifeMinutes, "Pain recovery half-life");
        if (minutes <= 0) return this.getTotalPain();
        if (halfLifeMinutes <= 0) throw new RangeError("Pain recovery half-life must be positive");
        const scale = Math.pow(0.5, minutes / halfLifeMinutes);
        for (const part of this.allParts()) {
            part.acutePain = clamp(part.acutePain * scale, 0, 100);
        }
        return this.getTotalPain();
    }

    recoverIntegrity(minutes) {
        minutes = finiteNumber(minutes, "Integrity recovery time");
        if (minutes <= 0) return;
        for (const part of this.allParts()) {
            const delayElapsed = Math.min(minutes, part.healingDelayMinutes);
            part.healingDelayMinutes -= delayElapsed;
            let days = (minutes - delayElapsed) / 1440;
            while (days > 0 && part.integrity < part.maxIntegrity) {
                const ratio = part.integrityRatio;
                if (ratio < 0.2) break;
                const { rate, boundary } = ratio < 0.5
                    ? { rate: 0.02, boundary: 0.5 }
                    : ratio < 0.85
                        ? { rate: 0.05, boundary: 0.85 }
                        : { rate: 0.10, boundary: 1 };
                const integrityPerDay = part.maxIntegrity * rate;
                const boundaryIntegrity = part.maxIntegrity * boundary;
                const daysToBoundary = (boundaryIntegrity - part.integrity) / integrityPerDay;
                const elapsed = Math.min(days, daysToBoundary);
                part.integrity = clamp(
                    part.integrity + integrityPerDay * elapsed,
                    0,
                    part.maxIntegrity,
                );
                days -= elapsed;
                if (elapsed <= 0) break;
            }
            this._downgradeConditionsFromIntegrity(part);
        }
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

    _painLoadFor(valueForPart) {
        const pains = [...this.allParts()]
            .map((part) => clamp(Number(valueForPart(part)) || 0, 0, 100))
            .sort((left, right) => right - left);
        if (!pains.length) return 0;
        const [worst, ...additional] = pains;
        return clamp(worst + additional.reduce((sum, pain) => sum + pain * 0.3, 0), 0, 100);
    }

    _updateConditionsFromIntegrity(part) {
        const ratio = part.integrityRatio;
        if (ratio < 1) part.conditions.add(InjuryCondition.BRUISED);
    }

    _downgradeConditionsFromIntegrity(part) {
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
        const fracOfMax = clamp(amount / part.maxIntegrity, 0, 1); // 0..1 (how big this hit was)

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
