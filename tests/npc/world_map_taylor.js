// tests/world/world_map_taylor.js

const byId = (id) => document.getElementById(id);

const MAP_WIDTH = 70;
const MAP_HEIGHT = 50;

let world = null;
let taylor = null;
let scheduleManager = null;
let weekSchedule = null;

let locationNodes = new Map();
let projectedPositions = new Map();

let nextIntentSlot = null;

// ---------------------------
// World + NPC init
// ---------------------------

function initWorldAndTaylor() {
    const rnd = makeRNG(Date.now());

    world = new World({
        rnd,
        density: 0.15,
        startDate: new Date(),
        w: MAP_WIDTH,
        h: MAP_HEIGHT,
    });

    const base = npcFromRegistryKey("taylor");

    taylor = new NPC({
        ...base,
        locationId: base.locationId || null,
        homeLocationId: base.homeLocationId || null,
        homePlaceId: base.homePlaceId || null,
        meta: base.meta || {},
    });

    if (!taylor.homeLocationId) {
        taylor.homeLocationId = taylor.locationId || [...world.locations.keys()][0];
    }

    scheduleManager = new NPCScheduler({
        world,
        rnd,
    });

    weekSchedule = scheduleManager.getCurrentWeekSchedule(taylor);

    renderMap();
    syncTaylorToCurrentTime();
    renderAllInfo();
    renderWeekSchedule();
}

// ---------------------------
// Schedule helpers
// ---------------------------

function findActiveSlotForTime(date) {
    if (!weekSchedule) return null;

    if (date < weekSchedule.startDate || date >= weekSchedule.endDate) {
        weekSchedule = scheduleManager.getCurrentWeekSchedule(taylor);
    }

    let active = null;
    for (const slot of weekSchedule.slots) {
        if (slot.from <= date && date < slot.to) {
            active = slot;
            break;
        }
        if (slot.from > date) break;
    }
    return active;
}

function syncTaylorToCurrentTime() {
    if (!world || !taylor || !scheduleManager) return;

    const now = world.time.date;
    const slot = findActiveSlotForTime(now);

    if (!slot) {
        if (taylor.homeLocationId) {
            if (typeof taylor.setLocationAndPlace === "function") {
                taylor.setLocationAndPlace(taylor.homeLocationId, taylor.homePlaceId);
            } else {
                taylor.setLocation(taylor.homeLocationId);
            }
        }
    } else {
        const locId = slot.target.locationId || taylor.homeLocationId || taylor.locationId;
        const placeId = slot.target.placeId || null;

        if (typeof taylor.setLocationAndPlace === "function") {
            taylor.setLocationAndPlace(locId, placeId);
        } else {
            taylor.setLocation(locId);
        }
    }

    updateMapHighlights();
    renderTaylorInfo();
    updateNextIntent();
}

// ---------------------------
// Rendering
// ---------------------------

function renderAllInfo() {
    renderTaylorInfo();
    renderWorldTime();
    renderDayInfo();
    updateNextIntent();
}

function renderWorldTime() {
    const el = byId("worldTime");
    if (!el || !world) return;
    const d = world.time.date;
    const pad = (n) => (n < 10 ? "0" + n : "" + n);
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    el.textContent = `${dateStr} ${timeStr}`;
}

function renderDayInfo() {
    const el = byId("dayType");
    if (!el || !world) return;

    const info = world.calendar.getDayInfo(world.time.date) || {};
    let text = info.kind || "unknown";

    // Try to show holiday/special info if available
    const tags = info.tags || [];
    const extra = [];

    if (info.isHoliday || tags.includes("holiday")) extra.push("holiday");
    if (info.isSpecial || tags.includes("special")) extra.push("special");

    if (info.name) extra.push(info.name);

    if (extra.length) {
        text += " (" + extra.join(", ") + ")";
    }

    el.textContent = text;
}

function renderTaylorInfo() {
    if (!taylor || !world) return;

    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    const currentLoc = getLoc(taylor.locationId);
    const homeLoc = getLoc(taylor.homeLocationId);

    const currentEl = byId("taylorCurrent");
    const homeEl = byId("taylorHome");

    if (currentEl) {
        currentEl.textContent = currentLoc ? `${currentLoc.name} (${currentLoc.id})` : "—";
    }
    byId("placesAtLoc").innerHTML =
        currentLoc.places.map((place) => `<code>${place.key}</code>`).join(" ") || "—";

    if (homeEl) {
        homeEl.textContent = homeLoc ? `${homeLoc.name} (${homeLoc.id})` : "—";
    }
}

function renderMap() {
    const host = byId("map");
    if (!host || !world) return;

    host.innerHTML = "";
    locationNodes = new Map();
    projectedPositions = new Map();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    const rawPos = new Map();
    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

    for (const [id, loc] of world.locations.entries()) {
        const x = Number(loc.x) || 0;
        const y = Number(loc.y) || 0;
        rawPos.set(id, { x, y });

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    if (minX === maxX) {
        minX -= 1;
        maxX += 1;
    }
    if (minY === maxY) {
        minY -= 1;
        maxY += 1;
    }

    const margin = 20;
    const targetWidth = (MAP_WIDTH || 100) * 10;
    const targetHeight = (MAP_HEIGHT || 50) * 10;

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const innerW = Math.max(1, targetWidth - margin * 2);
    const innerH = Math.max(1, targetHeight - margin * 2);

    const sx = innerW / worldW;
    const sy = innerH / worldH;
    const s = Math.min(sx, sy);

    const offsetX = margin + (innerW - worldW * s) / 2;
    const offsetY = margin + (innerH - worldH * s) / 2;

    const project = ({ x, y }) => ({
        x: offsetX + (x - minX) * s,
        y: offsetY + (y - minY) * s,
    });

    const ids = [...world.locations.keys()];
    const edges = [];
    const seenEdge = new Set();
    for (const id of ids) {
        const loc = world.getLocation ? world.getLocation(id) : world.locations.get(id);
        for (const [nbId] of loc.neighbors) {
            const key = id < nbId ? `${id}-${nbId}` : `${nbId}-${id}`;
            if (seenEdge.has(key)) continue;
            seenEdge.add(key);
            edges.push({ a: id, b: nbId, edge: loc.neighbors.get(nbId) });
        }
    }

    svg.setAttribute("viewBox", `0 0 ${targetWidth} ${targetHeight}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(targetHeight));
    svg.style.background = "var(--map-bg, #050608)";

    for (const { a, b } of edges) {
        const A = project(rawPos.get(a));
        const B = project(rawPos.get(b));
        const line = document.createElementNS(svg.namespaceURI, "line");
        line.setAttribute("x1", String(A.x));
        line.setAttribute("y1", String(A.y));
        line.setAttribute("x2", String(B.x));
        line.setAttribute("y2", String(B.y));
        line.setAttribute("stroke", "#26323b");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("stroke-linecap", "round");
        svg.appendChild(line);
    }

    for (const [id, loc] of world.locations.entries()) {
        const pos = project(rawPos.get(id));
        projectedPositions.set(id, pos);

        const node = document.createElementNS(svg.namespaceURI, "circle");
        node.setAttribute("cx", String(pos.x));
        node.setAttribute("cy", String(pos.y));
        node.setAttribute("r", "8");
        node.setAttribute("fill", "#2d6cdf");
        node.setAttribute("stroke", "#153b7a");
        node.setAttribute("stroke-width", "2");
        node.dataset.locationId = id;
        node.style.cursor = "pointer";

        node.addEventListener("click", () => {
            taylor.setLocation(id);
            updateMapHighlights();
            renderTaylorInfo();
            updateNextIntent();
        });

        const label = document.createElementNS(svg.namespaceURI, "text");
        label.setAttribute("x", String(pos.x + 10));
        label.setAttribute("y", String(pos.y + 4));
        label.setAttribute("font-size", "10");
        label.setAttribute("fill", "#91a4b1");
        label.textContent = loc.name;

        svg.appendChild(node);
        svg.appendChild(label);

        locationNodes.set(id, node);
    }

    host.appendChild(svg);
    updateMapHighlights();
}

// Highlight current & home; intent highlighting comes on top
function updateMapHighlights() {
    if (!taylor || !world) return;

    const currentId = String(taylor.locationId);
    const homeId = taylor.homeLocationId != null ? String(taylor.homeLocationId) : "";

    for (const [id, node] of locationNodes.entries()) {
        node.setAttribute("fill", "#2d6cdf");
        node.setAttribute("stroke", "#153b7a");
        node.setAttribute("stroke-width", "2");
        node.setAttribute("r", "8");

        if (id === homeId) {
            node.setAttribute("stroke", "#00d68f");
            node.setAttribute("stroke-width", "3");
        }
        if (id === currentId) {
            node.setAttribute("fill", "#ffcc00");
            node.setAttribute("r", "10");
        }
    }
}

// ---------------------------
// Intent display + hover highlight
// ---------------------------

function updateNextIntent() {
    const el = byId("taylorNextIntent");
    if (!el || !scheduleManager || !taylor) return;

    const peek = scheduleManager.peek(taylor, 30, world.time.date);
    nextIntentSlot = peek.nextSlot || null;

    if (!peek.willMove || !nextIntentSlot) {
        el.textContent = "No move planned in the next 30 minutes.";
        return;
    }

    const slot = nextIntentSlot;
    const from = slot.from;
    const pad = (n) => (n < 10 ? "0" + n : "" + n);
    const timeStr = `${pad(from.getHours())}:${pad(from.getMinutes())}`;

    let desc = "unknown destination";

    if (slot.target && slot.target.locationId) {
        const loc =
            world.getLocation?.(slot.target.locationId) ||
            world.locations.get(String(slot.target.locationId));
        if (loc) {
            desc = loc.name + ` (${loc.id})`;
        }
    }

    el.textContent = `${timeStr}: move to ${desc}`;
}

function highlightIntentLocation(enabled) {
    if (!enabled) {
        updateMapHighlights();
        return;
    }

    updateMapHighlights(); // reset first

    if (!nextIntentSlot || !nextIntentSlot.target) return;

    const locId = nextIntentSlot.target.locationId;
    if (!locId) return;

    const node = locationNodes.get(String(locId));
    if (!node) return;

    node.setAttribute("stroke", "#ff66cc");
    node.setAttribute("stroke-width", "4");
    node.setAttribute("r", "11");
}

// ---------------------------
// Week schedule rendering
// ---------------------------

function renderWeekSchedule() {
    const el = byId("weekSchedule");
    if (!el || !weekSchedule || !world) return;

    const slots = weekSchedule.slots || [];
    if (!slots.length) {
        el.textContent = "No schedule slots for this week.";
        return;
    }

    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    const dayBuckets = new Map(); // dateKey -> { date, slots[] }
    const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

    for (const slot of slots) {
        const d = slot.from;
        const y = d.getFullYear();
        const m = pad2(d.getMonth() + 1);
        const day = pad2(d.getDate());
        const dateKey = `${y}-${m}-${day}`; // LOCAL YYYY-MM-DD ✅

        let bucket = dayBuckets.get(dateKey);
        if (!bucket) {
            bucket = { date: new Date(y, d.getMonth(), d.getDate()), slots: [] };
            dayBuckets.set(dateKey, bucket);
        }
        bucket.slots.push(slot);
    }

    const sortedKeys = [...dayBuckets.keys()].sort();

    const lines = [];

    const pad = (n) => (n < 10 ? "0" + n : "" + n);

    for (const key of sortedKeys) {
        const { date, slots: daySlots } = dayBuckets.get(key);
        const dow = date.toLocaleDateString(undefined, { weekday: "short" });
        lines.push(`<div class="schedule-day">${dow} ${key}</div>`);

        daySlots.sort((a, b) => a.from - b.from);

        for (const slot of daySlots) {
            const from = slot.from;
            const to = slot.to;
            const timeStr = `${pad(from.getHours())}:${pad(from.getMinutes())}–${pad(
                to.getHours()
            )}:${pad(to.getMinutes())}`;

            let targetDesc = "home";

            if (slot.target?.type === "activity") {
                const locId = slot.target.locationId;
                const loc = locId ? getLoc(locId) : null;

                if (loc) {
                    targetDesc = `${loc.name} (${loc.id})`;
                } else {
                    const spec = slot.target.spec || {};
                    if (spec.type === "placeKey") {
                        targetDesc = `any '${spec.key}'`;
                    } else if (spec.type === "placeCategory") {
                        const cats = Array.isArray(spec.categories)
                            ? spec.categories
                            : [spec.categories || "category"];
                        targetDesc = `place with category: ${cats.join(", ")}`;
                    } else {
                        targetDesc = "activity";
                    }
                }
            }

            lines.push(
                `<div class="schedule-slot">${timeStr} – ${targetDesc} <span style="opacity:0.6;">[${slot.sourceRuleId}]</span></div>`
            );
        }
    }

    el.innerHTML = lines.join("\n");
}

// ---------------------------
// Time controls
// ---------------------------

function advanceWorldMinutes(mins) {
    if (!world) return;
    world.advance(mins);
    weekSchedule = scheduleManager.getCurrentWeekSchedule(taylor);
    syncTaylorToCurrentTime();
    renderWorldTime();
    renderDayInfo();
    renderWeekSchedule();
}

function bindButtons() {
    const plus30 = byId("btnTimePlus30");
    const plus120 = byId("btnTimePlus120");
    const plusWeek = byId("btnTimePlusWeek");
    const reset = byId("btnResetWorld");
    const nextIntentEl = byId("taylorNextIntent");

    if (plus30) {
        plus30.addEventListener("click", () => advanceWorldMinutes(30));
    }
    if (plus120) {
        plus120.addEventListener("click", () => advanceWorldMinutes(120));
    }
    if (plusWeek) {
        plusWeek.addEventListener("click", () => advanceWorldMinutes(7 * 24 * 60));
    }
    if (reset) {
        reset.addEventListener("click", () => {
            initWorldAndTaylor();
        });
    }

    if (nextIntentEl) {
        nextIntentEl.addEventListener("mouseenter", () => highlightIntentLocation(true));
        nextIntentEl.addEventListener("mouseleave", () => highlightIntentLocation(false));
    }
}

window.addEventListener("DOMContentLoaded", () => {
    initWorldAndTaylor();
    bindButtons();
});
