import { WorldMap } from "../src/classes/world/util/worldmap.js";
import { Body, BodyPartId } from "../src/shared/classes/body.js";
import { Stat } from "../src/shared/classes/stat.js";
import { parseTimeToMinutes } from "../src/shared/util/date.js";

const failures = [];

function check(label, condition, detail = "") {
    if (condition) {
        console.log(`PASS: ${label}`);
        return;
    }
    failures.push(`${label}${detail ? ` (${detail})` : ""}`);
}

function rejects(label, fn, ErrorType = Error) {
    try {
        fn();
        check(label, false, "did not throw");
    } catch (error) {
        check(label, error instanceof ErrorType, `${error.name}: ${error.message}`);
    }
}

function rejectsWithoutBodyMutation(label, operation) {
    const body = new Body();
    const before = JSON.stringify(body);
    rejects(label, () => operation(body), TypeError);
    check(`${label} leaves body state unchanged`, JSON.stringify(body) === before);
}

for (const invalid of [NaN, Infinity, -Infinity]) {
    const name = String(invalid);
    rejectsWithoutBodyMutation(`damage rejects ${name}`, (body) =>
        body.applyDamage({ partId: BodyPartId.HEAD, amount: invalid }),
    );
    rejectsWithoutBodyMutation(`randomized damage rejects ${name}`, (body) =>
        body.applyDamageRandomized({
            partId: BodyPartId.HEAD,
            amount: invalid,
            rnd: () => 0.5,
        }),
    );
    rejectsWithoutBodyMutation(`healing rejects ${name}`, (body) =>
        body.healPart(BodyPartId.HEAD, invalid),
    );
}

const zeroMultiplier = new Stat(12).addFlat(3).addMult(0);
check("a zero multiplier produces a zero stat", zeroMultiplier.value === 0);
check("a zero multiplier is serialized", zeroMultiplier.toJSON().mult[0] === 0);
check("a zero multiplier survives hydration", Stat.fromJSON(zeroMultiplier.toJSON()).value === 0);

for (const invalid of [NaN, Infinity, -Infinity]) {
    const stat = new Stat(10);
    const before = JSON.stringify(stat);
    rejects(`stat base rejects ${String(invalid)}`, () => { stat.base = invalid; }, TypeError);
    rejects(`flat modifier rejects ${String(invalid)}`, () => stat.addFlat(invalid), TypeError);
    rejects(`multiplier rejects ${String(invalid)}`, () => stat.addMult(invalid), TypeError);
    check(`rejected ${String(invalid)} stat inputs do not mutate state`, JSON.stringify(stat) === before);
}
rejects(
    "stat hydration rejects a non-finite modifier",
    () => Stat.fromJSON({ base: 10, add: [Infinity], mult: [] }),
    TypeError,
);

rejects("world map rejects a non-positive width", () => new WorldMap({ mapWidth: 0 }), RangeError);
rejects("world map rejects a non-finite height", () => new WorldMap({ mapHeight: NaN }), RangeError);

check("00:00 parses as midnight", parseTimeToMinutes("00:00") === 0);
check("23:59 parses to the final minute", parseTimeToMinutes("23:59") === 1439);
check("24:00 parses as the end-of-day boundary", parseTimeToMinutes("24:00") === 1440);
check("empty time can use an explicit default", parseTimeToMinutes("", { defaultValue: 123 }) === 123);
check("empty time can explicitly resolve to null", parseTimeToMinutes(null, { nullOnEmpty: true }) === null);

for (const invalid of ["nonsense", "9:00", "09:0", "24:01", "24:30", "25:00", "12:60", "-1:00", "12:00:00"]) {
    rejects(`schedule rejects ${JSON.stringify(invalid)}`, () => parseTimeToMinutes(invalid));
}
rejects(
    "a default does not hide malformed non-empty time",
    () => parseTimeToMinutes("not-a-time", { defaultValue: 0 }),
);

if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
} else {
    console.log("\nAll numeric rule boundary tests passed.");
}
