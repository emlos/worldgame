import { Relationship } from "../../shared/classes/relationship.js";
import { Stat } from "../../shared/classes/stat.js";
import { Gender, PronounSets } from "../../shared/classes/pronouns.js";
import { adjustHexLightness } from "../../shared/util/color.js";
import { Clothing } from "../../shared/classes/clothing.js";
import { clamp, deepFreeze, finiteNumber } from "../../shared/util/util.js";
import { ageAtDate, asDate } from "../../shared/util/date.js";
import { Body, DamageType, HUMAN_BODY_TEMPLATE } from "../../shared/classes/body.js";
import {
    INITIAL_PLAYER_AGE,
    INITIAL_PLAYER_MONEY,
    INITIAL_PLAYER_TEMPERATURE,
    PLAYER_TEMPERATURE_VALUES,
    SKILLS,
    initialPlayerStats,
    initialPlayerSkills,
    STATS,
} from "../../data/player/stats.js";
import {
    initialPlayerEducation,
    normalizeSubjectGrade,
    requireSchoolSubject,
} from "../../data/player/education.js";

const SKILL_PRECISION = 1_000_000;

function registeredSkill(name) {
    const id = String(name);
    const definition = SKILLS[id];
    if (!definition) throw new Error(`Unknown player skill '${id}'`);
    return { id, definition };
}

function normalizedSkillValue(value, definition, label) {
    const finite = finiteNumber(value, label);
    const rounded = Math.round(finite * SKILL_PRECISION) / SKILL_PRECISION;
    return clamp(rounded, definition.min, definition.max);
}

/*
  Text Adventure Core – Player model (vanilla JS, no build step)
  ----------------------------------------------------------------
  This file defines the data model for a Twine-like, text‑based HTML game.
  It focuses on Player state, including:
    - Stats with base values and modifiers
    - Physical appearance & colors (incl. tan/losenTan helpers)
    - Relationships with NPCs
    - Skills (flag or meter 0..1)
    - Gender, pronouns, and perceived gender (derived)
    - Clothing inventory & wear slots
*/

// --------------------------
// Player
// --------------------------
export class Player {
    /**
     * @param {object} opts
     * @param {object} opts.stats e.g., { looks: 5, strength: 3, intelligence: 4 }
     * @param {object} opts.appearance { head, body, face, hair } -> image paths
     * @param {string} opts.skinTone hex color string (e.g., #d2a679)
     * @param {string} opts.eyeColor hex
     * @param {string} opts.hairColor hex
     * @param {('m'|'f'|'nb')} opts.gender
     * @param {object} opts.pronouns PronounSets.* or custom
     * @param {Array<object>} [opts.bodyTemplate] Optional override for body template
     */
    constructor({
        stats = null,
        skills = null,
        education = null,
        money = INITIAL_PLAYER_MONEY,
        temperature = INITIAL_PLAYER_TEMPERATURE,
        age = INITIAL_PLAYER_AGE,
        birthDate = null,
        appearance = {
            head: "head/1.png",
            body: "body/1.png",
            face: "head/1.png",
            hair: "hair/1.png",
        },
        skinTone = "#f2d3b3",
        eyeColor = "#5b7fa6",
        hairColor = "#5a3b1f",
        gender = Gender.NB,
        pronouns = PronounSets.THEY_THEM,
        bodyTemplate = HUMAN_BODY_TEMPLATE,
    } = {}) {
        // Stats ----------------------------------------------------
        this.stats = {};
        for (const [k, v] of Object.entries(stats ?? initialPlayerStats())) {
            this.stats[k] = new Stat(v);
        }

        // Player meters --------------------------------------------
        this.money = finiteNumber(money, "Player money");
        if (!PLAYER_TEMPERATURE_VALUES.includes(temperature)) {
            throw new RangeError(`Unknown player temperature comfort '${temperature}'`);
        }
        this.temperature = temperature;
        const numericAge = finiteNumber(age, "Player age");
        if (!Number.isInteger(numericAge) || numericAge < 0) {
            throw new RangeError("Player age must be a non-negative integer");
        }
        this.age = numericAge;
        this.birthDate = birthDate == null ? null : asDate(birthDate)?.toISOString();
        if (birthDate != null && this.birthDate == null) {
            throw new TypeError("Player birth date must be a valid date");
        }

        // Appearance -----------------------------------------------
        this._bodyImmutable = deepFreeze({ body: appearance.body }); // body fixed after creation
        this.appearance = {
            head: appearance.head,
            face: appearance.face,
            hair: appearance.hair,
            // body exposed via getter to guarantee immutability
        };

        this._skinTone = skinTone; // hex
        this.eyeColor = eyeColor; // hex
        this.hairColor = hairColor; // hex

        // Identity --------------------------------------------------
        this.gender = gender; // declared gender
        this.pronouns = { ...pronouns };

        // Relationships, Skills -----------------------------------
        this.relationships = new Map(); // npcId -> Relationship
        this.skills = new Map(); // registered name -> fractional 0..10 value
        const suppliedSkills = skills instanceof Map
            ? Object.fromEntries(skills)
            : (skills || initialPlayerSkills());
        for (const [name, definition] of Object.entries(SKILLS)) {
            const value = Object.prototype.hasOwnProperty.call(suppliedSkills, name)
                ? suppliedSkills[name]
                : definition.initial;
            this.skills.set(
                name,
                normalizedSkillValue(value, definition, `Player skill '${name}'`),
            );
        }

        // Education ------------------------------------------------
        this.education = initialPlayerEducation();
        if (education?.subjects && typeof education.subjects === "object") {
            for (const id of Object.keys(this.education.subjects)) {
                const saved = education.subjects[id];
                if (!saved) continue;
                const attendedSegments = Number(saved.attendedSegments);
                if (!Number.isInteger(attendedSegments) || attendedSegments < 0) {
                    throw new RangeError(
                        `Player subject '${id}' attendance must be a non-negative integer`,
                    );
                }
                this.education.subjects[id] = {
                    grade: normalizeSubjectGrade(
                        saved.grade,
                        `Player subject '${id}' grade`,
                    ),
                    attendedSegments,
                };
            }
        }

        // Clothing --------------------------------------------------
        this.clothing = new Map(); // slot -> Clothing

        // Body ------------------------------------------------------
        this.body = new Body(bodyTemplate); // <--- NEW
    }

    // --- Appearance & color ---
    get visualbody() {
        return this._bodyImmutable.body;
    } // immutable
    set hair(path) {
        this.appearance.hair = path;
    }
    get hair() {
        return this.appearance.hair;
    }

    get skinTone() {
        return this._skinTone;
    }
    set skinTone(hex) {
        this._skinTone = hex;
    }
    /** Darken skin by step (0..1 small). */
    tan(step = 0.05) {
        this._skinTone = adjustHexLightness(this._skinTone, -Math.abs(step));
        return this._skinTone;
    }
    /** Lighten skin by step (0..1 small). */
    loseTan(step = 0.05) {
        this._skinTone = adjustHexLightness(this._skinTone, Math.abs(step));
        return this._skinTone;
    }

    // --- Stats ---
    getStatBase(name) {
        if (name === "health") return this.body?.getHealthPercentage() ?? 0;
        return this.stats[name]?.base ?? 0;
    }
    setStatBase(name, v) {
        if (name === "health") return this.body?.setHealthPercentage(v) ?? 0;
        if (!this.stats[name]) this.stats[name] = new Stat(0);
        this.stats[name].base = v;
        return this.stats[name].base;
    }
    adjustStatBase(name, delta) {
        const id = String(name);
        const definition = STATS[id];
        if (!definition) throw new Error(`Unknown player stat '${id}'`);
        const amount = finiteNumber(delta, `Player stat '${id}' adjustment`);
        const next = clamp(this.getStatBase(id) + amount, definition.min, definition.max);
        this.setStatBase(id, next);
        return this.getStatBase(id);
    }
    getStatValue(name) {
        if (name === "health") return this.getStatBase(name);
        const evaluated = (this.stats[name] || new Stat(0)).clone();
        return evaluated.value;
    }

    adjustMoney(amount) {
        const next = this.money + finiteNumber(amount, "Player money adjustment");
        this.money = finiteNumber(next, "Player money");
        return this.money;
    }

    // --- Relationships ---
    setRelationship({ npcId, met = true, score = 0 }) {
        this.relationships.set(String(npcId), new Relationship({ npcId, met, score }));
    }
    getRelationship(npcId) {
        return this.relationships.get(String(npcId)) || new Relationship({ npcId });
    }
    bumpRelationship(npcId, delta) {
        const r = this.getRelationship(npcId);
        r.met = true;
        r.score = clamp(r.score + delta, -1, 1);
        this.relationships.set(String(npcId), r);
        return r.score;
    }

    // --- Skills ---
    getSkillValue(name) {
        const { id } = registeredSkill(name);
        return this.skills.get(id);
    }
    setSkillValue(name, value) {
        const { id, definition } = registeredSkill(name);
        const next = normalizedSkillValue(value, definition, `Player skill '${id}'`);
        this.skills.set(id, next);
        return next;
    }
    adjustSkill(name, delta) {
        const { id } = registeredSkill(name);
        const amount = finiteNumber(delta, `Player skill '${id}' adjustment`);
        return this.setSkillValue(id, this.getSkillValue(id) + amount);
    }

    // --- Education ---
    getSubjectRecord(subjectId) {
        const { id } = requireSchoolSubject(subjectId);
        return this.education.subjects[id];
    }
    getSubjectGrade(subjectId) {
        return this.getSubjectRecord(subjectId).grade;
    }
    adjustSubjectGrade(subjectId, delta) {
        const { id } = requireSchoolSubject(subjectId);
        const amount = finiteNumber(delta, `Player subject '${id}' grade adjustment`);
        const record = this.education.subjects[id];
        record.grade = normalizeSubjectGrade(
            record.grade + amount,
            `Player subject '${id}' grade`,
        );
        return record.grade;
    }
    recordSubjectAttendance(subjectId, segments = 1) {
        const { id } = requireSchoolSubject(subjectId);
        const amount = finiteNumber(segments, `Player subject '${id}' attendance`);
        if (!Number.isInteger(amount) || amount <= 0) {
            throw new RangeError("Attendance segments must be a positive integer");
        }
        const record = this.education.subjects[id];
        record.attendedSegments += amount;
        return record.attendedSegments;
    }

    // --- Clothing ---
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

    // --- Perceived gender ---
    /**
     * Returns { score: -1..+1, label: 'm'|'f'|'nb' }
     * Heuristic based on currently equipped clothing.
     */
    get perceivedGender() {
        let score = 0;
        // clothing contribution
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
            stats: Object.fromEntries(
                Object.entries(this.stats).map(([name, stat]) => [name, stat.toJSON()]),
            ),
            appearance: {
                head: this.appearance.head,
                body: this.visualbody,
                face: this.appearance.face,
                hair: this.appearance.hair,
            },
            skinTone: this._skinTone,
            eyeColor: this.eyeColor,
            hairColor: this.hairColor,
            age: this.age,
            birthDate: this.birthDate,
            gender: this.gender,
            pronouns: { ...this.pronouns },
            relationships: [...this.relationships.entries()].map(([npcId, rel]) => [
                npcId,
                rel.toJSON(),
            ]),
            skills: [...this.skills.entries()],
            education: {
                subjects: Object.fromEntries(
                    Object.entries(this.education.subjects).map(([id, record]) => [
                        id,
                        { ...record },
                    ]),
                ),
            },
            money: this.money,
            temperature: this.temperature,
            clothing: [...this.clothing.entries()].map(([slot, item]) => [slot, item.toJSON()]),
            body: this.body?.toJSON?.() ?? null,
        };
    }

    static fromJSON(data) {
        if (data instanceof Player) return data;

        const appearance = data?.appearance || {};
        const player = new Player({
            stats: {},
            appearance: {
                head: appearance.head ?? "head/1.png",
                body: appearance.body ?? "body/1.png",
                face: appearance.face ?? "head/1.png",
                hair: appearance.hair ?? "hair/1.png",
            },
            skinTone: data?.skinTone ?? "#f2d3b3",
            eyeColor: data?.eyeColor ?? "#5b7fa6",
            hairColor: data?.hairColor ?? "#5a3b1f",
            age: data?.age ?? INITIAL_PLAYER_AGE,
            birthDate: data?.birthDate ?? null,
            gender: data?.gender ?? Gender.NB,
            pronouns: data?.pronouns ?? PronounSets.THEY_THEM,
            money: data?.money ?? INITIAL_PLAYER_MONEY,
            temperature: data?.temperature ?? INITIAL_PLAYER_TEMPERATURE,
            skills: initialPlayerSkills(),
            education: data?.education ?? null,
            bodyTemplate: [],
        });

        player.stats = {};
        for (const [name, statData] of Object.entries(data?.stats || {})) {
            player.stats[name] = Stat.fromJSON(statData);
        }

        player.relationships = new Map();
        for (const [npcId, relData] of data?.relationships || []) {
            player.relationships.set(String(npcId), Relationship.fromJSON(relData));
        }

        player.skills = new Map();
        for (const [name, value] of data?.skills || []) {
            player.setSkillValue(name, value);
        }

        player.clothing = new Map();
        for (const [slot, itemData] of data?.clothing || []) {
            const item = Clothing.fromJSON(itemData);
            player.clothing.set(String(slot ?? item.slot), item);
        }

        player.body = data?.body ? Body.fromJSON(data.body) : new Body(HUMAN_BODY_TEMPLATE);
        return player;
    }

    /** Anchor the starting age to a world timestamp. */
    setAgeAtDate(age, value) {
        const numericAge = finiteNumber(age, "Player age");
        const at = asDate(value);
        if (!Number.isInteger(numericAge) || numericAge < 0) {
            throw new RangeError("Player age must be a non-negative integer");
        }
        if (!at) throw new TypeError("Player age anchor must be a valid date");

        const birthDate = new Date(at);
        birthDate.setUTCFullYear(at.getUTCFullYear() - numericAge);
        this.birthDate = birthDate.toISOString();
        this.age = numericAge;
        return this.age;
    }

    /** Synchronize the stored display age to the current world timestamp. */
    syncAgeAt(value) {
        this.age = this.getAgeAt(value);
        return this.age;
    }

    /** Query age at an arbitrary timestamp without changing player state. */
    getAgeAt(value) {
        return this.birthDate == null ? this.age : ageAtDate(this.birthDate, value);
    }

    // --- Body / injury convenience methods ----------------------

    /**
     * Get the BodyPartState for a given part id.
     * @param {string} partId BodyPartId.*
     */
    getBodyPart(partId) {
        return this.body ? this.body.getPart(partId) : null;
    }

    /**
     * Apply damage to a body part.
     * Usage: player.applyDamageToPart({ partId: BodyPartId.HEAD, amount: 20 })
     */
    applyDamageToPart({ partId, amount, damageType = DamageType.BLUNT }) {
        if (!this.body) return null;
        return this.body.applyDamage({ partId, amount, damageType });
    }

    /**
     * Apply damage to a body part with chance of causing injury.
     * Usage: player.applyDamageToPart({ partId: BodyPartId.HEAD, amount: 20 , rnd: game.rnd })
     */
    applyDamageToPartRandom({ partId, amount, damageType = DamageType.BLUNT, rnd }) {
        if (!this.body) return null;
        return this.body.applyDamageRandomized({
            partId,
            amount,
            damageType,
            rnd,
        });
    }

    /**
     * Heal a specific body part.
     */
    healBodyPart(partId, amount) {
        if (!this.body) return null;
        return this.body.healPart(partId, amount);
    }

    /**
     * Fully heal all body parts.
     */
    fullyHealBody() {
        if (!this.body) return;
        this.body.fullyHeal();
    }

    /**
     * Total pain (0..100) aggregated from body parts.
     */
    getBodyPain() {
        if (!this.body) return 0;
        return this.body.getTotalPain();
    }

    /**
     * Short descriptive label: "fine", "sore", "hurting", "badly hurt", "in severe pain".
     */
    getBodyPainLabel() {
        if (!this.body) return "fine";
        return this.body.getPainLabel();
    }

    /**
     * Pain stage 0..3:
     * 0 = fine, 1 = minor, 2 = major, 3 = near incapacitated.
     */
    getBodyPainStage() {
        if (!this.body) return 0;
        return this.body.getPainStage();
    }

    /**
     * Multiplier for physical performance from 1.0 down to ~0.5.
     * You can use this when reading physical stats.
     */
    getPhysicalPerformanceMultiplier() {
        if (!this.body) return 1.0;
        return this.body.getPhysicalPerformanceMultiplier();
    }

    /**
     * Simple “is this character basically out of it?” check.
     * Uses critical breaks + high pain.
     */
    isIncapacitated() {
        if (!this.body) return false;
        return this.body.hasCriticalBreaks() || this.body.getPainStage() >= 3;
    }
}
