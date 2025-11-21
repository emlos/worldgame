// body.js
// -----------------------------------------------------------------------------
// Granular body model for combat / injury / pain.
// Designed to be:
//  - More detailed than WearSlot
//  - Still mappable back to clothing slots (upper body, head, etc)
//  - Non-gorey, but expressive enough for boxing/fights/accidents.
// -----------------------------------------------------------------------------

import { clamp, deepFreeze, WearSlot } from "../../shared/modules.js";

// If you want to hard-link to WearSlot, you can import it and reuse its values.
// import { WearSlot } from "./whatever.js";

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
 * These are the “hit locations” you’ll use in combat.
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
 * Simple condition tags – non-gory but descriptive.
 * You can stack these on a part (e.g. bruised + wounded).
 */
export const InjuryCondition = Object.freeze({
  BRUISED: "bruised",
  WOUNDED: "wounded", // cuts, open wounds, deeper damage
  BROKEN: "broken", // bones, if canBreak = true
});

/**
 * Optional damage “flavor”, useful if you later want different rules
 * for blunt vs sharp vs fire, etc.
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
    canBreak: true, // concussion / skull fracture analog
    painMultiplier: 1.5,
  },
  {
    id: BodyPartId.FACE,
    displayName: "Face",
    region: BodyRegion.FACE,
    maxHealth: 80,
    canBreak: true, // nose, cheekbone
    painMultiplier: 1.7,
  },
  {
    id: BodyPartId.NECK,
    displayName: "Neck",
    region: BodyRegion.NECK,
    maxHealth: 80,
    canBreak: true,
    painMultiplier: 1.6,
  },

  // Torso ------------------------------------------------------
  {
    id: BodyPartId.CHEST,
    displayName: "Chest",
    region: BodyRegion.UPPER,
    maxHealth: 120,
    canBreak: true, // ribs
    painMultiplier: 1.3,
  },
  {
    id: BodyPartId.BACK,
    displayName: "Back",
    region: BodyRegion.UPPER,
    maxHealth: 120,
    canBreak: true,
    painMultiplier: 1.2,
  },
  {
    id: BodyPartId.ABDOMEN,
    displayName: "Abdomen",
    region: BodyRegion.LOWER,
    maxHealth: 100,
    canBreak: false,
    painMultiplier: 1.4,
  },
  {
    id: BodyPartId.GROIN,
    displayName: "Groin",
    region: BodyRegion.LOWER,
    maxHealth: 60,
    canBreak: false,
    painMultiplier: 2.0,
  },
  // Arms / hands -----------------------------------------------
  {
    id: BodyPartId.SHOULDER_L,
    displayName: "Left shoulder",
    region: BodyRegion.UPPER,
    maxHealth: 90,
    canBreak: true,
    painMultiplier: 1.1,
  },
  {
    id: BodyPartId.SHOULDER_R,
    displayName: "Right shoulder",
    region: BodyRegion.UPPER,
    maxHealth: 90,
    canBreak: true,
    painMultiplier: 1.1,
  },
  {
    id: BodyPartId.UPPER_ARM_L,
    displayName: "Left upper arm",
    region: BodyRegion.UPPER,
    maxHealth: 90,
    canBreak: true,
    painMultiplier: 1.0,
  },
  {
    id: BodyPartId.UPPER_ARM_R,
    displayName: "Right upper arm",
    region: BodyRegion.UPPER,
    maxHealth: 90,
    canBreak: true,
    painMultiplier: 1.0,
  },
  {
    id: BodyPartId.LOWER_ARM_L,
    displayName: "Left forearm",
    region: BodyRegion.UPPER,
    maxHealth: 80,
    canBreak: true,
    painMultiplier: 1.1,
  },
  {
    id: BodyPartId.LOWER_ARM_R,
    displayName: "Right forearm",
    region: BodyRegion.UPPER,
    maxHealth: 80,
    canBreak: true,
    painMultiplier: 1.1,
  },
  {
    id: BodyPartId.HAND_L,
    displayName: "Left hand",
    region: BodyRegion.HANDS,
    maxHealth: 70,
    canBreak: true,
    painMultiplier: 1.4,
  },
  {
    id: BodyPartId.HAND_R,
    displayName: "Right hand",
    region: BodyRegion.HANDS,
    maxHealth: 70,
    canBreak: true,
    painMultiplier: 1.4,
  },

  // Legs / feet ------------------------------------------------
  // Legs / feet ------------------------------------------------
  {
    id: BodyPartId.THIGH_L,
    displayName: "Left thigh",
    region: BodyRegion.LEGS,
    maxHealth: 100,
    canBreak: true,
    painMultiplier: 1.2,
  },
  {
    id: BodyPartId.THIGH_R,
    displayName: "Right thigh",
    region: BodyRegion.LEGS,
    maxHealth: 100,
    canBreak: true,
    painMultiplier: 1.2,
  },
  {
    id: BodyPartId.KNEE_L,
    displayName: "Left knee",
    region: BodyRegion.LEGS,
    maxHealth: 80,
    canBreak: true,
    painMultiplier: 1.5,
  },
  {
    id: BodyPartId.KNEE_R,
    displayName: "Right knee",
    region: BodyRegion.LEGS,
    maxHealth: 80,
    canBreak: true,
    painMultiplier: 1.5,
  },
  {
    id: BodyPartId.CALF_L,
    displayName: "Left calf",
    region: BodyRegion.LEGS,
    maxHealth: 90,
    canBreak: true,
    painMultiplier: 1.3,
  },
  {
    id: BodyPartId.CALF_R,
    displayName: "Right calf",
    region: BodyRegion.LEGS,
    maxHealth: 90,
    canBreak: true,
    painMultiplier: 1.3,
  },
  {
    id: BodyPartId.ANKLE_L,
    displayName: "Left ankle",
    region: BodyRegion.FEET,
    maxHealth: 70,
    canBreak: true,
    painMultiplier: 1.5,
  },
  {
    id: BodyPartId.ANKLE_R,
    displayName: "Right ankle",
    region: BodyRegion.FEET,
    maxHealth: 70,
    canBreak: true,
    painMultiplier: 1.5,
  },
  {
    id: BodyPartId.FOOT_L,
    displayName: "Left foot",
    region: BodyRegion.FEET,
    maxHealth: 70,
    canBreak: true,
    painMultiplier: 1.3,
  },
  {
    id: BodyPartId.FOOT_R,
    displayName: "Right foot",
    region: BodyRegion.FEET,
    maxHealth: 70,
    canBreak: true,
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
    this.canBreak = !!template.canBreak;
    this.painMultiplier = template.painMultiplier ?? 1;

    this.pain = 0; // local pain
    this.conditions = new Set(); // e.g. "bruised", "broken"
  }

  get isBroken() {
    return this.conditions.has(InjuryCondition.BROKEN);
  }

  get isBruised() {
    return this.conditions.has(InjuryCondition.BRUISED);
  }

  get isWounded() {
    return this.conditions.has(InjuryCondition.WOUNDED);
  }

  /**
   * Useful for “is this part basically okay?” checks.
   */
  get integrityRatio() {
    return this.health / this.maxHealth;
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

  // --- Damage / healing ------------------------------------------------------

  /**
   * Apply damage to a specific body part.
   * - amount: numeric damage
   * - partId: BodyPartId.*
   * - damageType: DamageType.* (for future expansion)
   */
  applyDamage({ partId, amount, damageType = DamageType.BLUNT }) {
    const part = this.getPart(partId);
    if (!part || amount <= 0) return null;

    // Reduce health
    part.health = clamp(part.health - amount, 0, part.maxHealth);

    // Update conditions based on remaining health ratio
    this._updateConditionsFromHealth(part, damageType);

    // Pain is proportional to damage and part sensitivity
    const painDelta = amount * part.painMultiplier;
    part.pain = clamp(part.pain + painDelta, 0, 100);

    return part;
  }

  /**
   * Variant of applyDamage that uses randomness to decide injuries
   * (bruised / wounded / broken) based on amount, type and current health.
   *
   * - rnd: function that returns a float in [0, 1), e.g. Math.random or a seeded RNG.
   */
  applyDamageRandomized({ partId, amount, damageType = DamageType.BLUNT, rnd }) {
    const part = this.getPart(partId);
    if (!part || amount <= 0) return null;
    if (typeof rnd !== "function") {
      throw new Error("applyDamageRandomized expects an rnd() function");
    }

    part.health = clamp(part.health - amount, 0, part.maxHealth);

    const painDelta = amount * part.painMultiplier;
    part.pain = clamp(part.pain + painDelta, 0, 100);

    // --- Random injuries -------
    this._applyRandomInjury(part, amount, damageType, rnd);

    return part;
  }

  /**
   * Heal a part by a certain amount (not removing all conditions by default).
   */
  healPart(partId, amount) {
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
   * Sum of all local pain values, clamped to 0..100.
   * This can be used as a global “how much does the character hurt?” metric.
   */
  getTotalPain() {
    let sum = 0;
    for (const p of this.allParts()) sum += p.pain;
    return clamp(sum, 0, 100);
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
    const stage = this.getPainStage();
    switch (stage) {
      case 0:
        return 1.0;
      case 1:
        return 0.9;
      case 2:
        return 0.7;
      case 3:
        return 0.5;
      default:
        return 1.0;
    }
  }

  /**
   * Quick check: are any critical parts broken?
   * Good for KO / incapacitation logic.
   */
  hasCriticalBreaks() {
    const critical = [BodyPartId.HEAD, BodyPartId.NECK, BodyPartId.CHEST, BodyPartId.BACK, BodyPartId.THIGH_L, BodyPartId.THIGH_R];
    return critical.some((id) => {
      const p = this.getPart(id);
      return p && p.isBroken;
    });
  }

  // --- Internal helpers ------------------------------------------------------

  _updateConditionsFromHealth(part, damageType) {
    const ratio = part.integrityRatio;

    // Clear old conditions; we reassign from current health.
    part.conditions.clear();

    // Lightly hurt -> bruised
    if (ratio < 1.0 && ratio >= 0.7) {
      part.conditions.add(InjuryCondition.BRUISED);
    }
    // Medium -> bruised + wounded
    else if (ratio < 0.7 && ratio >= 0.3) {
      part.conditions.add(InjuryCondition.BRUISED);
      part.conditions.add(InjuryCondition.WOUNDED);
    }
    // Severe -> wounded + maybe broken
    else if (ratio < 0.3) {
      part.conditions.add(InjuryCondition.WOUNDED);
      if (part.canBreak && damageType !== DamageType.SHARP) {
        // e.g. heavy blunt/impact damage -> broken
        part.conditions.add(InjuryCondition.BROKEN);
      }
    }
  }

  _downgradeConditionsFromHealth(part) {
    const ratio = part.integrityRatio;

    // If we’re back over 70%, no broken / wounded
    if (ratio >= 0.7) {
      part.conditions.delete(InjuryCondition.BROKEN);
      part.conditions.delete(InjuryCondition.WOUNDED);
    }
    // If we’re back over 90%, no bruise either
    if (ratio >= 0.9) {
      part.conditions.delete(InjuryCondition.BRUISED);
    }
  }

  /**
   * Internal helper: uses damage amount, type, and current integrity
   * plus rnd() to decide which conditions to apply.
   */
  _applyRandomInjury(part, amount, damageType, rnd) {
    const ratio = part.integrityRatio; // 0..1 (remaining)
    const fracOfMax = clamp(amount / part.maxHealth, 0, 1); // 0..1 (how big this hit was)

    // Damage-type multiplier: tweak to taste
    let typeFactor = 1;
    if (damageType === DamageType.IMPACT) typeFactor = 1.2;
    else if (damageType === DamageType.SHARP) typeFactor = 1.1;

    // Base chances for each condition. These combine:
    //  - size of this hit (fracOfMax)
    //  - how beaten up the part already is (1 - ratio)
    //  - damage type (typeFactor)
    let bruiseChance = clamp(fracOfMax * 1.5 * typeFactor + (1 - ratio) * 0.5, 0, 1);
    let woundChance = clamp(fracOfMax * (damageType === DamageType.SHARP ? 2.0 : 1.2) * typeFactor + (1 - ratio) * 0.5, 0, 1);

    let breakChance = 0;
    if (part.canBreak) {
      // Blunt/impact more likely to break than sharp, which tends to wound instead.
      const breakTypeFactor = damageType === DamageType.SHARP ? 0.6 : 1.4;
      breakChance = clamp(fracOfMax * 1.8 * breakTypeFactor * typeFactor + (1 - ratio) * 0.7, 0, 1);
    }

    // Roll in a stacked way: broken ⇒ wounded ⇒ bruised
    if (rnd() < bruiseChance) {
      part.conditions.add(InjuryCondition.BRUISED);
    }

    if (rnd() < woundChance) {
      part.conditions.add(InjuryCondition.WOUNDED);
      part.conditions.add(InjuryCondition.BRUISED);
    }

    if (part.canBreak && rnd() < breakChance) {
      part.conditions.add(InjuryCondition.BROKEN);
      part.conditions.add(InjuryCondition.WOUNDED);
      part.conditions.add(InjuryCondition.BRUISED);
    }

    // Safety net: if health is clearly down but rolls all failed,
    // enforce at least a bruise / wound so feedback matches numbers.
    if (part.conditions.size === 0) {
      if (ratio < 0.7 && ratio >= 0.3) {
        part.conditions.add(InjuryCondition.BRUISED);
      } else if (ratio < 0.3) {
        part.conditions.add(InjuryCondition.WOUNDED);
        part.conditions.add(InjuryCondition.BRUISED);
      }
    }
  }
}
