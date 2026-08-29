import { deriveSeed } from "../../../shared/util/random.js";
import { validateWGSystemState } from "../scene/wg/storySystemRegistry.js";
import {
    GOAL_TYPE,
    NPC_ACTION_TYPE,
    TARGET_TYPE,
    OBLIGATION_EARLY_ARRIVAL_MINUTES,
} from "../../../data/npc/behavior.js";
import { RANDOM_HOLIDAYS, MONTH_DAYS, DayKind } from "../../../data/world/calendar.js";
import { DAY_KEYS, MS_PER_MINUTE } from "../../../data/world/time.js";
import { WeatherType } from "../../../data/world/weather.js";
import { PLAYER_TEMPERATURE_VALUES, SKILLS, STATS } from "../../../data/player/stats.js";
import {
    SCHOOL_SUBJECTS,
    SUBJECT_GRADE_MAX,
    SUBJECT_GRADE_MIN,
} from "../../../data/player/education.js";
import { npcHomeAccessFlag } from "../../../data/world/access.js";
import {
    getPlaceInstanceTarget,
    PLACE_DISTRIBUTION_KIND,
    PLACE_REGISTRY,
} from "../../../data/world/place.js";
import {
    PLACE_ENTER_MINUTES,
    PLACE_LEAVE_MINUTES,
} from "../../../data/world/travel.js";
import { Weather } from "../../world/util/weather.js";
import { ageAtDate } from "../../../shared/util/date.js";

const UINT32_MAX = 0xffffffff;
const WEATHER_SAVE_VERSION = 2;
const WEATHER_ALGORITHM_VERSION = 1;
const GOAL_TYPES = new Set(Object.values(GOAL_TYPE));
const ACTION_TYPES = new Set(Object.values(NPC_ACTION_TYPE));
const TARGET_TYPES = new Set(Object.values(TARGET_TYPE));
const WEATHER_TYPES = new Set(Object.values(WeatherType));
const DAY_KINDS = new Set(Object.values(DayKind));
const DAY_KEYS_SET = new Set(DAY_KEYS);
const PLAYER_TEMPERATURES = new Set(PLAYER_TEMPERATURE_VALUES);
const ANNOUNCEMENT_TONES = new Set(["info", "warning"]);

export class SaveValidationError extends Error {
    constructor(path, message) {
        super(`Invalid game save at ${path}: ${message}`);
        this.name = "SaveValidationError";
        this.path = path;
    }
}

function fail(path, message) {
    throw new SaveValidationError(path, message);
}

function isRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function record(value, path) {
    if (!isRecord(value)) fail(path, "must be an object");
    return value;
}

function array(value, path) {
    if (!Array.isArray(value)) fail(path, "must be an array");
    return value;
}

function required(object, key, path) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
        fail(`${path}.${key}`, "is required");
    }
    return object[key];
}

function string(value, path, { nonEmpty = false } = {}) {
    if (typeof value !== "string") fail(path, "must be a string");
    if (nonEmpty && value.length === 0) fail(path, "must not be empty");
    return value;
}

function boolean(value, path) {
    if (typeof value !== "boolean") fail(path, "must be a boolean");
    return value;
}

function finiteNumber(value, path, { min = -Infinity, max = Infinity } = {}) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        fail(path, "must be a finite number");
    }
    if (value < min || value > max) {
        fail(path, `must be between ${min} and ${max}`);
    }
    return value;
}

function integer(value, path, options = {}) {
    finiteNumber(value, path, options);
    if (!Number.isInteger(value)) fail(path, "must be an integer");
    return value;
}

function uint32(value, path) {
    return integer(value, path, { min: 0, max: UINT32_MAX });
}

function optionalNullableString(value, path, { nonEmpty = true } = {}) {
    if (value === null) return null;
    return string(value, path, { nonEmpty });
}

function dateMilliseconds(value, path) {
    const text = string(value, path, { nonEmpty: true });
    const timestamp = Date.parse(text);
    if (!Number.isFinite(timestamp)) fail(path, "must be a valid date string");
    return timestamp;
}

function same(actual, expected, path, description) {
    if (actual !== expected) fail(path, `must match ${description}`);
}

function uniqueStrings(values, path, { nonEmpty = false } = {}) {
    const seen = new Set();
    array(values, path).forEach((value, index) => {
        const itemPath = `${path}[${index}]`;
        const text = string(value, itemPath, { nonEmpty });
        if (seen.has(text)) fail(itemPath, `duplicates '${text}'`);
        seen.add(text);
    });
    return seen;
}

function validateJsonValue(value, path, ancestors = new WeakSet()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) fail(path, "contains a non-finite number");
        return;
    }
    if (typeof value !== "object") fail(path, `contains unsupported ${typeof value} data`);
    if (ancestors.has(value)) fail(path, "contains a circular reference");

    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            value.forEach((child, index) =>
                validateJsonValue(child, `${path}[${index}]`, ancestors),
            );
            return;
        }
        if (!isRecord(value)) fail(path, "must contain only plain JSON objects and arrays");
        for (const [key, child] of Object.entries(value)) {
            validateJsonValue(child, `${path}.${key}`, ancestors);
        }
    } finally {
        ancestors.delete(value);
    }
}

function validateRandomStreams(data, path, expectedSeed, requiredNames = []) {
    const random = record(data, path);
    const seed = uint32(required(random, "seed", path), `${path}.seed`);
    same(seed, expectedSeed, `${path}.seed`, "the owning seed");

    const states = record(required(random, "states", path), `${path}.states`);
    for (const [name, state] of Object.entries(states)) {
        string(name, `${path}.states key`, { nonEmpty: true });
        uint32(state, `${path}.states.${name}`);
    }
    for (const name of requiredNames) {
        if (!Object.prototype.hasOwnProperty.call(states, name)) {
            fail(`${path}.states.${name}`, "is required for an initialized random stream");
        }
    }
}

function validateStats(data, path) {
    const stats = record(data, path);
    for (const [name, statData] of Object.entries(stats)) {
        string(name, `${path} key`, { nonEmpty: true });
        const statPath = `${path}.${name}`;
        const stat = record(statData, statPath);
        finiteNumber(required(stat, "base", statPath), `${statPath}.base`);
        array(required(stat, "add", statPath), `${statPath}.add`).forEach((value, index) =>
            finiteNumber(value, `${statPath}.add[${index}]`),
        );
        array(required(stat, "mult", statPath), `${statPath}.mult`).forEach((value, index) =>
            finiteNumber(value, `${statPath}.mult[${index}]`),
        );
    }
}

function validateBody(data, path) {
    const body = record(data, path);
    const seen = new Set();
    array(required(body, "parts", path), `${path}.parts`).forEach((partData, index) => {
        const partPath = `${path}.parts[${index}]`;
        const part = record(partData, partPath);
        const id = string(required(part, "id", partPath), `${partPath}.id`, { nonEmpty: true });
        if (seen.has(id)) fail(`${partPath}.id`, `duplicates body part '${id}'`);
        seen.add(id);

        string(required(part, "displayName", partPath), `${partPath}.displayName`, {
            nonEmpty: true,
        });
        string(required(part, "region", partPath), `${partPath}.region`, { nonEmpty: true });
        const maxHealth = finiteNumber(
            required(part, "maxHealth", partPath),
            `${partPath}.maxHealth`,
            {
                min: Number.MIN_VALUE,
            },
        );
        finiteNumber(required(part, "health", partPath), `${partPath}.health`, {
            min: 0,
            max: maxHealth,
        });
        boolean(required(part, "canBreak", partPath), `${partPath}.canBreak`);
        finiteNumber(required(part, "painMultiplier", partPath), `${partPath}.painMultiplier`, {
            min: 0,
        });
        finiteNumber(required(part, "pain", partPath), `${partPath}.pain`, { min: 0, max: 100 });
        uniqueStrings(required(part, "conditions", partPath), `${partPath}.conditions`, {
            nonEmpty: true,
        });
    });
}

function validateRelationships(data, path, knownNpcIds = null) {
    const seen = new Set();
    array(data, path).forEach((entry, index) => {
        const entryPath = `${path}[${index}]`;
        if (!Array.isArray(entry) || entry.length !== 2)
            fail(entryPath, "must be a [targetId, relationship] pair");
        const targetId = string(entry[0], `${entryPath}[0]`, { nonEmpty: true });
        if (seen.has(targetId)) fail(`${entryPath}[0]`, `duplicates relationship '${targetId}'`);
        if (knownNpcIds && !knownNpcIds.has(targetId)) {
            fail(`${entryPath}[0]`, `references unknown NPC '${targetId}'`);
        }
        seen.add(targetId);

        const relationship = record(entry[1], `${entryPath}[1]`);
        same(
            string(required(relationship, "npcId", `${entryPath}[1]`), `${entryPath}[1].npcId`, {
                nonEmpty: true,
            }),
            targetId,
            `${entryPath}[1].npcId`,
            "the relationship map key",
        );
        boolean(required(relationship, "met", `${entryPath}[1]`), `${entryPath}[1].met`);
        finiteNumber(required(relationship, "score", `${entryPath}[1]`), `${entryPath}[1].score`, {
            min: -1,
            max: 1,
        });
    });
}

function validateClothing(data, path) {
    const seen = new Set();
    array(data, path).forEach((entry, index) => {
        const entryPath = `${path}[${index}]`;
        if (!Array.isArray(entry) || entry.length !== 2)
            fail(entryPath, "must be a [slot, item] pair");
        const slot = string(entry[0], `${entryPath}[0]`, { nonEmpty: true });
        if (seen.has(slot)) fail(`${entryPath}[0]`, `duplicates clothing slot '${slot}'`);
        seen.add(slot);

        const item = record(entry[1], `${entryPath}[1]`);
        same(
            string(required(item, "slot", `${entryPath}[1]`), `${entryPath}[1].slot`, {
                nonEmpty: true,
            }),
            slot,
            `${entryPath}[1].slot`,
            "the clothing map key",
        );
        string(required(item, "id", `${entryPath}[1]`), `${entryPath}[1].id`, { nonEmpty: true });
        finiteNumber(
            required(item, "durability", `${entryPath}[1]`),
            `${entryPath}[1].durability`,
            {
                min: 0,
                max: 1,
            },
        );
        finiteNumber(required(item, "wetness", `${entryPath}[1]`), `${entryPath}[1].wetness`, {
            min: 0,
            max: 1,
        });
        finiteNumber(
            required(item, "genderBias", `${entryPath}[1]`),
            `${entryPath}[1].genderBias`,
            {
                min: -1,
                max: 1,
            },
        );
    });
}

function validateCharacterCore(data, path) {
    validateStats(required(data, "stats", path), `${path}.stats`);
    record(required(data, "pronouns", path), `${path}.pronouns`);
    validateClothing(required(data, "clothing", path), `${path}.clothing`);
    validateBody(required(data, "body", path), `${path}.body`);
}

function validateCurrentStory(value, path, gameTime) {
    if (value === null) return null;
    const frame = record(value, path);
    const type = string(required(frame, "type", path), `${path}.type`, { nonEmpty: true });
    if (type !== "scene" && type !== "sequence") {
        fail(`${path}.type`, "must be 'scene' or 'sequence'");
    }
    string(required(frame, "id", path), `${path}.id`, { nonEmpty: true });
    const hasSystem = Object.prototype.hasOwnProperty.call(frame, "system");
    if (hasSystem && type !== "sequence") {
        fail(`${path}.system`, "is only valid for sequence story state");
    }
    if (type === "sequence" && hasSystem) {
        if (Object.prototype.hasOwnProperty.call(frame, "passageId")) {
            fail(`${path}.passageId`, "is not valid for system-backed sequence state");
        }
        if (Object.prototype.hasOwnProperty.call(frame, "resolution")) {
            fail(`${path}.resolution`, "is not valid for system-backed sequence state");
        }
        const systemPath = `${path}.system`;
        const system = record(frame.system, systemPath);
        const systemId = string(required(system, "id", systemPath), `${systemPath}.id`, {
            nonEmpty: true,
        });
        string(required(system, "instanceKey", systemPath), `${systemPath}.instanceKey`, {
            nonEmpty: true,
        });
        integer(required(system, "revision", systemPath), `${systemPath}.revision`, { min: 0 });
        const state = required(system, "state", systemPath);
        validateJsonValue(state, `${systemPath}.state`);
        try {
            validateWGSystemState(systemId, state);
        } catch (error) {
            fail(`${systemPath}.state`, error.message);
        }
    } else if (type === "sequence") {
        string(required(frame, "passageId", path), `${path}.passageId`, { nonEmpty: true });
    } else if (Object.prototype.hasOwnProperty.call(frame, "passageId")) {
        fail(`${path}.passageId`, "is only valid for sequence story state");
    }
    if (!hasSystem) {
        const resolutionPath = `${path}.resolution`;
        const resolution = record(required(frame, "resolution", path), resolutionPath);
        integer(required(resolution, "revision", resolutionPath), `${resolutionPath}.revision`, {
            min: 0,
        });
        const decisions = record(
            required(resolution, "decisions", resolutionPath),
            `${resolutionPath}.decisions`,
        );
        for (const [key, decision] of Object.entries(decisions)) {
            string(key, `${resolutionPath}.decisions key`, { nonEmpty: true });
            if (typeof decision === "number") {
                integer(decision, `${resolutionPath}.decisions.${key}`, { min: -1 });
            } else if (decision !== "success" && decision !== "failure") {
                fail(
                    `${resolutionPath}.decisions.${key}`,
                    "must be a branch index, 'success', or 'failure'",
                );
            }
        }
    }
    if (Object.prototype.hasOwnProperty.call(frame, "schoolClass")) {
        if (type !== "sequence") {
            fail(`${path}.schoolClass`, "is only valid for sequence story state");
        }
        if (hasSystem) {
            fail(`${path}.schoolClass`, "is not valid for system-backed sequence state");
        }
        const schoolClassPath = `${path}.schoolClass`;
        const schoolClass = record(frame.schoolClass, schoolClassPath);
        string(required(schoolClass, "periodId", schoolClassPath), `${schoolClassPath}.periodId`, {
            nonEmpty: true,
        });
        const subjectId = string(
            required(schoolClass, "subjectId", schoolClassPath),
            `${schoolClassPath}.subjectId`,
            { nonEmpty: true },
        );
        if (!SCHOOL_SUBJECTS[subjectId]) {
            fail(`${schoolClassPath}.subjectId`, `references unknown school subject '${subjectId}'`);
        }
        const scheduledAt = dateMilliseconds(
            required(schoolClass, "scheduledAt", schoolClassPath),
            `${schoolClassPath}.scheduledAt`,
        );
        const arrivedAt = dateMilliseconds(
            required(schoolClass, "arrivedAt", schoolClassPath),
            `${schoolClassPath}.arrivedAt`,
        );
        if (scheduledAt > arrivedAt) {
            fail(`${schoolClassPath}.scheduledAt`, "must not be later than arrival time");
        }
        if (arrivedAt > gameTime) {
            fail(`${schoolClassPath}.arrivedAt`, "must not be later than the game clock");
        }
        finiteNumber(
            required(schoolClass, "minutesLate", schoolClassPath),
            `${schoolClassPath}.minutesLate`,
            { min: 0 },
        );
        integer(
            required(schoolClass, "startingSegment", schoolClassPath),
            `${schoolClassPath}.startingSegment`,
            { min: 1 },
        );
    }
    return frame;
}

function validateStoryContinuations(value, path, gameTime) {
    return array(value, path).map((itemData, index) => {
        const itemPath = `${path}[${index}]`;
        const item = record(itemData, itemPath);
        const target = string(required(item, "target", itemPath), `${itemPath}.target`, {
            nonEmpty: true,
        });
        const sequenceId = optionalNullableString(
            required(item, "sequenceId", itemPath),
            `${itemPath}.sequenceId`,
        );
        const sourcePassageId = optionalNullableString(
            required(item, "sourcePassageId", itemPath),
            `${itemPath}.sourcePassageId`,
        );
        string(required(item, "poolId", itemPath), `${itemPath}.poolId`, { nonEmpty: true });
        string(required(item, "entryId", itemPath), `${itemPath}.entryId`, { nonEmpty: true });
        string(required(item, "sourceStoryId", itemPath), `${itemPath}.sourceStoryId`, {
            nonEmpty: true,
        });
        string(required(item, "sourceChoiceId", itemPath), `${itemPath}.sourceChoiceId`, {
            nonEmpty: true,
        });

        if (target.startsWith(".") && (!sequenceId || !sourcePassageId)) {
            fail(itemPath, "local continuation targets require sequence and source passage ids");
        }

        const schoolClassValue = required(item, "schoolClass", itemPath);
        if (schoolClassValue !== null) {
            const schoolPath = `${itemPath}.schoolClass`;
            const schoolClass = record(schoolClassValue, schoolPath);
            string(required(schoolClass, "periodId", schoolPath), `${schoolPath}.periodId`, {
                nonEmpty: true,
            });
            const subjectId = string(
                required(schoolClass, "subjectId", schoolPath),
                `${schoolPath}.subjectId`,
                { nonEmpty: true },
            );
            if (!SCHOOL_SUBJECTS[subjectId]) {
                fail(`${schoolPath}.subjectId`, `references unknown school subject '${subjectId}'`);
            }
            const scheduledAt = dateMilliseconds(
                required(schoolClass, "scheduledAt", schoolPath),
                `${schoolPath}.scheduledAt`,
            );
            const arrivedAt = dateMilliseconds(
                required(schoolClass, "arrivedAt", schoolPath),
                `${schoolPath}.arrivedAt`,
            );
            if (scheduledAt > arrivedAt) {
                fail(`${schoolPath}.scheduledAt`, "must not be later than arrival time");
            }
            if (arrivedAt > gameTime) {
                fail(`${schoolPath}.arrivedAt`, "must not be later than the game clock");
            }
            finiteNumber(
                required(schoolClass, "minutesLate", schoolPath),
                `${schoolPath}.minutesLate`,
                { min: 0 },
            );
            integer(
                required(schoolClass, "startingSegment", schoolPath),
                `${schoolPath}.startingSegment`,
                { min: 1 },
            );
        }
        return item;
    });
}

function validatePlayer(data, path, npcIds, gameTime) {
    const player = record(data, path);
    validateCharacterCore(player, path);
    const storedStats = record(required(player, "stats", path), `${path}.stats`);
    for (const [name, definition] of Object.entries(STATS)) {
        const present = Object.prototype.hasOwnProperty.call(storedStats, name);
        if (definition.derived && present) {
            fail(`${path}.stats.${name}`, "must not store a body-derived stat");
        }
        if (!definition.derived && !present) {
            fail(`${path}.stats.${name}`, "is required");
        }
    }
    record(required(player, "appearance", path), `${path}.appearance`);
    string(required(player, "skinTone", path), `${path}.skinTone`, { nonEmpty: true });
    string(required(player, "eyeColor", path), `${path}.eyeColor`, { nonEmpty: true });
    string(required(player, "hairColor", path), `${path}.hairColor`, { nonEmpty: true });
    const age = integer(required(player, "age", path), `${path}.age`, { min: 0 });
    const birthDate = dateMilliseconds(required(player, "birthDate", path), `${path}.birthDate`);
    same(
        age,
        ageAtDate(new Date(birthDate), new Date(gameTime)),
        `${path}.age`,
        "the birth date and game clock",
    );
    string(required(player, "gender", path), `${path}.gender`, { nonEmpty: true });
    finiteNumber(required(player, "money", path), `${path}.money`);
    const temperature = string(
        required(player, "temperature", path),
        `${path}.temperature`,
        { nonEmpty: true },
    );
    if (!PLAYER_TEMPERATURES.has(temperature)) {
        fail(`${path}.temperature`, `has unknown comfort value '${temperature}'`);
    }
    validateRelationships(required(player, "relationships", path), `${path}.relationships`, npcIds);

    const seenSkills = new Set();
    array(required(player, "skills", path), `${path}.skills`).forEach((entry, index) => {
        const entryPath = `${path}.skills[${index}]`;
        if (!Array.isArray(entry) || entry.length !== 2)
            fail(entryPath, "must be a [name, skill] pair");
        const name = string(entry[0], `${entryPath}[0]`, { nonEmpty: true });
        if (seenSkills.has(name)) fail(`${entryPath}[0]`, `duplicates skill '${name}'`);
        seenSkills.add(name);
        const definition = SKILLS[name];
        if (!definition) fail(`${entryPath}[0]`, `references unknown skill '${name}'`);
        finiteNumber(entry[1], `${entryPath}[1]`, {
            min: definition.min,
            max: definition.max,
        });
    });
    for (const name of Object.keys(SKILLS)) {
        if (!seenSkills.has(name)) fail(`${path}.skills`, `is missing registered skill '${name}'`);
    }

    const education = record(required(player, "education", path), `${path}.education`);
    const subjects = record(
        required(education, "subjects", `${path}.education`),
        `${path}.education.subjects`,
    );
    for (const id of Object.keys(subjects)) {
        if (!SCHOOL_SUBJECTS[id]) {
            fail(`${path}.education.subjects.${id}`, `references unknown school subject '${id}'`);
        }
    }
    for (const id of Object.keys(SCHOOL_SUBJECTS)) {
        const subjectPath = `${path}.education.subjects.${id}`;
        const subject = record(required(subjects, id, `${path}.education.subjects`), subjectPath);
        finiteNumber(required(subject, "grade", subjectPath), `${subjectPath}.grade`, {
            min: SUBJECT_GRADE_MIN,
            max: SUBJECT_GRADE_MAX,
        });
        integer(
            required(subject, "attendedSegments", subjectPath),
            `${subjectPath}.attendedSegments`,
            { min: 0 },
        );
    }
}

function strictTime(value, path) {
    const text = string(value, path, { nonEmpty: true });
    const match = /^(\d{2}):(\d{2})$/.exec(text);
    if (!match) fail(path, "must use HH:MM format");
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) {
        fail(path, "must be a valid 24-hour time (24:00 is the only allowed hour 24 value)");
    }
    return hour * 60 + minute;
}

function validateSchedule(scheduleData, path) {
    const schedule = record(scheduleData, path);
    for (const day of DAY_KEYS) {
        array(required(schedule, day, path), `${path}.${day}`).forEach((slotData, index) => {
            const slotPath = `${path}.${day}[${index}]`;
            const slot = record(slotData, slotPath);
            const from = strictTime(required(slot, "from", slotPath), `${slotPath}.from`);
            const to = strictTime(required(slot, "to", slotPath), `${slotPath}.to`);
            if (from === to) fail(slotPath, "must not have identical opening and closing times");
        });
    }
}

function validateMap(data, path) {
    const map = record(data, path);
    const locations = new Map();
    const places = new Map();
    const registeredPlaceDefinitions = new Map(
        PLACE_REGISTRY.map((definition) => [String(definition.key), definition]),
    );
    const registeredPlaceCounts = new Map(
        PLACE_REGISTRY.map((definition) => [String(definition.key), 0]),
    );

    array(required(map, "locations", path), `${path}.locations`).forEach((locationData, index) => {
        const locationPath = `${path}.locations[${index}]`;
        const location = record(locationData, locationPath);
        const id = string(required(location, "id", locationPath), `${locationPath}.id`, {
            nonEmpty: true,
        });
        if (locations.has(id)) fail(`${locationPath}.id`, `duplicates location '${id}'`);
        string(required(location, "name", locationPath), `${locationPath}.name`, {
            nonEmpty: true,
        });
        finiteNumber(required(location, "x", locationPath), `${locationPath}.x`);
        finiteNumber(required(location, "y", locationPath), `${locationPath}.y`);
        optionalNullableString(
            required(location, "districtKey", locationPath),
            `${locationPath}.districtKey`,
        );
        uniqueStrings(required(location, "tags", locationPath), `${locationPath}.tags`, {
            nonEmpty: true,
        });
        record(required(location, "meta", locationPath), `${locationPath}.meta`);

        const localPlaces = new Map();
        array(required(location, "places", locationPath), `${locationPath}.places`).forEach(
            (placeData, placeIndex) => {
                const placePath = `${locationPath}.places[${placeIndex}]`;
                const place = record(placeData, placePath);
                const placeId = string(required(place, "id", placePath), `${placePath}.id`, {
                    nonEmpty: true,
                });
                if (places.has(placeId))
                    fail(`${placePath}.id`, `duplicates world place '${placeId}'`);
                same(
                    string(required(place, "locationId", placePath), `${placePath}.locationId`, {
                        nonEmpty: true,
                    }),
                    id,
                    `${placePath}.locationId`,
                    "its containing location",
                );
                const placeKey = string(
                    required(place, "key", placePath),
                    `${placePath}.key`,
                    { nonEmpty: true },
                );
                if (registeredPlaceCounts.has(placeKey)) {
                    registeredPlaceCounts.set(
                        placeKey,
                        registeredPlaceCounts.get(placeKey) + 1,
                    );
                }
                string(required(place, "name", placePath), `${placePath}.name`, { nonEmpty: true });
                const unlocked = boolean(
                    required(place, "unlocked", placePath),
                    `${placePath}.unlocked`,
                );
                if (registeredPlaceDefinitions.get(placeKey)?.unlocked === true && !unlocked) {
                    fail(
                        `${placePath}.unlocked`,
                        "cannot relock a place that starts unlocked",
                    );
                }
                const props = record(required(place, "props", placePath), `${placePath}.props`);
                validateSchedule(
                    required(props, "openingHours", `${placePath}.props`),
                    `${placePath}.props.openingHours`,
                );
                if (Object.prototype.hasOwnProperty.call(props, "category")) {
                    uniqueStrings(props.category, `${placePath}.props.category`, {
                        nonEmpty: true,
                    });
                }
                if (Object.prototype.hasOwnProperty.call(props, "ages")) {
                    const ages = record(props.ages, `${placePath}.props.ages`);
                    const min = Object.prototype.hasOwnProperty.call(ages, "min")
                        ? finiteNumber(ages.min, `${placePath}.props.ages.min`, { min: 0 })
                        : null;
                    const max = Object.prototype.hasOwnProperty.call(ages, "max")
                        ? finiteNumber(ages.max, `${placePath}.props.ages.max`, { min: 0 })
                        : null;
                    if (min != null && max != null && min > max) {
                        fail(
                            `${placePath}.props.ages`,
                            "has a minimum age greater than its maximum age",
                        );
                    }
                }
                if (Object.prototype.hasOwnProperty.call(props, "accessFlag")) {
                    string(props.accessFlag, `${placePath}.props.accessFlag`, {
                        nonEmpty: true,
                    });
                }
                localPlaces.set(placeId, place);
                places.set(placeId, { locationId: id, data: place, path: placePath });
            },
        );
        locations.set(id, { data: location, path: locationPath, places: localPlaces });
    });

    if (locations.size === 0) fail(`${path}.locations`, "must contain at least one location");
    for (const definition of PLACE_REGISTRY) {
        const placeKey = String(definition.key);
        const count = registeredPlaceCounts.get(placeKey) || 0;
        const expected = getPlaceInstanceTarget(definition, locations.size);
        if (count !== expected) {
            fail(
                `${path}.locations`,
                `must contain ${expected} registered place instance(s) with key '${placeKey}' (found ${count})`,
            );
        }
    }

    const adjacency = new Map([...locations.keys()].map((id) => [id, new Map()]));
    const edgePairs = new Set();
    array(required(map, "edges", path), `${path}.edges`).forEach((edgeData, index) => {
        const edgePath = `${path}.edges[${index}]`;
        const edge = record(edgeData, edgePath);
        const a = string(required(edge, "a", edgePath), `${edgePath}.a`, { nonEmpty: true });
        const b = string(required(edge, "b", edgePath), `${edgePath}.b`, { nonEmpty: true });
        if (!locations.has(a)) fail(`${edgePath}.a`, `references unknown location '${a}'`);
        if (!locations.has(b)) fail(`${edgePath}.b`, `references unknown location '${b}'`);
        if (a === b) fail(edgePath, "must connect two different locations");
        const pair = [a, b].sort().join("\u0000");
        if (edgePairs.has(pair)) fail(edgePath, `duplicates edge '${a}' <-> '${b}'`);
        edgePairs.add(pair);
        const minutes = finiteNumber(required(edge, "minutes", edgePath), `${edgePath}.minutes`, {
            min: 1,
            max: 5,
        });
        string(required(edge, "streetName", edgePath), `${edgePath}.streetName`, {
            nonEmpty: true,
        });
        adjacency.get(a).set(b, minutes);
        adjacency.get(b).set(a, minutes);
    });

    const firstLocation = locations.keys().next().value;
    const reached = new Set([firstLocation]);
    const queue = [firstLocation];
    while (queue.length) {
        const current = queue.shift();
        for (const neighbor of adjacency.get(current).keys()) {
            if (reached.has(neighbor)) continue;
            reached.add(neighbor);
            queue.push(neighbor);
        }
    }
    if (reached.size !== locations.size)
        fail(`${path}.edges`, "must connect every location in one graph");

    for (const definition of PLACE_REGISTRY) {
        if (definition.distribution?.kind !== PLACE_DISTRIBUTION_KIND.graphCoverage) continue;
        const maximumDistance = Number(definition.distribution.maxGraphDistance);
        if (!Number.isFinite(maximumDistance)) continue;

        const targetLocations = new Set(
            [...locations]
                .filter(([, location]) =>
                    [...location.places.values()].some(
                        (place) => String(place.key) === String(definition.key),
                    ),
                )
                .map(([locationId]) => locationId),
        );
        for (const locationId of locations.keys()) {
            const coverageQueue = [[locationId, 0]];
            const coverageSeen = new Set([locationId]);
            let covered = false;
            while (coverageQueue.length) {
                const [currentId, distance] = coverageQueue.shift();
                if (targetLocations.has(currentId)) {
                    covered = distance <= maximumDistance;
                    break;
                }
                if (distance >= maximumDistance) continue;
                for (const neighborId of adjacency.get(currentId).keys()) {
                    if (coverageSeen.has(neighborId)) continue;
                    coverageSeen.add(neighborId);
                    coverageQueue.push([neighborId, distance + 1]);
                }
            }
            if (!covered) {
                fail(
                    `${path}.locations`,
                    `must place '${definition.key}' within ${maximumDistance} graph hop(s) of every location`,
                );
            }
        }
    }

    return { locations, places, adjacency };
}

function validateCalendar(data, path, worldYear) {
    const calendar = record(data, path);
    const year = integer(required(calendar, "year", path), `${path}.year`, { min: 1, max: 9999 });
    same(year, worldYear, `${path}.year`, "the world clock year");

    const expectedNames = new Set(RANDOM_HOLIDAYS.map((definition) => definition.name));
    const seenNames = new Set();
    const seenDates = new Set();
    array(
        required(calendar, "randomHolidayAssignments", path),
        `${path}.randomHolidayAssignments`,
    ).forEach((entry, index) => {
        const entryPath = `${path}.randomHolidayAssignments[${index}]`;
        if (!Array.isArray(entry) || entry.length !== 2)
            fail(entryPath, "must be a [name, date] pair");
        const name = string(entry[0], `${entryPath}[0]`, { nonEmpty: true });
        if (!expectedNames.has(name)) fail(`${entryPath}[0]`, `is not a registered random holiday`);
        if (seenNames.has(name)) fail(`${entryPath}[0]`, `duplicates holiday '${name}'`);
        seenNames.add(name);
        const assignment = record(entry[1], `${entryPath}[1]`);
        const month = integer(
            required(assignment, "month", `${entryPath}[1]`),
            `${entryPath}[1].month`,
            {
                min: 1,
                max: 12,
            },
        );
        const day = integer(required(assignment, "day", `${entryPath}[1]`), `${entryPath}[1].day`, {
            min: 1,
            max: MONTH_DAYS[month - 1],
        });
        const dateKey = `${month}-${day}`;
        if (seenDates.has(dateKey))
            fail(`${entryPath}[1]`, `duplicates random holiday date '${dateKey}'`);
        seenDates.add(dateKey);
    });
    if (seenNames.size !== expectedNames.size) {
        fail(
            `${path}.randomHolidayAssignments`,
            "must assign every registered random holiday exactly once",
        );
    }
}

function validateWeather(data, path, expectedSeed, worldTime) {
    const weather = record(data, path);
    same(
        integer(required(weather, "version", path), `${path}.version`),
        WEATHER_SAVE_VERSION,
        `${path}.version`,
        "the current weather save version",
    );
    same(
        integer(required(weather, "algorithmVersion", path), `${path}.algorithmVersion`),
        WEATHER_ALGORITHM_VERSION,
        `${path}.algorithmVersion`,
        "the current weather algorithm version",
    );
    same(
        uint32(required(weather, "seed", path), `${path}.seed`),
        expectedSeed,
        `${path}.seed`,
        "the world seed",
    );

    const validateSnapshot = (snapshotData, snapshotPath) => {
        const snapshot = record(snapshotData, snapshotPath);
        const date = dateMilliseconds(
            required(snapshot, "date", snapshotPath),
            `${snapshotPath}.date`,
        );
        const kind = string(required(snapshot, "kind", snapshotPath), `${snapshotPath}.kind`, {
            nonEmpty: true,
        });
        if (!WEATHER_TYPES.has(kind))
            fail(`${snapshotPath}.kind`, `has unknown weather kind '${kind}'`);
        const runHours = integer(
            required(snapshot, "runHours", snapshotPath),
            `${snapshotPath}.runHours`,
            {
                min: 0,
            },
        );
        return { date, kind, runHours };
    };

    const origin = validateSnapshot(required(weather, "origin", path), `${path}.origin`);
    const current = validateSnapshot(required(weather, "current", path), `${path}.current`);
    if (origin.date > current.date) fail(`${path}.current.date`, "precedes the weather origin");
    same(current.date, worldTime, `${path}.current.date`, "the world clock");
    same(
        dateMilliseconds(required(weather, "date", path), `${path}.date`),
        current.date,
        `${path}.date`,
        "the current weather date",
    );
    same(
        string(required(weather, "state", path), `${path}.state`),
        current.kind,
        `${path}.state`,
        "the current weather kind",
    );
    same(
        integer(required(weather, "runHours", path), `${path}.runHours`, { min: 0 }),
        current.runHours,
        `${path}.runHours`,
        "the current weather run length",
    );
}

function placeAt(mapIndex, locationId, placeId, path) {
    const location = mapIndex.locations.get(locationId);
    if (!location) fail(path, `references unknown location '${locationId}'`);
    if (placeId == null) return null;
    const place = location.places.get(placeId);
    if (!place) fail(path, `references unknown place '${placeId}' in location '${locationId}'`);
    return place;
}

function validateTargetDescriptor(data, path) {
    const descriptor = record(data, path);
    const type = string(required(descriptor, "type", path), `${path}.type`, { nonEmpty: true });
    if (!TARGET_TYPES.has(type) || type === TARGET_TYPE.home) {
        fail(`${path}.type`, `has unsupported place target type '${type}'`);
    }
    uniqueStrings(required(descriptor, "candidates", path), `${path}.candidates`, {
        nonEmpty: true,
    });
    if (Object.prototype.hasOwnProperty.call(descriptor, "nearest")) {
        boolean(descriptor.nearest, `${path}.nearest`);
    }
}

function descriptorMatchesPlace(descriptor, place) {
    if (!descriptor || !place) return false;
    const candidates = Array.isArray(descriptor.candidates) ? descriptor.candidates : [];
    if (descriptor.type === TARGET_TYPE.placeKeys) return candidates.includes(place.key);
    if (descriptor.type === TARGET_TYPE.placeCategory) {
        const categories = Array.isArray(place.props?.category) ? place.props.category : [];
        return categories.some((category) => candidates.includes(category));
    }
    return false;
}

function validateBehavior(data, path) {
    const behavior = record(data, path);
    const rules = new Map();
    array(required(behavior, "goals", path), `${path}.goals`).forEach((ruleData, index) => {
        const rulePath = `${path}.goals[${index}]`;
        const rule = record(ruleData, rulePath);
        const id = string(required(rule, "id", rulePath), `${rulePath}.id`, { nonEmpty: true });
        if (rules.has(id)) fail(`${rulePath}.id`, `duplicates behavior goal '${id}'`);
        const type = string(required(rule, "type", rulePath), `${rulePath}.type`, {
            nonEmpty: true,
        });
        if (!GOAL_TYPES.has(type)) fail(`${rulePath}.type`, `has unknown goal type '${type}'`);
        finiteNumber(required(rule, "priority", rulePath), `${rulePath}.priority`);
        if (Object.prototype.hasOwnProperty.call(rule, "weight")) {
            finiteNumber(rule.weight, `${rulePath}.weight`, { min: 0 });
        }

        const when = record(required(rule, "when", rulePath), `${rulePath}.when`);
        strictTime(required(when, "from", `${rulePath}.when`), `${rulePath}.when.from`);
        strictTime(required(when, "to", `${rulePath}.when`), `${rulePath}.when.to`);
        if (Object.prototype.hasOwnProperty.call(when, "schoolDay")) {
            boolean(when.schoolDay, `${rulePath}.when.schoolDay`);
        }
        if (Object.prototype.hasOwnProperty.call(when, "dayKinds")) {
            array(when.dayKinds, `${rulePath}.when.dayKinds`).forEach((value, dayIndex) => {
                if (!DAY_KINDS.has(value))
                    fail(
                        `${rulePath}.when.dayKinds[${dayIndex}]`,
                        `has unknown day kind '${value}'`,
                    );
            });
        }
        if (Object.prototype.hasOwnProperty.call(when, "daysOfWeek")) {
            array(when.daysOfWeek, `${rulePath}.when.daysOfWeek`).forEach((value, dayIndex) => {
                const valid =
                    (typeof value === "number" &&
                        Number.isInteger(value) &&
                        value >= 0 &&
                        value <= 6) ||
                    (typeof value === "string" && DAY_KEYS_SET.has(value));
                if (!valid)
                    fail(`${rulePath}.when.daysOfWeek[${dayIndex}]`, `has invalid day '${value}'`);
            });
        }

        const descriptors = [];
        if (Object.prototype.hasOwnProperty.call(rule, "target"))
            descriptors.push([rule.target, `${rulePath}.target`]);
        if (Object.prototype.hasOwnProperty.call(rule, "targets")) {
            array(rule.targets, `${rulePath}.targets`).forEach((descriptor, targetIndex) =>
                descriptors.push([descriptor, `${rulePath}.targets[${targetIndex}]`]),
            );
        }
        if (type !== GOAL_TYPE.home && descriptors.length === 0) {
            fail(rulePath, "must define at least one target descriptor");
        }
        descriptors.forEach(([descriptor, descriptorPath]) =>
            validateTargetDescriptor(descriptor, descriptorPath),
        );
        if (Object.prototype.hasOwnProperty.call(rule, "disallowedTargets")) {
            array(rule.disallowedTargets, `${rulePath}.disallowedTargets`).forEach(
                (descriptor, targetIndex) =>
                    validateTargetDescriptor(
                        descriptor,
                        `${rulePath}.disallowedTargets[${targetIndex}]`,
                    ),
            );
        }
        if (Object.prototype.hasOwnProperty.call(rule, "requireOpen")) {
            boolean(rule.requireOpen, `${rulePath}.requireOpen`);
        }
        if (Object.prototype.hasOwnProperty.call(rule, "stayMinutes")) {
            const stay = record(rule.stayMinutes, `${rulePath}.stayMinutes`);
            const min = finiteNumber(
                required(stay, "min", `${rulePath}.stayMinutes`),
                `${rulePath}.stayMinutes.min`,
                {
                    min: Number.MIN_VALUE,
                },
            );
            const max = finiteNumber(
                required(stay, "max", `${rulePath}.stayMinutes`),
                `${rulePath}.stayMinutes.max`,
                {
                    min,
                },
            );
            if (max < min)
                fail(`${rulePath}.stayMinutes.max`, "must not be less than the minimum stay");
        }
        rules.set(id, rule);
    });
    return rules;
}

function validateBrain(data, path, context) {
    const brain = record(data, path);
    const lastUpdatedAt = dateMilliseconds(
        required(brain, "lastUpdatedAt", path),
        `${path}.lastUpdatedAt`,
    );
    same(lastUpdatedAt, context.gameTime, `${path}.lastUpdatedAt`, "the game clock");
    const nextDecisionAt = dateMilliseconds(
        required(brain, "nextDecisionAt", path),
        `${path}.nextDecisionAt`,
    );
    if (nextDecisionAt <= lastUpdatedAt)
        fail(`${path}.nextDecisionAt`, "must be after the last update");

    const goalData = required(brain, "currentGoal", path);
    let goal = null;
    if (goalData !== null) {
        const goalPath = `${path}.currentGoal`;
        goal = record(goalData, goalPath);
        const ruleId = string(required(goal, "ruleId", goalPath), `${goalPath}.ruleId`, {
            nonEmpty: true,
        });
        const rule = context.rules.get(ruleId);
        if (!rule) fail(`${goalPath}.ruleId`, `references unknown behavior goal '${ruleId}'`);
        same(
            string(required(goal, "type", goalPath), `${goalPath}.type`, { nonEmpty: true }),
            rule.type,
            `${goalPath}.type`,
            "the referenced behavior goal type",
        );
        const priority = finiteNumber(required(goal, "priority", goalPath), `${goalPath}.priority`);
        same(
            priority,
            Number(rule.priority) || 0,
            `${goalPath}.priority`,
            "the referenced behavior goal priority",
        );
        const startedAt = dateMilliseconds(
            required(goal, "startedAt", goalPath),
            `${goalPath}.startedAt`,
        );
        const windowStart = dateMilliseconds(
            required(goal, "windowStart", goalPath),
            `${goalPath}.windowStart`,
        );
        const windowEnd = dateMilliseconds(
            required(goal, "windowEnd", goalPath),
            `${goalPath}.windowEnd`,
        );
        if (windowStart >= windowEnd)
            fail(`${goalPath}.windowEnd`, "must be after the goal window start");
        if (startedAt > context.gameTime) fail(`${goalPath}.startedAt`, "cannot be in the future");
        if (rule.type === GOAL_TYPE.obligation) {
            const earlyArrivalMinutes = integer(
                required(goal, "earlyArrivalMinutes", goalPath),
                `${goalPath}.earlyArrivalMinutes`,
                OBLIGATION_EARLY_ARRIVAL_MINUTES,
            );
            const requiredArrivalAt = dateMilliseconds(
                required(goal, "requiredArrivalAt", goalPath),
                `${goalPath}.requiredArrivalAt`,
            );
            same(
                requiredArrivalAt,
                windowStart - earlyArrivalMinutes * MS_PER_MINUTE,
                `${goalPath}.requiredArrivalAt`,
                "the obligation window start minus its early-arrival time",
            );
        }
        const targetLocationId = string(
            required(goal, "targetLocationId", goalPath),
            `${goalPath}.targetLocationId`,
            { nonEmpty: true },
        );
        const targetPlaceId = optionalNullableString(
            required(goal, "targetPlaceId", goalPath),
            `${goalPath}.targetPlaceId`,
        );
        const targetPlace = placeAt(
            context.mapIndex,
            targetLocationId,
            targetPlaceId,
            `${goalPath}.targetPlaceId`,
        );
        if (rule.type === GOAL_TYPE.home) {
            same(
                targetLocationId,
                context.npc.homeLocationId,
                `${goalPath}.targetLocationId`,
                "the NPC home location",
            );
            same(
                targetPlaceId,
                context.npc.homePlaceId,
                `${goalPath}.targetPlaceId`,
                "the NPC home place",
            );
        } else {
            if (!targetPlace)
                fail(`${goalPath}.targetPlaceId`, "is required for a place-targeting goal");
            const allowed = [rule.target, ...(rule.targets || [])]
                .filter(Boolean)
                .some((descriptor) => descriptorMatchesPlace(descriptor, targetPlace));
            if (!allowed)
                fail(
                    `${goalPath}.targetPlaceId`,
                    "does not match the referenced behavior goal targets",
                );
            const disallowed = (rule.disallowedTargets || []).some((descriptor) =>
                descriptorMatchesPlace(descriptor, targetPlace),
            );
            if (disallowed)
                fail(`${goalPath}.targetPlaceId`, "matches a disallowed behavior target");
        }
    }

    const actionData = required(brain, "currentAction", path);
    if (actionData === null) return;
    const actionPath = `${path}.currentAction`;
    const action = record(actionData, actionPath);
    const type = string(required(action, "type", actionPath), `${actionPath}.type`, {
        nonEmpty: true,
    });
    if (!ACTION_TYPES.has(type))
        fail(`${actionPath}.type`, `has unknown NPC action type '${type}'`);
    const startedAt = dateMilliseconds(
        required(action, "startedAt", actionPath),
        `${actionPath}.startedAt`,
    );
    if (type === NPC_ACTION_TYPE.idle) {
        if (startedAt > context.gameTime) {
            fail(`${actionPath}.startedAt`, "cannot be in the future");
        }
        if (goal) fail(actionPath, "an idle action cannot have a current goal");
        return;
    }

    if (
        type === NPC_ACTION_TYPE.stay ||
        type === NPC_ACTION_TYPE.temporaryStay
    ) {
        if (startedAt > context.gameTime) {
            fail(`${actionPath}.startedAt`, "cannot be in the future");
        }
        const until = dateMilliseconds(
            required(action, "until", actionPath),
            `${actionPath}.until`,
        );
        if (until <= context.gameTime) fail(`${actionPath}.until`, "must be after the game clock");
        const locationId = string(
            required(action, "locationId", actionPath),
            `${actionPath}.locationId`,
            {
                nonEmpty: true,
            },
        );
        const placeId = optionalNullableString(
            required(action, "placeId", actionPath),
            `${actionPath}.placeId`,
        );
        placeAt(context.mapIndex, locationId, placeId, `${actionPath}.placeId`);
        same(locationId, context.npc.locationId, `${actionPath}.locationId`, "the NPC location");
        same(placeId, context.npc.currentPlaceId, `${actionPath}.placeId`, "the NPC current place");

        if (type === NPC_ACTION_TYPE.temporaryStay) {
            if (goal) fail(actionPath, "a temporary stay cannot have a current goal");
            return;
        }

        if (!goal) fail(actionPath, "stay requires a current goal");
        same(
            locationId,
            goal.targetLocationId,
            `${actionPath}.locationId`,
            "the current goal target",
        );
        same(placeId, goal.targetPlaceId, `${actionPath}.placeId`, "the current goal target place");
        return;
    }

    if (!goal) fail(actionPath, `${type} requires a current goal`);

    const arrivalAt = dateMilliseconds(
        required(action, "arrivalAt", actionPath),
        `${actionPath}.arrivalAt`,
    );
    if (arrivalAt <= context.gameTime)
        fail(`${actionPath}.arrivalAt`, "must be after the game clock");
    const fromLocationId = string(
        required(action, "fromLocationId", actionPath),
        `${actionPath}.fromLocationId`,
        { nonEmpty: true },
    );
    const fromPlaceId = optionalNullableString(
        required(action, "fromPlaceId", actionPath),
        `${actionPath}.fromPlaceId`,
    );
    const targetLocationId = string(
        required(action, "targetLocationId", actionPath),
        `${actionPath}.targetLocationId`,
        { nonEmpty: true },
    );
    const targetPlaceId = optionalNullableString(
        required(action, "targetPlaceId", actionPath),
        `${actionPath}.targetPlaceId`,
    );
    placeAt(context.mapIndex, fromLocationId, fromPlaceId, `${actionPath}.fromPlaceId`);
    placeAt(context.mapIndex, targetLocationId, targetPlaceId, `${actionPath}.targetPlaceId`);
    same(
        targetLocationId,
        goal.targetLocationId,
        `${actionPath}.targetLocationId`,
        "the current goal target",
    );
    same(
        targetPlaceId,
        goal.targetPlaceId,
        `${actionPath}.targetPlaceId`,
        "the current goal target place",
    );
    const leavePlaceMinutes = finiteNumber(
        required(action, "leavePlaceMinutes", actionPath),
        `${actionPath}.leavePlaceMinutes`,
        { min: 0 },
    );
    const enterPlaceMinutes = finiteNumber(
        required(action, "enterPlaceMinutes", actionPath),
        `${actionPath}.enterPlaceMinutes`,
        { min: 0 },
    );
    same(
        leavePlaceMinutes,
        fromPlaceId == null ? 0 : PLACE_LEAVE_MINUTES,
        `${actionPath}.leavePlaceMinutes`,
        "the shared place-leaving cost",
    );
    same(
        enterPlaceMinutes,
        targetPlaceId == null ? 0 : PLACE_ENTER_MINUTES,
        `${actionPath}.enterPlaceMinutes`,
        "the shared place-entering cost",
    );

    const route = record(required(action, "route", actionPath), `${actionPath}.route`);
    const locations = array(
        required(route, "locations", `${actionPath}.route`),
        `${actionPath}.route.locations`,
    );
    if (locations.length < 1)
        fail(`${actionPath}.route.locations`, "must contain at least one location");
    locations.forEach((locationId, index) => {
        const id = string(locationId, `${actionPath}.route.locations[${index}]`, {
            nonEmpty: true,
        });
        if (!context.mapIndex.locations.has(id)) {
            fail(`${actionPath}.route.locations[${index}]`, `references unknown location '${id}'`);
        }
    });
    same(locations[0], fromLocationId, `${actionPath}.route.locations[0]`, "the travel origin");
    same(
        locations[locations.length - 1],
        targetLocationId,
        `${actionPath}.route.locations[${locations.length - 1}]`,
        "the travel target",
    );

    const legMinutes = array(
        required(route, "legMinutes", `${actionPath}.route`),
        `${actionPath}.route.legMinutes`,
    );
    if (legMinutes.length !== locations.length - 1) {
        fail(`${actionPath}.route.legMinutes`, "must have one duration for every route edge");
    }
    let totalMinutes = 0;
    legMinutes.forEach((minutes, index) => {
        const value = finiteNumber(minutes, `${actionPath}.route.legMinutes[${index}]`, {
            min: Number.MIN_VALUE,
        });
        const expected = context.mapIndex.adjacency
            .get(locations[index])
            ?.get(locations[index + 1]);
        if (expected == null) {
            fail(
                `${actionPath}.route.locations[${index + 1}]`,
                "is not adjacent to the previous route location",
            );
        }
        same(
            value,
            expected,
            `${actionPath}.route.legMinutes[${index}]`,
            "the world-map edge duration",
        );
        totalMinutes += value;
    });
    same(
        arrivalAt - startedAt,
        (leavePlaceMinutes + totalMinutes + enterPlaceMinutes) * 60 * 1000,
        `${actionPath}.arrivalAt`,
        "the route and place-transition duration",
    );

    const currentLegIndex = integer(
        required(route, "currentLegIndex", `${actionPath}.route`),
        `${actionPath}.route.currentLegIndex`,
        { min: 0, max: locations.length - 1 },
    );
    same(
        context.npc.locationId,
        locations[currentLegIndex],
        `${context.path}.locationId`,
        "the route's current leg",
    );
    const leaveCompletesAt = startedAt + leavePlaceMinutes * 60 * 1000;
    if (context.gameTime < leaveCompletesAt) {
        same(
            context.npc.currentPlaceId,
            fromPlaceId,
            `${context.path}.currentPlaceId`,
            "the travel origin before leaving completes",
        );
    } else if (context.npc.currentPlaceId !== null) {
        fail(`${context.path}.currentPlaceId`, "must be null after leaving while traveling");
    }
}

function validateNPC(data, path, context) {
    const npc = record(data, path);
    validateCharacterCore(npc, path);
    string(required(npc, "id", path), `${path}.id`, { nonEmpty: true });
    string(required(npc, "name", path), `${path}.name`, { nonEmpty: true });
    const age = required(npc, "age", path);
    if (age !== null) finiteNumber(age, `${path}.age`, { min: 0 });
    string(required(npc, "gender", path), `${path}.gender`, { nonEmpty: true });
    record(required(npc, "flags", path), `${path}.flags`);
    validateRelationships(required(npc, "relationships", path), `${path}.relationships`);
    record(required(npc, "meta", path), `${path}.meta`);

    const locationId = string(required(npc, "locationId", path), `${path}.locationId`, {
        nonEmpty: true,
    });
    if (!context.mapIndex.locations.has(locationId)) {
        fail(`${path}.locationId`, `references unknown location '${locationId}'`);
    }
    const currentPlaceId = optionalNullableString(
        required(npc, "currentPlaceId", path),
        `${path}.currentPlaceId`,
    );
    placeAt(context.mapIndex, locationId, currentPlaceId, `${path}.currentPlaceId`);
    const homeLocationId = string(required(npc, "homeLocationId", path), `${path}.homeLocationId`, {
        nonEmpty: true,
    });
    if (!context.mapIndex.locations.has(homeLocationId)) {
        fail(`${path}.homeLocationId`, `references unknown location '${homeLocationId}'`);
    }
    const homePlaceId = string(required(npc, "homePlaceId", path), `${path}.homePlaceId`, {
        nonEmpty: true,
    });
    const home = placeAt(context.mapIndex, homeLocationId, homePlaceId, `${path}.homePlaceId`);
    if (home.props?.ownerNpcId !== npc.id) {
        fail(`${path}.homePlaceId`, `must point to a home owned by NPC '${npc.id}'`);
    }
    if (home.props?.isResidence !== true) {
        fail(`${path}.homePlaceId`, "must point to a residence");
    }
    same(
        home.props?.accessFlag,
        npcHomeAccessFlag(npc.id),
        `${path}.homePlaceId`,
        "a residence protected by its owner's access flag",
    );

    const behaviorData = required(npc, "behavior", path);
    const brainData = required(npc, "brain", path);
    if (behaviorData === null) {
        if (brainData !== null) fail(`${path}.brain`, "must be null when the NPC has no behavior");
        return;
    }
    const rules = validateBehavior(behaviorData, `${path}.behavior`);
    if (brainData === null) fail(`${path}.brain`, "is required when the NPC has behavior");
    validateBrain(brainData, `${path}.brain`, {
        ...context,
        npc: { ...npc, locationId, currentPlaceId },
        path,
        rules,
    });
}

function validateDailyAnnouncements(value, path, gameTime) {
    const batch = record(value, path);
    const day = string(required(batch, "day", path), `${path}.day`, { nonEmpty: true });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        fail(`${path}.day`, "must be a UTC date in YYYY-MM-DD form");
    }
    same(
        day,
        new Date(gameTime).toISOString().slice(0, 10),
        `${path}.day`,
        "the current game day",
    );

    const ids = new Set();
    array(required(batch, "items", path), `${path}.items`).forEach((itemData, index) => {
        const itemPath = `${path}.items[${index}]`;
        const item = record(itemData, itemPath);
        const id = string(required(item, "id", itemPath), `${itemPath}.id`, { nonEmpty: true });
        if (ids.has(id)) fail(`${itemPath}.id`, `duplicates announcement '${id}'`);
        ids.add(id);
        const tone = string(required(item, "tone", itemPath), `${itemPath}.tone`, {
            nonEmpty: true,
        });
        if (!ANNOUNCEMENT_TONES.has(tone)) {
            fail(`${itemPath}.tone`, "must be 'info' or 'warning'");
        }
        string(required(item, "text", itemPath), `${itemPath}.text`, { nonEmpty: true });
    });
}

export function validateGameSave(data) {
    validateJsonValue(data, "save");
    const save = record(data, "save");
    same(
        integer(required(save, "saveVersion", "save"), "save.saveVersion"),
        22,
        "save.saveVersion",
        "version 22",
    );

    const seed = uint32(required(save, "seed", "save"), "save.seed");
    validateRandomStreams(required(save, "random", "save"), "save.random", seed, ["gameplay"]);
    const gameTime = dateMilliseconds(required(save, "time", "save"), "save.time");

    const world = record(required(save, "world", "save"), "save.world");
    const worldSeed = deriveSeed(seed, "world");
    validateRandomStreams(required(world, "random", "save.world"), "save.world.random", worldSeed, [
        "runtime",
        "calendar",
        "map",
    ]);
    const worldTimeData = record(required(world, "time", "save.world"), "save.world.time");
    const worldTime = dateMilliseconds(
        required(worldTimeData, "date", "save.world.time"),
        "save.world.time.date",
    );
    same(worldTime, gameTime, "save.world.time.date", "the game clock");
    const worldYear = new Date(worldTime).getUTCFullYear();
    validateCalendar(required(world, "calendar", "save.world"), "save.world.calendar", worldYear);
    const weatherData = required(world, "weather", "save.world");
    validateWeather(weatherData, "save.world.weather", worldSeed, worldTime);
    const savedTemperature = finiteNumber(
        required(world, "temperatureC", "save.world"),
        "save.world.temperatureC",
    );
    const restoredWeather = Weather.fromJSON(weatherData, { seed: worldSeed });
    const expectedTemperature = restoredWeather.computeTemperature(
        new Date(worldTime),
        restoredWeather.kind,
    );
    same(
        savedTemperature,
        expectedTemperature,
        "save.world.temperatureC",
        "the deterministic temperature for the saved weather and clock",
    );
    const moon = record(required(world, "moon", "save.world"), "save.world.moon");
    same(
        dateMilliseconds(required(moon, "date", "save.world.moon"), "save.world.moon.date"),
        worldTime,
        "save.world.moon.date",
        "the world clock",
    );
    const mapIndex = validateMap(required(world, "map", "save.world"), "save.world.map");

    const npcs = array(required(save, "npcs", "save"), "save.npcs");
    const npcIds = new Set();
    npcs.forEach((npcData, index) => {
        const npcPath = `save.npcs[${index}]`;
        const npc = record(npcData, npcPath);
        const id = string(required(npc, "id", npcPath), `${npcPath}.id`, { nonEmpty: true });
        if (npcIds.has(id)) fail(`${npcPath}.id`, `duplicates NPC '${id}'`);
        npcIds.add(id);
    });

    validatePlayer(required(save, "player", "save"), "save.player", npcIds, gameTime);
    npcs.forEach((npcData, index) =>
        validateNPC(npcData, `save.npcs[${index}]`, { mapIndex, gameTime }),
    );

    for (const { data: place, path } of mapIndex.places.values()) {
        if (!Object.prototype.hasOwnProperty.call(place.props, "ownerNpcId")) continue;
        const ownerId = string(place.props.ownerNpcId, `${path}.props.ownerNpcId`, {
            nonEmpty: true,
        });
        if (!npcIds.has(ownerId)) {
            fail(`${path}.props.ownerNpcId`, `references unknown NPC '${ownerId}'`);
        }
    }

    const validatePosition = (prefix, locationValue, placeValue) => {
        const locationId = string(locationValue, `save.${prefix}LocationId`, { nonEmpty: true });
        if (!mapIndex.locations.has(locationId)) {
            fail(`save.${prefix}LocationId`, `references unknown location '${locationId}'`);
        }
        const placeId = optionalNullableString(placeValue, `save.${prefix}PlaceId`);
        const place = placeAt(mapIndex, locationId, placeId, `save.${prefix}PlaceId`);
        return { locationId, placeId, place };
    };

    validatePosition(
        "home",
        required(save, "homeLocationId", "save"),
        required(save, "homePlaceId", "save"),
    );
    const current = validatePosition(
        "current",
        required(save, "currentLocationId", "save"),
        required(save, "currentPlaceId", "save"),
    );
    const currentPlaceKey = optionalNullableString(
        required(save, "currentPlaceKey", "save"),
        "save.currentPlaceKey",
        { nonEmpty: false },
    );
    if (current.place) {
        if (!current.place.unlocked) {
            fail("save.currentPlaceId", "references a locked place");
        }
        same(currentPlaceKey, current.place.key, "save.currentPlaceKey", "the current place key");
    }

    const gpsTargetData = required(save, "gpsTarget", "save");
    if (gpsTargetData !== null) {
        const gpsTarget = record(gpsTargetData, "save.gpsTarget");
        const locationId = string(
            required(gpsTarget, "locationId", "save.gpsTarget"),
            "save.gpsTarget.locationId",
            { nonEmpty: true },
        );
        const placeId = string(
            required(gpsTarget, "placeId", "save.gpsTarget"),
            "save.gpsTarget.placeId",
            { nonEmpty: true },
        );
        if (!mapIndex.locations.has(locationId)) {
            fail("save.gpsTarget.locationId", `references unknown location '${locationId}'`);
        }
        const place = placeAt(mapIndex, locationId, placeId, "save.gpsTarget.placeId");
        if (!place.unlocked) {
            fail("save.gpsTarget.placeId", "references a locked place");
        }
        if (locationId === current.locationId) {
            fail("save.gpsTarget.locationId", "must disengage after reaching the target location");
        }
    }

    uniqueStrings(required(save, "flags", "save"), "save.flags");
    uniqueStrings(required(save, "dailyFlags", "save"), "save.dailyFlags", { nonEmpty: true });
    validateDailyAnnouncements(
        required(save, "dailyAnnouncements", "save"),
        "save.dailyAnnouncements",
        gameTime,
    );
    record(required(save, "story", "save"), "save.story");
    const currentStory = validateCurrentStory(
        required(save, "currentStory", "save"),
        "save.currentStory",
        gameTime,
    );
    const storyContinuations = validateStoryContinuations(
        required(save, "storyContinuations", "save"),
        "save.storyContinuations",
        gameTime,
    );
    if (storyContinuations.length && currentStory === null) {
        fail("save.storyContinuations", "requires an active current story");
    }
    const storyRevision = integer(required(save, "storyRevision", "save"), "save.storyRevision", {
        min: 0,
    });
    if (currentStory?.resolution) {
        same(
            currentStory.resolution.revision,
            storyRevision,
            "save.currentStory.resolution.revision",
            "save.storyRevision",
        );
    }
    integer(required(save, "actionRevision", "save"), "save.actionRevision", {
        min: 0,
    });
    array(required(save, "log", "save"), "save.log").forEach((entryData, index) => {
        const entryPath = `save.log[${index}]`;
        const entry = record(entryData, entryPath);
        const timestamp = dateMilliseconds(required(entry, "t", entryPath), `${entryPath}.t`);
        if (timestamp > gameTime) fail(`${entryPath}.t`, "cannot be after the game clock");
        string(required(entry, "label", entryPath), `${entryPath}.label`, { nonEmpty: true });
    });

    return data;
}
