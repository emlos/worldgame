// tests/npc/npc_schedule_fuzz.js
// Assumes (debug=true) modules expose: World, NPC, NPCScheduler, npcFromRegistryKey, makeRNG, MS_PER_DAY.

const byId = (id) => document.getElementById(id);

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;

function pad2(n) {
    return String(n).padStart(2, "0");
}

function fmtDT(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "InvalidDate";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
        d.getHours()
    )}:${pad2(d.getMinutes())}`;
}

function minutesBetween(a, b) {
    return (b.getTime() - a.getTime()) / MS_PER_MINUTE;
}

function normalizeMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

// Monday 00:00 local
function weekStartForDate(date) {
    const base = normalizeMidnight(date);
    const day = base.getDay(); // 0=Sun, 1=Mon ...
    const monIndex = (day + 6) % 7; // Mon=0 ... Sun=6
    const mondayMs = base.getTime() - monIndex * MS_PER_DAY;
    return new Date(mondayMs);
}

function safeNumber(n, fallback = 0) {
    return Number.isFinite(n) ? n : fallback;
}

function validateWeekSlots(slots, weekStart, weekEnd) {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(slots)) {
        errors.push(`Schedule is not an array (got ${typeof slots}).`);
        return { ok: false, errors, warnings, stats: {} };
    }

    // Defensive copy + sort
    const sorted = slots.slice().sort((a, b) => a?.from - b?.from || a?.to - b?.to);

    const weekStartMs = weekStart.getTime();
    const weekEndMs = weekEnd.getTime();

    // Basic slot checks
    for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        const from = s?.from instanceof Date ? s.from : new Date(s?.from);
        const to = s?.to instanceof Date ? s.to : new Date(s?.to);

        const fromMs = from.getTime();
        const toMs = to.getTime();

        if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
            errors.push(
                `Slot[${i}] has invalid date(s): from=${String(s?.from)} to=${String(s?.to)}`
            );
            continue;
        }

        if (toMs <= fromMs) {
            errors.push(
                `Slot[${i}] non-positive duration: ${fmtDT(from)} → ${fmtDT(to)} (${safeNumber(
                    minutesBetween(from, to)
                )} min)`
            );
        }

        // Out of bounds: travel slots in npcai.js are not clamped, so we explicitly flag this.
        if (fromMs < weekStartMs - 1) {
            warnings.push(
                `Slot[${i}] starts before weekStart: ${fmtDT(from)} < ${fmtDT(weekStart)}`
            );
        }
        if (toMs > weekEndMs + 1) {
            warnings.push(`Slot[${i}] ends after weekEnd: ${fmtDT(to)} > ${fmtDT(weekEnd)}`);
        }
    }

    // Gap/overlap checks
    if (sorted.length === 0) {
        errors.push("No slots generated (empty schedule).");
        return { ok: false, errors, warnings, stats: { slotCount: 0 } };
    }

    // Leading coverage
    const firstFrom = sorted[0].from instanceof Date ? sorted[0].from : new Date(sorted[0].from);
    if (firstFrom.getTime() > weekStartMs) {
        const gap = minutesBetween(weekStart, firstFrom);
        errors.push(
            `Leading gap: ${gap.toFixed(2)} min (${fmtDT(weekStart)} → ${fmtDT(firstFrom)})`
        );
    }

    let totalGapMin = 0;
    let totalOverlapMin = 0;
    let maxGapMin = 0;
    let maxOverlapMin = 0;

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];

        const prevTo = prev.to instanceof Date ? prev.to : new Date(prev.to);
        const curFrom = cur.from instanceof Date ? cur.from : new Date(cur.from);

        const deltaMin = minutesBetween(prevTo, curFrom);

        // Small floating/jitter tolerance
        const EPS = 0.0001;

        if (deltaMin > EPS) {
            totalGapMin += deltaMin;
            maxGapMin = Math.max(maxGapMin, deltaMin);
            errors.push(
                `Gap: ${deltaMin.toFixed(2)} min between slot[${i - 1}] and slot[${i}] (${fmtDT(
                    prevTo
                )} → ${fmtDT(curFrom)})`
            );
        } else if (deltaMin < -EPS) {
            const overlap = -deltaMin;
            totalOverlapMin += overlap;
            maxOverlapMin = Math.max(maxOverlapMin, overlap);
            errors.push(
                `Overlap: ${overlap.toFixed(2)} min between slot[${i - 1}] and slot[${i}] (${fmtDT(
                    curFrom
                )} < ${fmtDT(prevTo)})`
            );
        }
    }

    // Trailing coverage
    const lastTo =
        sorted[sorted.length - 1].to instanceof Date
            ? sorted[sorted.length - 1].to
            : new Date(sorted[sorted.length - 1].to);

    if (lastTo.getTime() < weekEndMs) {
        const gap = minutesBetween(lastTo, weekEnd);
        errors.push(`Trailing gap: ${gap.toFixed(2)} min (${fmtDT(lastTo)} → ${fmtDT(weekEnd)})`);
        totalGapMin += gap;
        maxGapMin = Math.max(maxGapMin, gap);
    }

    // Total covered time sanity (use merged-by-order; overlaps reduce effective coverage)
    const weekLenMin = (weekEndMs - weekStartMs) / MS_PER_MINUTE;

    // Compute effective coverage (union length) by merging intervals.
    let coveredMin = 0;
    {
        const intervals = sorted
            .map((s) => ({
                from: (s.from instanceof Date ? s.from : new Date(s.from)).getTime(),
                to: (s.to instanceof Date ? s.to : new Date(s.to)).getTime(),
            }))
            .filter((x) => Number.isFinite(x.from) && Number.isFinite(x.to))
            .sort((a, b) => a.from - b.from || a.to - b.to);

        let curA = null;
        for (const it of intervals) {
            if (!curA) curA = { ...it };
            else if (it.from <= curA.to) curA.to = Math.max(curA.to, it.to);
            else {
                coveredMin += (curA.to - curA.from) / MS_PER_MINUTE;
                curA = { ...it };
            }
        }
        if (curA) coveredMin += (curA.to - curA.from) / MS_PER_MINUTE;
    }

    const stats = {
        slotCount: sorted.length,
        weekLenMin,
        coveredMin,
        uncoveredMin: Math.max(0, weekLenMin - coveredMin),
        totalGapMin,
        totalOverlapMin,
        maxGapMin,
        maxOverlapMin,
    };

    const ok = errors.length === 0;
    return { ok, errors, warnings, stats, sorted };
}

function buildWorldAndNPC({ seed, npcKey, density, w, h, startDate }) {
    const rnd = makeRNG(seed);

    const world = new World({
        rnd,
        density,
        startDate,
        w,
        h,
    });

    const base = npcFromRegistryKey(npcKey);
    if (!base) throw new Error(`npcFromRegistryKey("${npcKey}") returned null`);

    const npc = new NPC({
        ...base,
        locationId: base.locationId || null,
        homeLocationId: base.homeLocationId || null,
        homePlaceId: base.homePlaceId || null,
        meta: base.meta || {},
    });

    if (!npc.homeLocationId) {
        npc.homeLocationId = npc.locationId || [...world.locations.keys()][0];
    }
    if (!npc.locationId) {
        npc.locationId = npc.homeLocationId;
    }

    const scheduler = new NPCScheduler({ world, rnd });
    return { world, npc, scheduler, seed };
}

function getDateInputOrToday() {
    const el = byId("startDate");
    if (!el || !el.value) return new Date();
    // input[type=date] gives YYYY-MM-DD (local)
    const [y, m, d] = el.value.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d, 9, 0, 0, 0); // 09:00 local (doesn't matter much)
}

function setDefaultDateInput() {
    const el = byId("startDate");
    if (!el) return;
    const d = new Date();
    el.value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function summarizeFailure({ seed, npcKey, errors, warnings, stats, sorted, weekStart, weekEnd }) {
    const lines = [];
    lines.push(`Seed ${seed} (npc="${npcKey}")`);
    lines.push(`Week: ${fmtDT(weekStart)} → ${fmtDT(weekEnd)}`);
    lines.push(
        `Slots=${stats.slotCount}, covered=${stats.coveredMin.toFixed(
            2
        )}m / ${stats.weekLenMin.toFixed(2)}m, uncovered=${stats.uncoveredMin.toFixed(
            2
        )}m, maxGap=${stats.maxGapMin.toFixed(2)}m, maxOverlap=${stats.maxOverlapMin.toFixed(2)}m`
    );

    if (warnings.length) {
        lines.push(`Warnings (${warnings.length}):`);
        warnings.slice(0, 6).forEach((w) => lines.push(`  - ${w}`));
        if (warnings.length > 6) lines.push(`  ... +${warnings.length - 6} more`);
    }

    lines.push(`Errors (${errors.length}):`);
    errors.slice(0, 10).forEach((e) => lines.push(`  - ${e}`));
    if (errors.length > 10) lines.push(`  ... +${errors.length - 10} more`);

    // Show a small slice of the timeline around the first few slots
    lines.push(`Timeline sample (first 12 slots):`);
    const sample = sorted.slice(0, 12);
    for (let i = 0; i < sample.length; i++) {
        const s = sample[i];
        const from = s.from instanceof Date ? s.from : new Date(s.from);
        const to = s.to instanceof Date ? s.to : new Date(s.to);
        const dur = safeNumber(minutesBetween(from, to));
        const kind = s.activityType || s.ruleType || "slot";
        const rule = s.sourceRuleId ? ` rule=${s.sourceRuleId}` : "";
        const loc = s.locationId != null ? ` loc=${s.locationId}` : "";
        lines.push(
            `  [${i}] ${fmtDT(from)} → ${fmtDT(to)} (${dur.toFixed(2)}m) ${kind}${rule}${loc}`
        );
    }

    return lines.join("\n");
}

function runFuzz() {
    const npcKey = String(byId("npcKey").value || "taylor").trim();
    const iters = Math.max(1, parseInt(byId("iters").value, 10) || 1);
    const baseSeed = parseInt(byId("seed").value, 10) || 1;
    const density = Math.min(1, Math.max(0.01, parseFloat(byId("density").value) || 0.15));
    const w = Math.max(10, parseInt(byId("w").value, 10) || 70);
    const h = Math.max(10, parseInt(byId("h").value, 10) || 50);
    const startDate = getDateInputOrToday();

    const out = byId("out");
    out.textContent = "Running...\n";

    let pass = 0;
    let fail = 0;
    let warnCount = 0;

    let totalSlots = 0;
    let maxGap = 0;
    let maxOverlap = 0;

    const failures = [];

    for (let i = 0; i < iters; i++) {
        const seed = baseSeed + i;

        let world, npc, scheduler;
        try {
            ({ world, npc, scheduler } = buildWorldAndNPC({
                seed,
                npcKey,
                density,
                w,
                h,
                startDate,
            }));
        } catch (e) {
            fail++;
            failures.push(`Seed ${seed}: setup failed: ${e?.message || e}`);
            continue;
        }

        // Get schedule
        const slots = scheduler.getCurrentWeekSchedule(npc);

        const wkStart = weekStartForDate(world.time.date);
        const wkEnd = new Date(wkStart.getTime() + 7 * MS_PER_DAY);

        const res = validateWeekSlots(slots, wkStart, wkEnd);

        warnCount += res.warnings.length;
        totalSlots += res.stats.slotCount || 0;
        maxGap = Math.max(maxGap, res.stats.maxGapMin || 0);
        maxOverlap = Math.max(maxOverlap, res.stats.maxOverlapMin || 0);

        if (res.ok) {
            pass++;
        } else {
            fail++;
            failures.push(
                summarizeFailure({
                    seed,
                    npcKey,
                    errors: res.errors,
                    warnings: res.warnings,
                    stats: res.stats,
                    sorted: res.sorted || [],
                    weekStart: wkStart,
                    weekEnd: wkEnd,
                })
            );
        }
    }

    const avgSlots = iters ? totalSlots / iters : 0;

    byId("pillPass").textContent = `Pass: ${pass}`;
    byId("pillFail").textContent = `Fail: ${fail}`;
    byId("pillWarn").textContent = `Warnings: ${warnCount}`;
    byId("pillStats").textContent = `Avg slots/run: ${avgSlots.toFixed(
        1
    )} | maxGap: ${maxGap.toFixed(2)}m | maxOverlap: ${maxOverlap.toFixed(2)}m`;

    const lines = [];
    lines.push(`NPC Schedule Fuzz`);
    lines.push(`npc="${npcKey}", iters=${iters}, baseSeed=${baseSeed}`);
    lines.push(`world: density=${density}, w=${w}, h=${h}, startDate=${fmtDT(startDate)}`);
    lines.push(`Result: pass=${pass}, fail=${fail}, warnings=${warnCount}`);
    lines.push(`Avg slots/run: ${avgSlots.toFixed(2)}`);
    lines.push(`Worst maxGap: ${maxGap.toFixed(2)} min`);
    lines.push(`Worst maxOverlap: ${maxOverlap.toFixed(2)} min`);
    lines.push("");

    if (failures.length) {
        lines.push(`Failures (${failures.length}):`);
        lines.push("------------------------------------------------------------");
        failures.forEach((block, idx) => {
            lines.push(`#${idx + 1}`);
            lines.push(block);
            lines.push("------------------------------------------------------------");
        });
    } else {
        lines.push("No failures detected.");
    }

    out.textContent = lines.join("\n");
}

function init() {
    setDefaultDateInput();
    byId("runBtn").addEventListener("click", runFuzz);
}

window.addEventListener("DOMContentLoaded", init);
