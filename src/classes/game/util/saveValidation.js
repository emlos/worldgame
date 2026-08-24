import { deriveSeed } from "../../../shared/util/random.js";
import { GOAL_TYPE, NPC_ACTION_TYPE, TARGET_TYPE } from "../../../data/npc/behavior.js";
import { RANDOM_HOLIDAYS, MONTH_DAYS, DayKind } from "../../../data/world/calendar.js";
import { DAY_KEYS } from "../../../data/world/time.js";
import { WeatherType } from "../../../data/world/weather.js";
import { Weather } from "../../world/util/weather.js";

const UINT32_MAX = 0xffffffff;
const WEATHER_SAVE_VERSION = 2;
const WEATHER_ALGORITHM_VERSION = 1;
const GOAL_TYPES = new Set(Object.values(GOAL_TYPE));
const ACTION_TYPES = new Set(Object.values(NPC_ACTION_TYPE));
const TARGET_TYPES = new Set(Object.values(TARGET_TYPE));
const WEATHER_TYPES = new Set(Object.values(WeatherType));
const DAY_KINDS = new Set(Object.values(DayKind));
const DAY_KEYS_SET = new Set(DAY_KEYS);

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

function validateTraits(data, path) {
    const seen = new Set();
    array(data, path).forEach((traitData, index) => {
        const traitPath = `${path}[${index}]`;
        const trait = record(traitData, traitPath);
        const id = string(required(trait, "id", traitPath), `${traitPath}.id`, { nonEmpty: true });
        if (seen.has(id)) fail(`${traitPath}.id`, `duplicates trait '${id}'`);
        seen.add(id);
        string(required(trait, "description", traitPath), `${traitPath}.description`);
        record(required(trait, "statMods", traitPath), `${traitPath}.statMods`);
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
    validateTraits(required(data, "traits", path), `${path}.traits`);
    validateClothing(required(data, "clothing", path), `${path}.clothing`);
    validateBody(required(data, "body", path), `${path}.body`);
}

function validatePlayer(data, path, npcIds) {
    const player = record(data, path);
    validateCharacterCore(player, path);
    record(required(player, "appearance", path), `${path}.appearance`);
    string(required(player, "skinTone", path), `${path}.skinTone`, { nonEmpty: true });
    string(required(player, "eyeColor", path), `${path}.eyeColor`, { nonEmpty: true });
    string(required(player, "hairColor", path), `${path}.hairColor`, { nonEmpty: true });
    string(required(player, "gender", path), `${path}.gender`, { nonEmpty: true });
    validateRelationships(required(player, "relationships", path), `${path}.relationships`, npcIds);

    const seenSkills = new Set();
    array(required(player, "skills", path), `${path}.skills`).forEach((entry, index) => {
        const entryPath = `${path}.skills[${index}]`;
        if (!Array.isArray(entry) || entry.length !== 2)
            fail(entryPath, "must be a [name, skill] pair");
        const name = string(entry[0], `${entryPath}[0]`, { nonEmpty: true });
        if (seenSkills.has(name)) fail(`${entryPath}[0]`, `duplicates skill '${name}'`);
        seenSkills.add(name);
        const skill = record(entry[1], `${entryPath}[1]`);
        const type = string(required(skill, "type", `${entryPath}[1]`), `${entryPath}[1].type`);
        if (type !== "flag" && type !== "meter")
            fail(`${entryPath}[1].type`, "must be 'flag' or 'meter'");
        const value = required(skill, "value", `${entryPath}[1]`);
        if (type === "flag") boolean(value, `${entryPath}[1].value`);
        else finiteNumber(value, `${entryPath}[1].value`, { min: 0, max: 1 });
    });
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
    finiteNumber(required(map, "density", path), `${path}.density`, { min: 0 });
    const locations = new Map();
    const places = new Map();

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
                string(required(place, "key", placePath), `${placePath}.key`, { nonEmpty: true });
                string(required(place, "name", placePath), `${placePath}.name`, { nonEmpty: true });
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
                localPlaces.set(placeId, place);
                places.set(placeId, { locationId: id, data: place, path: placePath });
            },
        );
        locations.set(id, { data: location, path: locationPath, places: localPlaces });
    });

    if (locations.size === 0) fail(`${path}.locations`, "must contain at least one location");

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
    if (startedAt > context.gameTime) fail(`${actionPath}.startedAt`, "cannot be in the future");

    if (type === NPC_ACTION_TYPE.idle) {
        if (goal) fail(actionPath, "an idle action cannot have a current goal");
        return;
    }
    if (!goal) fail(actionPath, `${type} requires a current goal`);

    if (type === NPC_ACTION_TYPE.stay) {
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
        same(
            locationId,
            goal.targetLocationId,
            `${actionPath}.locationId`,
            "the current goal target",
        );
        same(placeId, goal.targetPlaceId, `${actionPath}.placeId`, "the current goal target place");
        return;
    }

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
    const targetLocationId = string(
        required(action, "targetLocationId", actionPath),
        `${actionPath}.targetLocationId`,
        { nonEmpty: true },
    );
    const targetPlaceId = optionalNullableString(
        required(action, "targetPlaceId", actionPath),
        `${actionPath}.targetPlaceId`,
    );
    placeAt(context.mapIndex, fromLocationId, null, `${actionPath}.fromLocationId`);
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
    if (context.npc.currentPlaceId !== null)
        fail(`${context.path}.currentPlaceId`, "must be null while traveling");

    const route = record(required(action, "route", actionPath), `${actionPath}.route`);
    const locations = array(
        required(route, "locations", `${actionPath}.route`),
        `${actionPath}.route.locations`,
    );
    if (locations.length < 2)
        fail(`${actionPath}.route.locations`, "must contain at least two locations");
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
        totalMinutes * 60 * 1000,
        `${actionPath}.arrivalAt`,
        "the route duration",
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

export function validateGameSave(data) {
    validateJsonValue(data, "save");
    const save = record(data, "save");
    same(
        integer(required(save, "saveVersion", "save"), "save.saveVersion"),
        6,
        "save.saveVersion",
        "version 6",
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

    validatePlayer(required(save, "player", "save"), "save.player", npcIds);
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
        same(currentPlaceKey, current.place.key, "save.currentPlaceKey", "the current place key");
    }

    uniqueStrings(required(save, "flags", "save"), "save.flags");
    array(required(save, "log", "save"), "save.log").forEach((entryData, index) => {
        const entryPath = `save.log[${index}]`;
        const entry = record(entryData, entryPath);
        const timestamp = dateMilliseconds(required(entry, "t", entryPath), `${entryPath}.t`);
        if (timestamp > gameTime) fail(`${entryPath}.t`, "cannot be after the game clock");
        string(required(entry, "label", entryPath), `${entryPath}.label`, { nonEmpty: true });
    });

    return data;
}
