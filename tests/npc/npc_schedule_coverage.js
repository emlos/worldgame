// npc_schedule_coverage_test.js
// Assumes NPC_REGISTRY, DayKind, DAY_KEYS, SCHEDULE_RULES are globally available.

// --- time helpers -----------------------------------------------------------

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hStr, mStr] = String(timeStr).split(":");
    const h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    return h * 60 + m;
}

function formatMinutes(totalMinutes) {
    const dayMinutes = 24 * 60;
    let min = Math.max(0, Math.min(dayMinutes, totalMinutes));
    if (min === dayMinutes) return "24:00";
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDurationMinutes(totalMinutes) {
    const minutes = Math.max(0, Math.floor(totalMinutes || 0));
    if (minutes === 0) return "0 minutes";

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const parts = [];

    if (h > 0) {
        parts.push(h === 1 ? "1 hour" : `${h} hours`);
    }
    if (m > 0) {
        parts.push(`${m} minutes`);
    }

    return parts.join(" ");
}

// --- coverage marking -------------------------------------------------------

function markInterval(detCovered, probCovered, minuteRules, ruleId, startMin, endMin, prob) {
    const dayMinutes = 24 * 60;

    let start = Math.max(0, Math.min(dayMinutes, startMin));
    let end = Math.max(0, Math.min(dayMinutes, endMin));
    if (end <= start) return;

    const isProbRule = typeof prob === "number" && prob >= 0 && prob < 1;
    const isDetRule = !isProbRule;

    for (let m = start; m < end; m++) {
        if (isDetRule) detCovered[m] = true;
        else probCovered[m] = true;

        minuteRules[m].add(ruleId);
    }
}

function addTimeRangeCoverage(detCovered, probCovered, minuteRules, ruleId, fromStr, toStr, prob) {
    const dayMinutes = 24 * 60;
    let start = parseTimeToMinutes(fromStr);
    let end = parseTimeToMinutes(toStr);

    if (start < 0) start = 0;
    if (end < 0) end = 0;

    // Cross-midnight windows like 23:00–02:00
    if (end <= start) {
        markInterval(detCovered, probCovered, minuteRules, ruleId, start, dayMinutes, prob);
        markInterval(detCovered, probCovered, minuteRules, ruleId, 0, end, prob);
    } else {
        markInterval(detCovered, probCovered, minuteRules, ruleId, start, end, prob);
    }
}

// --- core analysis ----------------------------------------------------------

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDayKindForIndex(idx) {
    // 0 = Sunday, 6 = Saturday
    if (idx === 0 || idx === 6) return DayKind.DAY_OFF;
    return DayKind.WORKDAY;
}

function getDayKindLabel(kind) {
    for (const [k, v] of Object.entries(DayKind)) {
        if (v === kind) return k;
    }
    return String(kind);
}

/**
 * Compute minute-level coverage for a single NPC and a specific day index (0–6).
 * Also records which rule IDs affect each minute.
 */
function computeCoverageForDay(rules, dayIndex) {
    const dayMinutes = 24 * 60;
    const detCovered = new Array(dayMinutes).fill(false);
    const probCovered = new Array(dayMinutes).fill(false);
    const minuteRules = Array.from({ length: dayMinutes }, () => new Set());

    const dayKind = getDayKindForIndex(dayIndex);
    const dayKey = Array.isArray(DAY_KEYS) ? DAY_KEYS[dayIndex] : null;

    for (const rule of rules || []) {
        const type = rule.type;
        if (!type) continue;

        const ruleId = rule.id || "(no-id)";

        // Filter by dayKind
        if (rule.dayKinds && rule.dayKinds.length && !rule.dayKinds.includes(dayKind)) {
            continue;
        }

        // Filter by specific days of week, if provided
        if (rule.daysOfWeek && dayKey && !rule.daysOfWeek.includes(dayKey)) {
            continue;
        }

        // Base probability (1 = always, <1 = probabilistic)
        let prob =
            typeof rule.probability === "number" && rule.probability >= 0 ? rule.probability : 1;

        // Weekly rules are only "guaranteed" if there's exactly one possible day in the week
        if (type === SCHEDULE_RULES.weekly && prob >= 1) {
            let possibleDays = 0;
            for (let idx = 0; idx < 7; idx++) {
                const kind = getDayKindForIndex(idx);
                const key = Array.isArray(DAY_KEYS) ? DAY_KEYS[idx] : null;

                if (rule.dayKinds && rule.dayKinds.length && !rule.dayKinds.includes(kind)) {
                    continue;
                }
                if (
                    rule.daysOfWeek &&
                    rule.daysOfWeek.length &&
                    key &&
                    !rule.daysOfWeek.includes(key)
                ) {
                    continue;
                }
                possibleDays++;
            }
            if (possibleDays > 1) {
                // any value < 1 flips it into the probabilistic bucket for markInterval()
                prob = 0.5;
            }
        }

        if (type === SCHEDULE_RULES.home) {
            const blocks = rule.timeBlocks || [];
            for (const b of blocks) {
                addTimeRangeCoverage(
                    detCovered,
                    probCovered,
                    minuteRules,
                    ruleId,
                    b.from,
                    b.to,
                    prob
                );
            }
        } else if (type === SCHEDULE_RULES.fixed) {
            if (rule.window) {
                addTimeRangeCoverage(
                    detCovered,
                    probCovered,
                    minuteRules,
                    ruleId,
                    rule.window.from,
                    rule.window.to,
                    prob
                );
            }
        } else if (type === SCHEDULE_RULES.random) {
            if (rule.window) {
                addTimeRangeCoverage(
                    detCovered,
                    probCovered,
                    minuteRules,
                    ruleId,
                    rule.window.from,
                    rule.window.to,
                    prob
                );
            }
        } else if (type === SCHEDULE_RULES.weekly) {
            if (rule.window) {
                addTimeRangeCoverage(
                    detCovered,
                    probCovered,
                    minuteRules,
                    ruleId,
                    rule.window.from,
                    rule.window.to,
                    prob
                );
            }
        } else if (type === SCHEDULE_RULES.daily) {
            // Daily rules: the *whole* window is only probabilistically covered,
            // because the actual slot happens once somewhere inside it.
            if (rule.window) {
                addTimeRangeCoverage(
                    detCovered,
                    probCovered,
                    minuteRules,
                    ruleId,
                    rule.window.from,
                    rule.window.to,
                    0.5 // any value between 0 and 1 → marks as probabilistic (yellow)
                );
            }
        }
    }

    // Stats per day (exact minute-level)
    let hasUncovered = false;
    let hasOnlyProb = false;
    let coveredMinutes = 0;
    let uncoveredMinutes = 0;
    let probOnlyMinutes = 0;

    for (let m = 0; m < dayMinutes; m++) {
        const det = detCovered[m];
        const prob = probCovered[m];

        if (!det && !prob) {
            hasUncovered = true;
            uncoveredMinutes++;
        } else {
            coveredMinutes++;
            if (!det && prob) {
                hasOnlyProb = true;
                probOnlyMinutes++;
            }
        }
    }

    // Build contiguous segments for:
    //  - minutes with no coverage at all
    //  - minutes only covered by probabilistic rules
    function buildSegments(predicate) {
        const segments = [];
        let start = null;

        for (let m = 0; m <= dayMinutes; m++) {
            const match = m < dayMinutes && predicate(m);

            if (match) {
                if (start === null) start = m;
            } else if (start !== null) {
                segments.push({ startMin: start, endMin: m });
                start = null;
            }
        }

        return segments;
    }

    const uncoveredSegments = buildSegments((m) => !detCovered[m] && !probCovered[m]);
    const probOnlySegments = buildSegments((m) => !detCovered[m] && probCovered[m]);

    return {
        detCovered,
        probCovered,
        minuteRules,
        stats: {
            hasUncovered,
            hasOnlyProb,
            coveredMinutes,
            uncoveredMinutes,
            probOnlyMinutes,
        },
        uncoveredSegments,
        probOnlySegments,
    };
}

/**
 * Build 15-minute bins for visualization.
 * status:
 *  - "none"    : all minutes uncovered
 *  - "prob"    : only probabilistic coverage (no deterministic, no uncovered)
 *  - "det"     : some deterministic coverage, no uncovered minutes
 *  - "partial" : mix of covered & uncovered
 *
 * Also collects which rule IDs affect each bin.
 */
function buildBins(detCovered, probCovered, minuteRules, binSizeMinutes = 15) {
    const bins = [];
    const dayMinutes = 24 * 60;
    const binCount = dayMinutes / binSizeMinutes;

    for (let i = 0; i < binCount; i++) {
        const fromMin = i * binSizeMinutes;
        const toMin = fromMin + binSizeMinutes;

        let anyDet = false;
        let anyProb = false;
        let anyUncovered = false;

        const ruleSet = new Set();

        for (let m = fromMin; m < toMin; m++) {
            const det = detCovered[m];
            const prob = probCovered[m];

            if (det) {
                anyDet = true;
            } else if (prob) {
                anyProb = true;
            } else {
                anyUncovered = true;
            }

            for (const rid of minuteRules[m]) {
                ruleSet.add(rid);
            }
        }

        let status = "none";

        if (anyUncovered && !anyDet && !anyProb) {
            status = "none";
        } else if (!anyUncovered && !anyDet && anyProb) {
            status = "prob";
        } else if (!anyUncovered && anyDet) {
            status = "det";
        } else {
            status = "partial";
        }

        bins.push({
            fromMin,
            toMin,
            status,
            ruleIds: Array.from(ruleSet),
        });
    }

    return bins;
}

/**
 * Compute weekly coverage summary for a single NPC.
 */
function computeNpcWeeklyCoverage(npcDef) {
    const rules = npcDef.scheduleTemplate?.rules || [];
    const days = [];
    let anyUncovered = false;
    let anyOnlyProb = false;
    const totalMinutesWeek = 7 * 24 * 60;
    let coveredMinutesWeek = 0;

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dayName = DAY_NAMES[dayIndex];
        const dayKind = getDayKindForIndex(dayIndex);
        const dayKindLabel = getDayKindLabel(dayKind);

        const { detCovered, probCovered, minuteRules, stats, uncoveredSegments, probOnlySegments } =
            computeCoverageForDay(rules, dayIndex);

        const bins = buildBins(detCovered, probCovered, minuteRules, 15);

        if (stats.hasUncovered) anyUncovered = true;
        if (stats.hasOnlyProb) anyOnlyProb = true;

        coveredMinutesWeek += stats.coveredMinutes;

        days.push({
            index: dayIndex,
            name: dayName,
            kindLabel: dayKindLabel,
            stats,
            bins,
            uncoveredSegments,
            probOnlySegments,
        });
    }

    const coveragePercent = (coveredMinutesWeek / totalMinutesWeek) * 100;

    return {
        npcKey: npcDef.key,
        npcName: npcDef.name,
        rules: rules,
        days,
        summary: {
            hasAnyUncovered: anyUncovered,
            hasAnyOnlyProb: anyOnlyProb,
            coveragePercent,
            coveredMinutesWeek,
            totalMinutesWeek,
        },
    };
}

// --- rendering --------------------------------------------------------------

const STATUS_DESCRIPTIONS = {
    det: "Deterministic coverage",
    prob: "Only probabilistic rules cover this slice",
    partial: "Mixed covered & uncovered minutes",
    none: "No rule covers this slice",
};

function createHoursHeaderRow() {
    const wrapper = document.createElement("div");
    wrapper.className = "hours-row";

    const track = document.createElement("div");
    track.className = "hours-track";

    // 24 hours, each spanning 4 × 15min bins
    for (let h = 0; h < 24; h++) {
        const label = document.createElement("div");
        label.className = "hour-label";
        label.textContent = String(h).padStart(2, "0");
        label.style.gridColumn = `${h * 4 + 1} / span 4`;
        track.appendChild(label);
    }

    wrapper.appendChild(track);
    return wrapper;
}

function createRuleListElement(npcCoverage, npcCard) {
    const container = document.createElement("div");
    container.className = "rules-list";

    const rules = npcCoverage.rules || [];
    if (!rules.length) return container;

    for (const rule of rules) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "rule-chip";
        const ruleId = rule.id || "(no-id)";
        const ruleType = rule.type || "unknown";

        chip.dataset.ruleId = ruleId;

        chip.innerHTML = `<span class="id">${ruleId}</span><span class="type">${ruleType}${
            typeof rule.probability === "number" && rule.probability >= 0 && rule.probability < 1
                ? `, p=${rule.probability}`
                : ""
        }</span>`;

        // Hover: highlight segments
        chip.addEventListener("mouseenter", () => {
            highlightRule(npcCard, ruleId, true);
        });
        chip.addEventListener("mouseleave", () => {
            highlightRule(npcCard, ruleId, false);
        });

        container.appendChild(chip);
    }

    return container;
}

/**
 * Highlight / unhighlight all segments in npcCard that are affected by ruleId.
 * If ruleId is null, clear highlight.
 */
function highlightRule(npcCard, ruleId, enabled) {
    const segments = npcCard.querySelectorAll(".coverage-segment");

    if (!enabled || !ruleId) {
        // Clear all highlights
        segments.forEach((seg) => seg.classList.remove("highlight"));
        npcCard.classList.remove("highlighting");
        return;
    }

    npcCard.classList.add("highlighting");

    segments.forEach((seg) => {
        const rulesStr = seg.dataset.rules || "";
        const list = rulesStr ? rulesStr.split(",") : [];
        if (list.includes(ruleId)) {
            seg.classList.add("highlight");
        } else {
            seg.classList.remove("highlight");
        }
    });
}

function createNpcCard(npcCoverage) {
    const details = document.createElement("details");
    details.className = "card npc-card";

    // Open cards with uncovered minutes, close fully covered ones
    if (npcCoverage.summary.hasAnyUncovered) {
        details.open = true;
    }

    const coveragePct = npcCoverage.summary.coveragePercent || 0;
    const coveragePctStr = coveragePct.toFixed(1);

    const summary = document.createElement("summary");
    summary.innerHTML = `<strong>${npcCoverage.npcName} (${npcCoverage.npcKey})</strong> : <code>${coveragePctStr}%</code> of week covered`;
    details.appendChild(summary);

    // Inner content wrapper
    const content = document.createElement("div");

    const meta = document.createElement("div");
    meta.className = "npc-meta";
    // meta.textContent =
    //     "Static rule coverage only – ignores concrete calendar events. Hover a rule to see its time window.";
    content.appendChild(meta);

    const summaryLine = document.createElement("div");
    summaryLine.className = "summary-line";

    const pillCoverage = document.createElement("span");
    pillCoverage.className = "summary-pill";

    if (!npcCoverage.summary.hasAnyUncovered) {
        pillCoverage.classList.add("ok");
        pillCoverage.textContent =
            "✔ All minutes have at least some rule coverage (definite or probabilistic)";
    } else {
        pillCoverage.classList.add("error");
        pillCoverage.textContent = "⚠ Some minutes are never covered by any rule";
    }

    const pillProb = document.createElement("span");
    pillProb.className = "summary-pill";
    if (npcCoverage.summary.hasAnyOnlyProb) {
        pillProb.classList.add("warn");
        pillProb.textContent = "⚠ Some minutes are only covered by probabilistic rules";
    } else {
        pillProb.classList.add("ok");
        pillProb.textContent = "✔ All covered minutes have at least one deterministic rule";
    }

    summaryLine.appendChild(pillCoverage);
    summaryLine.appendChild(pillProb);
    content.appendChild(summaryLine);

    // Rule list (pass details as npcCard for highlighting)
    const ruleListEl = createRuleListElement(npcCoverage, details);
    content.appendChild(ruleListEl);

    const hoursRow = createHoursHeaderRow();
    content.appendChild(hoursRow);

    const daysContainer = document.createElement("div");
    daysContainer.className = "npc-days";

    for (const day of npcCoverage.days) {
        const dayRow = document.createElement("div");
        dayRow.className = "day-row";

        const label = document.createElement("div");
        label.className = "day-label";
        label.innerHTML = `<strong>${day.name}</strong> <span class="kind">(${day.kindLabel})</span>`;
        dayRow.appendChild(label);

        const coverageRow = document.createElement("div");
        coverageRow.className = "coverage-row";

        for (const bin of day.bins) {
            const seg = document.createElement("div");
            seg.className = "coverage-segment";

            seg.classList.add(
                bin.status === "det"
                    ? "coverage-det"
                    : bin.status === "prob"
                    ? "coverage-prob"
                    : bin.status === "partial"
                    ? "coverage-partial"
                    : "coverage-none"
            );

            const fromStr = formatMinutes(bin.fromMin);
            const toStr = formatMinutes(bin.toMin);
            const desc = STATUS_DESCRIPTIONS[bin.status] || bin.status;
            seg.title = `${day.name} ${fromStr}–${toStr}: ${desc}`;

            // Store which rules affect this bin
            seg.dataset.rules = (bin.ruleIds || []).join(",");

            coverageRow.appendChild(seg);
        }

        dayRow.appendChild(coverageRow);
        daysContainer.appendChild(dayRow);
    }

    content.appendChild(daysContainer);

    // Plaintext summary of uncovered / probabilistic-only time slots
    const gapsContainer = document.createElement("details");
    gapsContainer.className = "npc-gaps";

    let hasAnyGaps = false;

    for (const day of npcCoverage.days) {
        const dayUncovered = day.uncoveredSegments || [];
        const dayProbOnly = day.probOnlySegments || [];

        if (!dayUncovered.length && !dayProbOnly.length) continue;

        hasAnyGaps = true;

        for (const seg of dayUncovered) {
            const duration = seg.endMin - seg.startMin;
            if (duration <= 0) continue;

            const line = document.createElement("div");
            line.className = "gap-line gap-uncovered";

            const fromStr = formatMinutes(seg.startMin);
            const toStr = formatMinutes(seg.endMin);
            const durStr = formatDurationMinutes(duration);

            line.textContent = `${day.name}: ${fromStr}–${toStr} (${durStr}) no rule covers this time`;
            gapsContainer.appendChild(line);
        }

        for (const seg of dayProbOnly) {
            const duration = seg.endMin - seg.startMin;
            if (duration <= 0) continue;

            const line = document.createElement("div");
            line.className = "gap-line gap-prob-only";

            const fromStr = formatMinutes(seg.startMin);
            const toStr = formatMinutes(seg.endMin);
            const durStr = formatDurationMinutes(duration);

            line.textContent = `${day.name}: ${fromStr}–${toStr} (${durStr}) only rules with probability cover this time`;
            gapsContainer.appendChild(line);
        }
    }

    if (hasAnyGaps) {
        const gapsHeader = document.createElement("summary");
        gapsHeader.className = "npc-gaps-header";
        gapsHeader.textContent = "Uncovered / probabilistic-only times:";
        gapsContainer.appendChild(gapsHeader);
        content.appendChild(gapsContainer);
    }

    details.appendChild(content);

    return details;
}

window.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("npcCoverage");
    if (!container) return;

    if (!Array.isArray(window.NPC_REGISTRY)) {
        const errorCard = document.createElement("div");
        errorCard.className = "card";
        errorCard.textContent =
            "NPC_REGISTRY is not available on window. Check your script imports/paths.";
        container.appendChild(errorCard);
        return;
    }

    for (const npcDef of window.NPC_REGISTRY) {
        const coverage = computeNpcWeeklyCoverage(npcDef);
        const card = createNpcCard(coverage);
        container.appendChild(card);
    }
});
