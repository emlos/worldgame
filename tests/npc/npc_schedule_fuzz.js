// tests/npc/npc_schedule_fuzz.js

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

function fmtYMD(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function buildInspectorUrl({ npcKey, seed, density, w, h, startDate }) {
    const u = new URL("./world_map_single.html", window.location.href);
    u.searchParams.set("npc", String(npcKey));
    u.searchParams.set("seed", String(seed));
    u.searchParams.set("density", String(density));
    u.searchParams.set("w", String(w));
    u.searchParams.set("h", String(h));
    u.searchParams.set("start", fmtYMD(startDate));
    return u.toString();
}

function validateWeekSlots(slots, weekStart, weekEnd) {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(slots)) {
        errors.push(`Schedule is not an array (got ${typeof slots}).`);
        return { ok: false, errors, warnings, stats: {} };
    }

    const sorted = slots.slice().sort((a, b) => a?.from - b?.from || a?.to - b?.to);

    const weekStartMs = weekStart.getTime();
    const weekEndMs = weekEnd.getTime();

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

        // out-of-bounds = warnings (useful for debugging travel spillover)
        if (fromMs < weekStartMs - 1)
            warnings.push(
                `Slot[${i}] starts before weekStart: ${fmtDT(from)} < ${fmtDT(weekStart)}`
            );
        if (toMs > weekEndMs + 1)
            warnings.push(`Slot[${i}] ends after weekEnd: ${fmtDT(to)} > ${fmtDT(weekEnd)}`);
    }

    if (sorted.length === 0) {
        errors.push("No slots generated (empty schedule).");
        return { ok: false, errors, warnings, stats: { slotCount: 0 } };
    }

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

    const weekLenMin = (weekEndMs - weekStartMs) / MS_PER_MINUTE;

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

    return { ok: errors.length === 0, errors, warnings, stats, sorted };
}

function buildWorldAndNPC({ seed, npcKey, density, w, h, startDate }) {
    const rnd = makeRNG(seed);

    const world = new World({ rnd, density, startDate, w, h });

    const base = npcFromRegistryKey(npcKey);
    if (!base) throw new Error(`npcFromRegistryKey("${npcKey}") returned null`);

    const locIds = [...world.locations.keys()];
    const homeLocId = locIds[0];

    const npc = new NPC({
        ...base,
        locationId: homeLocId,
        homeLocationId: homeLocId,
        homePlaceId: `home-${npcKey}-${seed}`,
        meta: base.meta || {},
    });

    const scheduler = new NPCScheduler({ world, rnd });
    return { world, npc, scheduler };
}

function getDateInputOrToday() {
    const el = byId("startDate");
    if (!el || !el.value) return new Date();
    const [y, m, d] = el.value.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d, 9, 0, 0, 0);
}

function setDefaultDateInput() {
    const el = byId("startDate");
    if (!el) return;
    const d = new Date();
    el.value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
    const failLinks = byId("failLinks");
    out.textContent = "Running...\n";
    if (failLinks) failLinks.innerHTML = "";

    let pass = 0,
        fail = 0,
        warnCount = 0;
    let totalSlots = 0,
        maxGap = 0,
        maxOverlap = 0;

    const failures = []; // text blocks
    const failuresMeta = []; // for link rendering

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
            failuresMeta.push({ seed, npcKey, density, w, h, startDate, reason: "setup failed" });
            continue;
        }

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
            failuresMeta.push({
                seed,
                npcKey,
                density,
                w,
                h,
                startDate,
                reason: `${res.errors.length} error(s)`,
            });

            const lines = [];
            lines.push(`Seed ${seed} (npc="${npcKey}")`);
            lines.push(`World: w=${w}, h=${h}, density=${density}, startDate=${fmtDT(startDate)}`);
            lines.push(`Week: ${fmtDT(wkStart)} → ${fmtDT(wkEnd)}`);
            lines.push(
                `Slots=${res.stats.slotCount}, covered=${res.stats.coveredMin.toFixed(
                    2
                )}m / ${res.stats.weekLenMin.toFixed(
                    2
                )}m, uncovered=${res.stats.uncoveredMin.toFixed(
                    2
                )}m, maxGap=${res.stats.maxGapMin.toFixed(
                    2
                )}m, maxOverlap=${res.stats.maxOverlapMin.toFixed(2)}m`
            );
            if (res.warnings.length) {
                lines.push(`Warnings (${res.warnings.length}):`);
                res.warnings.slice(0, 6).forEach((w) => lines.push(`  - ${w}`));
                if (res.warnings.length > 6) lines.push(`  ... +${res.warnings.length - 6} more`);
            }
            lines.push(`Errors (${res.errors.length}):`);
            res.errors.slice(0, 10).forEach((e) => lines.push(`  - ${e}`));
            if (res.errors.length > 10) lines.push(`  ... +${res.errors.length - 10} more`);
            lines.push(`Timeline sample (first 12 slots):`);
            (res.sorted || []).slice(0, 12).forEach((s, idx) => {
                const from = s.from instanceof Date ? s.from : new Date(s.from);
                const to = s.to instanceof Date ? s.to : new Date(s.to);
                const dur = safeNumber(minutesBetween(from, to));
                const kind = s.activityType || s.ruleType || "slot";
                const rule = s.sourceRuleId ? ` rule=${s.sourceRuleId}` : "";
                const loc = s.locationId != null ? ` loc=${s.locationId}` : "";
                lines.push(
                    `  [${idx}] ${fmtDT(from)} → ${fmtDT(to)} (${dur.toFixed(
                        2
                    )}m) ${kind}${rule}${loc}`
                );
            });

            failures.push(lines.join("\n"));
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

    // Render clickable inspector links
    if (failLinks) {
        if (!failuresMeta.length) {
            failLinks.innerHTML = `<div style="opacity:.7">No failing seeds.</div>`;
        } else {
            const items = failuresMeta
                .map((m) => {
                    const href = buildInspectorUrl(m);
                    const label = `Open seed ${m.seed} (${m.reason}) — npc=${m.npcKey}, w=${
                        m.w
                    }, h=${m.h}, density=${m.density}, start=${fmtYMD(m.startDate)}`;
                    return `
            <div style="margin:6px 0">
              <a href="${href}" target="_blank" rel="noopener"
                 style="display:inline-block;padding:6px 10px;border:1px solid #26323b;border-radius:8px;background:rgba(0,0,0,.2);text-decoration:none;color:#e6ecf1">
                ${label}
              </a>
            </div>`;
                })
                .join("");

            failLinks.innerHTML = `
        <div style="margin-top:8px">
          <div style="opacity:.8;margin-bottom:6px">Open failing runs in single inspector:</div>
          ${items}
        </div>`;
        }
    }
}

function init() {
    setDefaultDateInput();
    byId("runBtn").addEventListener("click", runFuzz);
}

window.addEventListener("DOMContentLoaded", init);
