import { World } from "../../src/classes/world/world.js";
import { Calendar } from "../../src/classes/world/util/calendar.js";
import { HOLIDAY_REGISTRY, RANDOM_HOLIDAYS } from "../../src/data/world/calendar.js";
import { makeRNG } from "../../src/shared/util/random.js";

const START = new Date("2026-01-15T07:00:00Z");

function equal(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function check(name, condition) {
    if (!condition) throw new Error(`FAIL: ${name}`);
    console.log(`PASS: ${name}`);
}

function hasNamedEntry(info, name) {
    return [...info.holidays, ...info.specials].some((entry) => entry.name === name);
}

function throws(name, fn) {
    let didThrow = false;
    try {
        fn();
    } catch {
        didThrow = true;
    }
    check(name, didThrow);
}

const world = new World({ seed: 123, startDate: START });
const calendarBeforeQueries = JSON.stringify(world.calendar);
const randomBeforeQueries = JSON.stringify(world.random);

check(
    "fixed holidays resolve in the committed year",
    hasNamedEntry(world.getDayInfo(new Date("2026-12-25T12:00:00Z")), "Christmas Day"),
);
check(
    "fixed holidays resolve in a future year",
    hasNamedEntry(world.getDayInfo(new Date("2027-12-25T12:00:00Z")), "Christmas Day"),
);
check(
    "fixed holidays resolve in a past year",
    hasNamedEntry(world.getDayInfo(new Date("2025-12-25T12:00:00Z")), "Christmas Day"),
);
check(
    "moving holidays resolve for queried years",
    hasNamedEntry(world.getDayInfo(new Date("2027-03-28T12:00:00Z")), "Easter"),
);
check("date queries do not change the committed calendar year", world.calendar.year === 2026);
check("date-query caches are not persisted", JSON.stringify(world.calendar) === calendarBeforeQueries);
check("calendar queries consume no world RNG", JSON.stringify(world.random) === randomBeforeQueries);

check(
    "daysUntil rolls over to next year's occurrence",
    world.daysUntil("Christmas Day", new Date("2026-12-26T18:00:00Z")) === 364,
);
check(
    "daysUntil returns zero on the occurrence date",
    world.daysUntil("Christmas Day", new Date("2027-12-25T23:59:00Z")) === 0,
);
check(
    "daysUntil remains case-insensitive",
    world.daysUntil("christmas day", new Date("2026-12-26T00:00:00Z")) === 364,
);
check(
    "daysUntil returns undefined for unknown names",
    world.daysUntil("Definitely Not A Holiday", START) === undefined,
);

const christmas = world.getDayInfo(new Date("2027-12-25T12:00:00Z"));
christmas.holidays[0].name = "Corrupted";
christmas.holidays.push({ name: "Injected", category: "test" });
check(
    "returned holiday arrays cannot mutate cached calendar data",
    hasNamedEntry(world.getDayInfo(new Date("2027-12-25T12:00:00Z")), "Christmas Day") &&
        !hasNamedEntry(world.getDayInfo(new Date("2027-12-25T12:00:00Z")), "Injected"),
);

const assignment = world.calendar.toJSON().randomHolidayAssignments[0];
const [randomName, randomDate] = assignment;
check(
    "fictional holiday assignments recur in queried years",
    hasNamedEntry(
        world.getDayInfo(
            new Date(Date.UTC(2031, randomDate.month - 1, randomDate.day, 12)),
        ),
        randomName,
    ),
);

let allRecurringDatesValid = true;
for (let seed = 1; seed <= 100; seed++) {
    const calendar = new Calendar({ year: 2026, rnd: makeRNG(seed) });
    allRecurringDatesValid &&= calendar
        .toJSON()
        .randomHolidayAssignments.every(([, { month, day }]) => month !== 2 || day <= 28);
}
check("random recurring holidays never land on February 29", allRecurringDatesValid);

const loadedWorld = World.fromJSON(JSON.parse(JSON.stringify(world)));
check(
    "save/load preserves future-year calendar queries",
    equal(
        world.getDayInfo(new Date("2032-06-24T12:00:00Z")),
        loadedWorld.getDayInfo(new Date("2032-06-24T12:00:00Z")),
    ),
);
check(
    "save/load preserves next-occurrence calculations",
    world.daysUntil(randomName, new Date("2031-12-31T00:00:00Z")) ===
        loadedWorld.daysUntil(randomName, new Date("2031-12-31T00:00:00Z")),
);

const invalidSave = world.calendar.toJSON();
invalidSave.randomHolidayAssignments[0][1] = { month: 2, day: 29 };
throws("invalid recurring dates in saves are rejected", () =>
    Calendar.fromJSON(invalidSave, { rnd: makeRNG(1) }),
);

check(
    "every registered holiday has a name for next-occurrence queries",
    [...HOLIDAY_REGISTRY, ...RANDOM_HOLIDAYS].every((definition) =>
        Number.isFinite(world.daysUntil(definition.name, START)),
    ),
);

console.log("All multi-year calendar query tests passed.");
