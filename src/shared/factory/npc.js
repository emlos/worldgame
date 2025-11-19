import { NPC } from "../../classes/classes.js";
import { NPC_REGISTRY } from "../../data/data.js";
import {
    makeRNG,
    pick,
    randInt,
    Gender,
    PronounSets,
    HUMAN_BODY_TEMPLATE,
} from "../../shared/modules.js";

const BODY_TEMPLATES = {
    human: HUMAN_BODY_TEMPLATE,
    // later: animal: ANIMAL_BODY_TEMPLATE, etc.
};

function pickGender(weights, rnd) {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [_, w]) => sum + w, 0);
    let roll = rnd() * total;
    for (const [g, w] of entries) {
        roll -= w;
        if (roll <= 0) return g;
    }
    return "nb";
}

function generateName(pool, gender, rnd) {
    let firstPool;
    if (gender === Gender.M) firstPool = pool.masc;
    else if (gender === Gender.F) firstPool = pool.fem;
    else firstPool = pool.nb || pool.masc || pool.fem;

    const first = pick(firstPool, rnd);
    const last = pick(pool.surnames, rnd);
    return `${first} ${last}`;
}

export function randomNPCFromRegistry(key, { seed, locationId = null } = {}) {
    const rnd = makeRNG(seed ?? Date.now());
    const def = NPC_REGISTRY.find((n) => n.key === key);
    if (!def) throw new Error(`Unknown NPC template: ${key}`);

    const genderCode = pickGender(def.genderWeights, rnd);
    const gender =
        genderCode === "m"
            ? Gender.M
            : genderCode === "f"
            ? Gender.F
            : Gender.NB;

    const name = generateName(def.namePool, gender, rnd);
    const age = randInt(def.ageRange.min, def.ageRange.max, rnd);

    const stats = {};
    for (const [k, range] of Object.entries(def.statsTemplate)) {
        stats[k] = randInt(range.min, range.max, rnd);
    }

    const bodyTemplate =
        BODY_TEMPLATES[def.bodyTemplateKey] || HUMAN_BODY_TEMPLATE;

    return new NPC({
        name,
        age,
        stats,
        gender,
        pronouns:
            gender === Gender.M
                ? PronounSets.HE_HIM
                : gender === Gender.F
                ? PronounSets.SHE_HER
                : PronounSets.THEY_THEM,
        bodyTemplate,
        locationId,
    });
}
