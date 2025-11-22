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

const seed = Date.now();

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
        taylor.isInTransit = false;
        if (taylor.homeLocationId) {
            if (typeof taylor.setLocationAndPlace === "function") {
                taylor.setLocationAndPlace(taylor.homeLocationId, taylor.homePlaceId);
            } else {
                taylor.setLocation(taylor.homeLocationId);
            }
        }
    } else {
        const target = slot.target || {};
        const spec = target.spec || {};
        const mode = spec.mode;
        const isTravel = target.type === "travel";
        const isMicroStop = isTravel && spec.microStop === true;

        // walk + bus = transit (including micro-stops)
        const isTransit = isTravel && mode !== "wait";

        taylor.isInTransit = isTransit;

        // We set location when:
        // - not in transit (normal activities / home / wait), OR
        // - we are in a walking micro-stop.
        if (!isTransit || isMicroStop) {
            let locId = null;
            let placeId = null;

            if (isTravel) {
                if (mode === "wait" || isMicroStop) {
                    // bus stop wait OR walking micro-stop at a node
                    locId =
                        spec.toLocationId ??
                        spec.fromLocationId ??
                        taylor.locationId ??
                        taylor.homeLocationId;
                } else {
                    // Any other non-transit travel mode (none right now)
                    locId = target.locationId || taylor.homeLocationId || taylor.locationId;
                }
            } else {
                // Regular activity/home slot
                locId = target.locationId || taylor.homeLocationId || taylor.locationId;
                placeId = target.placeId || null;
            }

            if (locId != null) {
                if (typeof taylor.setLocationAndPlace === "function") {
                    taylor.setLocationAndPlace(locId, placeId);
                } else {
                    taylor.setLocation(locId);
                }
            }
        }
        // If in transit and not a micro-stop, we still do not change taylor.locationId.
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

    const now = world.time.date;
    const slot = findActiveSlotForTime(now);

    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    const currentEl = byId("taylorCurrent");
    const homeEl = byId("taylorHome");
    const placesEl = byId("placesAtLoc");

    const homeLoc = getLoc(taylor.homeLocationId);
    if (homeEl) {
        homeEl.textContent = homeLoc ? `${homeLoc.name} (${homeLoc.id})` : "—";
    }

    const fallbackLoc = getLoc(taylor.locationId);

    // No active slot -> fallback to Taylor's current locationId
    if (!slot || !slot.target) {
        if (currentEl) {
            currentEl.textContent = fallbackLoc ? `${fallbackLoc.name} (${fallbackLoc.id})` : "—";
        }
        if (placesEl) {
            if (fallbackLoc && Array.isArray(fallbackLoc.places) && fallbackLoc.places.length) {
                placesEl.innerHTML = fallbackLoc.places
                    .map((place) => `<code>${place.key}</code>`)
                    .join(" ");
            } else {
                placesEl.textContent = "—";
            }
        }
        return;
    }

    // ---- TRAVEL STATES ----
    if (slot.target.type === "travel") {
        const spec = slot.target.spec || {};
        const mode = spec.mode;

        const isMicroStop = spec.microStop === true;

        if (mode === "wait" || isMicroStop) {
            const locId =
                spec.toLocationId ??
                spec.fromLocationId ??
                taylor.locationId ??
                taylor.homeLocationId;

            const loc = locId != null ? getLoc(locId) : null;
            const baseName = loc ? `${loc.name} (${loc.id})` : "somewhere";

            let label;
            if (mode === "wait") {
                label = `waiting at ${baseName}`;
            } else {
                // micro-stop while walking
                label = `walking, paused at ${baseName}`;
            }

            if (currentEl) currentEl.textContent = label;

            if (placesEl) {
                if (loc && Array.isArray(loc.places) && loc.places.length) {
                    placesEl.innerHTML = loc.places
                        .map((place) => `<code>${place.key}</code>`)
                        .join(" ");
                } else {
                    placesEl.textContent = "—";
                }
            }
            return;
        }
    }

    // otherwise: normal walking/bus (off-map)

    // ---- ACTIVITY / HOME STATES ----
    const locId = slot.target.locationId || taylor.locationId;
    const currentLoc = getLoc(locId);

    if (currentEl) {
        currentEl.textContent = currentLoc ? `${currentLoc.name} (${currentLoc.id})` : "—";
    }

    if (placesEl) {
        if (currentLoc && Array.isArray(currentLoc.places) && currentLoc.places.length) {
            placesEl.innerHTML = currentLoc.places
                .map((place) => `<code>${place.key}</code>`)
                .join(" ");
        } else {
            placesEl.textContent = "—";
        }
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
    const targetWidth = (MAP_WIDTH || 100) * 9;
    const targetHeight = (MAP_HEIGHT || 50) * 11;

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
    svg.setAttribute("height", String(targetHeight * 1.5));
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

        // NEW: mark this as a road between two locations
        line.classList.add("road-edge");
        line.dataset.a = String(a);
        line.dataset.b = String(b);

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

function clearHighlightedBusPath() {
    const host = byId("map");
    if (!host) return;
    const svg = host.querySelector("svg");
    if (!svg) return;

    svg.querySelectorAll("line.road-edge--highlight").forEach((line) => {
        line.classList.remove("road-edge--highlight");
    });
}

function highlightBusPathFromElement(el) {
    if (!el) return;
    const pathStr = el.getAttribute("data-bus-path");
    if (!pathStr) return;

    const pairs = pathStr.split(",").filter(Boolean);
    if (!pairs.length) return;

    const host = byId("map");
    if (!host) return;
    const svg = host.querySelector("svg");
    if (!svg) return;

    const roads = svg.querySelectorAll("line.road-edge");
    for (const line of roads) {
        const a = line.dataset.a;
        const b = line.dataset.b;
        const key1 = `${a}-${b}`;
        const key2 = `${b}-${a}`;
        if (pairs.includes(key1) || pairs.includes(key2)) {
            line.classList.add("road-edge--highlight");
        }
    }
}

function highlightBusPathForSlot(slot) {
    if (!slot || !slot.target || !slot.target.spec) return;

    const spec = slot.target.spec;
    const pathEdges = Array.isArray(spec.pathEdges) ? spec.pathEdges : [];
    if (!pathEdges.length) return;

    const pairs = pathEdges.map((e) => `${e.fromId}-${e.toId}`);

    const host = byId("map");
    if (!host) return;
    const svg = host.querySelector("svg");
    if (!svg) return;

    const roads = svg.querySelectorAll("line.road-edge");
    for (const line of roads) {
        const a = line.dataset.a;
        const b = line.dataset.b;
        const key1 = `${a}-${b}`;
        const key2 = `${b}-${a}`;
        if (pairs.includes(key1) || pairs.includes(key2)) {
            line.classList.add("road-edge--highlight");
        }
    }
}

function attachBusHoverHandlers() {
    const container = byId("weekSchedule");
    if (!container) return;

    // Use event delegation so we don't rebind on every render
    if (container._busHoverBound) return;
    container._busHoverBound = true;

    container.addEventListener("mouseover", (ev) => {
        const el = ev.target.closest(".schedule-slot--bus");
        if (!el || !container.contains(el)) return;
        clearHighlightedBusPath();
        highlightBusPathFromElement(el);
    });

    container.addEventListener("mouseout", (ev) => {
        const el = ev.target.closest(".schedule-slot--bus");
        if (!el || !container.contains(el)) return;
        clearHighlightedBusPath();
    });
}

// Highlight current & home; intent highlighting comes on top
function updateMapHighlights() {
    if (!taylor || !world) return;

    clearHighlightedBusPath();

    const now = world.time.date;
    const slot = findActiveSlotForTime(now);

    // Check if we're in a micro-stop walking segment
    let inMicroStop = false;
    if (slot && slot.target && slot.target.type === "travel") {
        const spec = slot.target.spec || {};
        if (spec.microStop === true) {
            inMicroStop = true;
        }
    }

    // If inTransit and not a micro-stop -> hide NPC pin.
    // If micro-stop or not in transit -> show NPC at taylor.locationId.
    const currentId = taylor.isInTransit && !inMicroStop ? "" : String(taylor.locationId);
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

    // Highlight path when travelling:
    // - bus: highlight the whole bus route
    // - walk (non-micro-stop): highlight the street segment being walked
    if (slot && slot.target && slot.target.type === "travel") {
        const spec = slot.target.spec || {};
        const mode = spec.mode;

        if (mode === "bus" || (mode === "walk" && !spec.microStop)) {
            highlightBusPathForSlot(slot); // works for walking too, uses pathEdges
        }
    }
}

// ---------------------------
// Intent display + hover highlight
// ---------------------------

function findFirstNonTravelSlotAfter(startSlot) {
    if (!weekSchedule || !weekSchedule.slots || !startSlot) return null;
    const slots = weekSchedule.slots;
    const idx = slots.indexOf(startSlot);
    if (idx === -1) return null;

    for (let i = idx + 1; i < slots.length; i++) {
        const s = slots[i];
        if (!s.target) continue;
        if (s.target.type === "travel") continue;
        return s;
    }
    return null;
}

// Returns { loc, placeName, isHome }
function getIntentLocationData(slot) {
    if (!slot || !slot.target || !world) {
        return { loc: null, placeName: null, isHome: false };
    }

    // Non-travel: use its locationId directly
    if (slot.target.type !== "travel") {
        const locId = slot.target.locationId;
        if (!locId) return { loc: null, placeName: null, isHome: false };

        const loc = world.getLocation?.(locId) || world.locations.get(String(locId));
        if (!loc) return { loc: null, placeName: null, isHome: false };

        const spec = slot.target.spec || {};
        const isHomeTarget = slot.target.type === "home" || spec.type === "home";

        let placeName = null;
        if (isHomeTarget) {
            placeName = "home";
        } else if (slot.target.placeId && Array.isArray(loc.places)) {
            const placeObj = loc.places.find((p) => p.id == slot.target.placeId);
            if (placeObj) {
                placeName = placeObj.name || placeObj.key || null;
            }
        }

        return { loc, placeName, isHome: isHomeTarget };
    }

    // Travel slot: look ahead for the destination activity/home
    const destSlot = findFirstNonTravelSlotAfter(slot);
    if (destSlot && destSlot.target && destSlot.target.locationId) {
        return getIntentLocationData(destSlot);
    }

    // Fallback: use toLocationId from the travel spec
    const spec = slot.target.spec || {};
    const locId = spec.toLocationId;
    if (locId == null) return { loc: null, placeName: null, isHome: false };

    const loc = world.getLocation?.(locId) || world.locations.get(String(locId));
    return { loc, placeName: null, isHome: false };
}

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

    const { loc, placeName } = getIntentLocationData(slot);

    if (!loc) {
        el.textContent = `${timeStr}: move to unknown destination.`;
        return;
    }

    let desc = `${loc.name} (${loc.id})`;
    if (placeName) {
        desc += `, targeting place: ${placeName}`;
    }

    el.textContent = `${timeStr}: move to ${desc}.`;
}

function highlightIntentLocation(enabled) {
    if (!enabled) {
        updateMapHighlights();
        return;
    }

    updateMapHighlights(); // reset first

    if (!nextIntentSlot || !nextIntentSlot.target) return;

    const { loc } = getIntentLocationData(nextIntentSlot);
    if (!loc) return;

    const node = locationNodes.get(String(loc.id));
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

    const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

    // Bucket slots per calendar day
    const dayBuckets = new Map(); // dateKey -> { date, slots[] }
    for (const slot of slots) {
        const d = slot.from;
        const y = d.getFullYear();
        const m = pad2(d.getMonth() + 1);
        const day = pad2(d.getDate());
        const dateKey = `${y}-${m}-${day}`;

        let bucket = dayBuckets.get(dateKey);
        if (!bucket) {
            bucket = { date: new Date(y, d.getMonth(), d.getDate()), slots: [] };
            dayBuckets.set(dateKey, bucket);
        }
        bucket.slots.push(slot);
    }

    const sortedKeys = [...dayBuckets.keys()].sort();
    const lines = [];

    const formatTimeRange = (from, to) =>
        `${pad2(from.getHours())}:${pad2(from.getMinutes())}–${pad2(to.getHours())}:${pad2(
            to.getMinutes()
        )}`;

    const isTravelWalk = (slot) =>
        slot &&
        slot.target &&
        slot.target.type === "travel" &&
        slot.target.spec &&
        slot.target.spec.mode === "walk";

    // Render each day
    for (const key of sortedKeys) {
        const { date, slots: daySlotsRaw } = dayBuckets.get(key);
        const daySlots = daySlotsRaw.slice().sort((a, b) => a.from - b.from);

        const dow = date.toLocaleDateString(undefined, { weekday: "short" });
        const header = `${dow} ${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
            date.getDate()
        )}`;
        lines.push(`<h3 class="schedule-day">${header}</h3>`);

        let walkGroup = [];

        const flushWalkGroup = () => {
            if (!walkGroup.length) return;

            const first = walkGroup[0];
            const last = walkGroup[walkGroup.length - 1];
            const from = first.from;
            const to = last.to;

            const totalMinutes = Math.round((to.getTime() - from.getTime()) / 60000);

            const streetNames = new Set();
            for (const s of walkGroup) {
                const spec = s.target && s.target.spec;
                if (spec && spec.streetName) streetNames.add(spec.streetName);
            }
            const streetCount = streetNames.size || walkGroup.length;

            const timeStr = formatTimeRange(from, to);
            const ruleId = first.sourceRuleId || "travel_auto";

            const summaryHtml = `${timeStr} – walking (${totalMinutes} min, ${streetCount} streets) <span style="opacity:0.6;">[${ruleId}]</span>`;

            // Build details list of each step with street name
            const detailLines = [];
            for (const step of walkGroup) {
                const sFrom = step.from;
                const sTo = step.to;
                const stepTime = formatTimeRange(sFrom, sTo);
                const spec = step.target && step.target.spec;
                const streetName = spec && spec.streetName ? spec.streetName : "street";
                const isMicro = spec && spec.microStop === true;

                let fromLoc = null;
                let toLoc = null;
                if (spec && spec.fromLocationId != null && spec.toLocationId != null) {
                    fromLoc = getLoc(spec.fromLocationId);
                    toLoc = getLoc(spec.toLocationId);
                }

                let stepLabel;
                if (isMicro) {
                    // At the node for a minute
                    const loc = toLoc || fromLoc;
                    const locLabel = loc ? `${loc.name} (${loc.id})` : "location";
                    stepLabel = `at ${locLabel}`;
                } else {
                    const fromLabel = fromLoc ? `${fromLoc.name} (${fromLoc.id})` : "";
                    const toLabel = toLoc ? `${toLoc.name} (${toLoc.id})` : "";
                    stepLabel =
                        fromLabel && toLabel
                            ? `${streetName} (${fromLabel} → ${toLabel})`
                            : streetName;
                }

                detailLines.push(`<li>${stepTime} – ${stepLabel}</li>`);
            }

            lines.push(
                `<details class="schedule-slot schedule-slot--walk"><summary>${summaryHtml}</summary><ul>${detailLines.join(
                    ""
                )}</ul></details>`
            );

            walkGroup = [];
        };

        for (const slot of daySlots) {
            if (isTravelWalk(slot)) {
                // part of a walking group
                const last = walkGroup[walkGroup.length - 1];
                if (!last || last.to.getTime() === slot.from.getTime()) {
                    walkGroup.push(slot);
                } else {
                    flushWalkGroup();
                    walkGroup.push(slot);
                }
                continue;
            }

            // Not a walking travel slot -> flush any existing group first
            flushWalkGroup();

            const from = slot.from;
            const to = slot.to;
            const timeStr = formatTimeRange(from, to);

            let mode = false;

            let targetDesc = "";
            const sourceId = slot.sourceRuleId || "";

            if (slot.target) {
                const spec = slot.target.spec || {};
                const isHomeTarget = slot.target.type === "home" || spec.type === "home";

                if (slot.target.type === "travel") {
                    mode = spec.mode || "travel";
                    let modeLabel = "travel";

                    if (mode === "walk") modeLabel = "walking";
                    else if (mode === "bus") modeLabel = "on the bus";
                    else if (mode === "wait") modeLabel = "waiting for bus";

                    // For travel, we don't show "at Location"; we show mode only.
                    targetDesc = modeLabel;
                } else {
                    // Activity/home: show location + place
                    const locId = slot.target.locationId;
                    const loc = locId ? getLoc(locId) : null;
                    if (loc) {
                        let place = "";
                        if (isHomeTarget) {
                            place = "home";
                        } else if (slot.target.placeId && Array.isArray(loc.places)) {
                            const placeObj = loc.places.find((p) => p.id == slot.target.placeId);
                            if (placeObj) {
                                place = placeObj.name || placeObj.key || "";
                            }
                        }

                        targetDesc = `${loc.name} (${loc.id})`;
                        if (place) {
                            targetDesc += ` – ${place}`;
                        }
                    } else {
                        targetDesc = isHomeTarget ? "home" : "activity";
                    }
                }
            }

            // Attach bus path info for hover highlighting
            let extraAttrs = "";
            const spec = slot.target && slot.target.spec;
            if (slot.target && slot.target.type === "travel" && spec && spec.mode === "bus") {
                const pathEdges = Array.isArray(spec.pathEdges) ? spec.pathEdges : [];
                const serialized = pathEdges.map((e) => `${e.fromId}-${e.toId}`).join(",");
                extraAttrs = ` class="schedule-slot schedule-slot--bus" data-bus-path="${serialized}"`;
            } else {
                extraAttrs = ` class="schedule-slot"`;
            }

            lines.push(
                `<div${extraAttrs}>${
                    mode === "bus" ? `<code class="busline-hover">` : ""
                }${timeStr} – ${targetDesc}${
                    mode === "bus" ? "</code>" : ""
                } <span style="opacity:0.6;">[${sourceId}]</span></div>`
            );
        }

        // In case the day ends with a walk group
        flushWalkGroup();
    }

    el.innerHTML = lines.join("\n");

    // After re-render, (re)bind hover handlers for bus rows
    attachBusHoverHandlers();
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
    const plus1 = byId("btnTimePlus1");
    const plus30 = byId("btnTimePlus30");
    const plus120 = byId("btnTimePlus120");
    const plusWeek = byId("btnTimePlusWeek");
    const reset = byId("btnResetWorld");
    const nextIntentEl = byId("taylorNextIntent");

    if (plus1) {
        plus1.addEventListener("click", () => advanceWorldMinutes(1));
    }

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
