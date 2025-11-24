const byId = (id) => document.getElementById(id);

const MAP_WIDTH = 70;
const MAP_HEIGHT = 50;

// ---------- Globals ----------
let world = null;
let scheduleManager = null;

const npcStates = []; // { id, npc, color, weekSchedule, nextIntentSlot, isAtMicroStop }
let activeNpcId = null;

let locationNodes = new Map();
let projectedPositions = new Map();
let npcMarkers = new Map(); // npcId -> svg circle element

let autoForwardTimer = null;
let isAutoForwarding = false;

// Palette for NPC dots
const NPC_COLORS = ["#ffcc00", "#ff66cc", "#00d68f", "#fd9644", "#a55eea", "#20bf6b"];

const NPCS = ["taylor", "shade", "officer_vega", "clara", "mike", "vincent"];

// ---------------------------
// World + NPC init
// ---------------------------

function initWorldAndNpcs(npcKeys) {
    const rnd = makeRNG(Date.now());

    world = new World({
        rnd,
        density: 0.15,
        startDate: new Date(),
        w: MAP_WIDTH,
        h: MAP_HEIGHT,
    });

    scheduleManager = new NPCScheduler({
        world,
        rnd,
    });

    npcStates.length = 0;

    const locIds = [...world.locations.keys()];
    if (!locIds.length) throw new Error("World has no locations");

    npcKeys.forEach((key, idx) => {
        const base = npcFromRegistryKey(key);
        if (!base) return;

        // Random home location
        const homeLocId = locIds[Math.floor(world.rnd() * locIds.length)];
        const homePlaceId = `home-${key}-${Math.floor(world.rnd() * 1e9)}`;

        const npc = new NPC({
            ...base,
            id: base.id || key,
            locationId: homeLocId,
            homeLocationId: homeLocId,
            homePlaceId,
            meta: base.meta || {},
        });

        const weekSchedule = scheduleManager.getCurrentWeekSchedule(npc);

        npcStates.push({
            id: key,
            npc,
            color: NPC_COLORS[idx % NPC_COLORS.length],
            weekSchedule,
            nextIntentSlot: null,
            isAtMicroStop: false,
        });
    });

    // First NPC in list becomes active tab
    activeNpcId = npcStates[0] ? npcStates[0].id : null;

    renderMap();
    buildNpcTabsAndPanels();

    // Sync all NPCs, but only render schedule for active one
    syncAllNpcsToCurrentTime();
    renderWorldTime();
    renderDayInfo();
    renderActiveNpcPanel();
}

// ---------------------------
// Schedule helpers
// ---------------------------

function getDayBuckets(slots) {
    const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
    const dayBuckets = new Map();

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

    return dayBuckets;
}

function findActiveSlotForTime(weekSchedule, date) {
    if (!weekSchedule) return null;

    if (date < weekSchedule.startDate || date >= weekSchedule.endDate) {
        return null; // caller will regenerate schedule
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

function syncNpcToCurrentTime(npcState) {
    const { npc } = npcState;
    if (!world || !npc || !scheduleManager) return;

    // Refresh this NPC's schedule if current week out of range
    const now = world.time.date;
    let ws = npcState.weekSchedule;
    if (!ws || now < ws.startDate || now >= ws.endDate) {
        ws = scheduleManager.getCurrentWeekSchedule(npc);
        npcState.weekSchedule = ws;
    }

    const slot = findActiveSlotForTime(ws, now);
    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    if (!slot) {
        npc.isInTransit = false;
        npcState.isAtMicroStop = false;
        if (npc.homeLocationId) {
            if (typeof npc.setLocationAndPlace === "function") {
                npc.setLocationAndPlace(npc.homeLocationId, npc.homePlaceId);
            } else {
                npc.setLocation(npc.homeLocationId);
            }
        }
        return;
    }

    const target = slot.target || {};
    const spec = target.spec || {};
    const mode = spec.mode;
    const isTravel = target.type === "travel";
    const isMicroStop = isTravel && spec.microStop === true;

    const isTransit = isTravel && mode !== "wait";

    npc.isInTransit = isTransit;
    npcState.isAtMicroStop = isMicroStop;

    if (!isTransit || isMicroStop) {
        let locId = null;
        let placeId = null;

        if (isTravel) {
            if (mode === "wait" || isMicroStop) {
                locId =
                    spec.toLocationId ??
                    spec.fromLocationId ??
                    npc.locationId ??
                    npc.homeLocationId;
            } else {
                locId = target.locationId || npc.homeLocationId || npc.locationId;
            }
        } else {
            locId = target.locationId || npc.homeLocationId || npc.locationId;
            placeId = target.placeId || null;
        }

        if (locId != null) {
            if (typeof npc.setLocationAndPlace === "function") {
                npc.setLocationAndPlace(locId, placeId);
            } else {
                npc.setLocation(locId);
            }
        }
    }

    // For active NPC, update next intent slot
    if (npcState.id === activeNpcId) {
        const peek = scheduleManager.peek(npc, 30, world.time.date);
        npcState.nextIntentSlot = peek.nextSlot || null;
    }
}

function syncAllNpcsToCurrentTime() {
    npcStates.forEach(syncNpcToCurrentTime);
    updateMapHighlights(); // also updates npc markers
}

// ---------------------------
// World info rendering
// ---------------------------

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

// ---------------------------
// Map rendering (locations + NPC dots)
// ---------------------------

function renderMap() {
    const host = byId("map");
    if (!host || !world) return;

    host.innerHTML = "";
    locationNodes = new Map();
    projectedPositions = new Map();
    npcMarkers = new Map();

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
    const targetWidth = 600;
    const targetHeight = 450;

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
    svg.style.background = "var(--map-bg, #050608)";

    // Roads
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

        line.classList.add("road-edge");
        line.dataset.a = String(a);
        line.dataset.b = String(b);

        svg.appendChild(line);
    }

    // Locations
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
            // Teleport active NPC only
            const state = npcStates.find((s) => s.id === activeNpcId);
            if (!state) return;
            state.npc.setLocation(id);
            state.npc.locationId = id;
            updateMapHighlights();
            renderActiveNpcPanel();
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

    // Create NPC markers (small colored dots, repositioned later)
    for (const state of npcStates) {
        const marker = document.createElementNS(svg.namespaceURI, "circle");
        marker.setAttribute("r", "5");
        marker.setAttribute("fill", state.color);
        marker.setAttribute("stroke", "#000");
        marker.setAttribute("stroke-width", "1.5");
        marker.style.pointerEvents = "none"; // don't block clicks
        svg.appendChild(marker);
        npcMarkers.set(state.id, marker);
    }

    host.appendChild(svg);
    updateMapHighlights();
}

// -------- Bus path highlight helpers (same idea as your Taylor code) --------

function clearHighlightedBusPath() {
    const host = byId("map");
    if (!host) return;
    const svg = host.querySelector("svg");
    if (!svg) return;

    svg.querySelectorAll("line.road-edge--highlight").forEach((line) => {
        line.classList.remove("road-edge--highlight");
    });
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

// ---------------------------
// Update NPC markers + home/current styling
// ---------------------------

function updateNpcMarkers() {
    if (!world) return;

    for (const state of npcStates) {
        const marker = npcMarkers.get(state.id);
        if (!marker) continue;

        const { npc, isAtMicroStop } = state;

        // hide when travelling and not at a walking micro-stop (same logic as before)
        if (npc.isInTransit && !isAtMicroStop) {
            marker.setAttribute("visibility", "hidden");
            continue;
        }

        const locId = npc.locationId ?? npc.homeLocationId;
        if (locId == null) {
            marker.setAttribute("visibility", "hidden");
            continue;
        }

        const pos = projectedPositions.get(String(locId));
        if (!pos) {
            marker.setAttribute("visibility", "hidden");
            continue;
        }

        marker.setAttribute("cx", String(pos.x));
        marker.setAttribute("cy", String(pos.y));
        marker.setAttribute("visibility", "visible");

        // Slightly enlarge marker for active NPC
        marker.setAttribute("r", state.id === activeNpcId ? "7" : "5");
    }
}

function updateMapHighlights() {
    if (!world) return;

    clearHighlightedBusPath();

    // Reset base location styling
    for (const [id, node] of locationNodes.entries()) {
        node.setAttribute("fill", "#2d6cdf");
        node.setAttribute("stroke", "#153b7a");
        node.setAttribute("stroke-width", "2");
        node.setAttribute("r", "8");
    }

    // Highlight homes for all NPCs (green outline)
    for (const state of npcStates) {
        const homeId = state.npc.homeLocationId;
        if (homeId == null) continue;
        const node = locationNodes.get(String(homeId));
        if (!node) continue;

        node.setAttribute("stroke", "#00d68f");
        node.setAttribute("stroke-width", "3");
    }

    // Additionally mark active NPC's home with extra radius
    const activeState = npcStates.find((s) => s.id === activeNpcId);
    if (activeState && activeState.npc.homeLocationId != null) {
        const node = locationNodes.get(String(activeState.npc.homeLocationId));
        if (node) {
            node.setAttribute("stroke-width", "4");
        }
    }

    // NPC markers (colored dots)
    updateNpcMarkers();

    // Highlight travel path for active NPC, if currently in travel slot
    if (!activeState) return;

    const now = world.time.date;
    const slot = findActiveSlotForTime(activeState.weekSchedule, now);
    if (slot && slot.target && slot.target.type === "travel") {
        const spec = slot.target.spec || {};
        const mode = spec.mode;
        if (mode === "bus" || (mode === "walk" && !spec.microStop)) {
            highlightBusPathForSlot(slot);
        }
    }
}

// ---------------------------
// NPC Panels + Tabs
// ---------------------------

function buildNpcTabsAndPanels() {
    const tabsEl = byId("npcTabs");
    const panelsEl = byId("npcPanels");
    if (!tabsEl || !panelsEl) return;

    tabsEl.innerHTML = "";
    panelsEl.innerHTML = "";

    console.log(npcStates);

    npcStates.forEach((state) => {
        const npc = state.npc;
        console.log(npc);

        // Tab
        const tab = document.createElement("button");
        tab.className = "npc-tab";
        tab.dataset.npcId = state.id;
        tab.innerHTML = `
            <span class="npc-tab-dot" style="background:${state.color}"></span>
            ${npc.meta?.shortName || npc.name || state.id}
        `;
        tab.addEventListener("click", () => {
            activeNpcId = state.id;
            renderActiveNpcPanel();
            updateMapHighlights();
        });
        tabsEl.appendChild(tab);

        // Panel
        const panel = document.createElement("div");
        panel.className = "npc-panel";
        panel.id = `npc-panel-${state.id}`;

        panel.innerHTML = `
            <div class="info-row">
                <span class="label">Name:</span>
                <span>${npc.name}</span><br>
                <span class="label">Description:</span>
                <span>${npc.meta?.description}</span>
            </div>
            <div class="info-row">
                <span class="label">Current location:</span>
                <span id="npc-${state.id}-current">—</span><br />
                <span class="label">Places at Current Location:</span>
                <span id="npc-${state.id}-places"></span>
            </div>
            <div class="info-row">
                <span class="label">Home location:</span>
                <span id="npc-${state.id}-home">—</span>
            </div>
            <div class="info-row">
                <span class="label">Next 30 min intent:</span>
                <span id="npc-${state.id}-nextIntent">—</span>
            </div>
            <p style="margin-top: 2px; font-size: 11px; color: var(--muted)">
                Hover the intent text to highlight the planned target location on the map.
            </p>

            <h2 style="margin-top: 12px; font-size: 16px">Current week schedule</h2>
            <p style="margin-top: 2px; font-size: 11px; color: var(--muted)">
                Hover "on the bus" entries to see a highlighted path on the map.
            </p>
            <div class="weekSchedule" id="npc-${state.id}-weekSchedule">Loading…</div>
        `;

        panelsEl.appendChild(panel);

        // Hover handlers for intent highlight
        const intentEl = panel.querySelector(`#npc-${state.id}-nextIntent`);
        if (intentEl) {
            intentEl.addEventListener("mouseenter", () => highlightIntentLocation(state, true));
            intentEl.addEventListener("mouseleave", () => highlightIntentLocation(state, false));
        }
    });

    updateTabActiveStates();
}

function updateTabActiveStates() {
    const tabsEl = byId("npcTabs");
    const panelsEl = byId("npcPanels");
    if (!tabsEl || !panelsEl) return;

    const tabs = tabsEl.querySelectorAll(".npc-tab");
    tabs.forEach((tab) => {
        const id = tab.dataset.npcId;
        tab.classList.toggle("npc-tab--active", id === activeNpcId);
    });

    const panels = panelsEl.querySelectorAll(".npc-panel");
    panels.forEach((panel) => {
        const id = panel.id.replace("npc-panel-", "");
        panel.classList.toggle("npc-panel--active", id === activeNpcId);
    });
}

function renderActiveNpcPanel() {
    updateTabActiveStates();

    const state = npcStates.find((s) => s.id === activeNpcId);
    if (!state) return;

    renderNpcInfo(state);
    renderNpcWeekSchedule(state);
    updateNextIntentText(state);
}

// ---------------------------
// Per-NPC info + schedule render
// ---------------------------

function renderNpcInfo(npcState) {
    const { npc } = npcState;
    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    const currentEl = byId(`npc-${npcState.id}-current`);
    const homeEl = byId(`npc-${npcState.id}-home`);
    const placesEl = byId(`npc-${npcState.id}-places`);

    const homeLoc = getLoc(npc.homeLocationId);
    if (homeEl) {
        homeEl.textContent = homeLoc ? `${homeLoc.name} (${homeLoc.id})` : "—";
    }

    const now = world.time.date;
    const ws = npcState.weekSchedule;
    const slot = ws ? findActiveSlotForTime(ws, now) : null;

    const fallbackLoc = getLoc(npc.locationId);

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

    // Travel state detail (same semantics as your Taylor view, simplified)
    if (slot.target.type === "travel") {
        const spec = slot.target.spec || {};
        const mode = spec.mode;
        const isMicroStop = spec.microStop === true;

        if (mode === "wait" || isMicroStop) {
            const locId =
                spec.toLocationId ?? spec.fromLocationId ?? npc.locationId ?? npc.homeLocationId;

            const loc = locId != null ? getLoc(locId) : null;
            const baseName = loc ? `${loc.name} (${loc.id})` : "somewhere";

            let label;
            if (mode === "wait") {
                label = `waiting at ${baseName}`;
            } else {
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

    // Activity/home
    const locId = slot.target.locationId || npc.locationId;
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

// ----- next intent + highlight -----

function findFirstNonTravelSlotAfter(weekSchedule, startSlot) {
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

function getIntentLocationData(npcState, slot) {
    if (!slot || !slot.target || !world) {
        return { loc: null, placeName: null, isHome: false };
    }

    const { npc } = npcState;

    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    if (slot.target.type !== "travel") {
        const locId = slot.target.locationId;
        if (!locId) return { loc: null, placeName: null, isHome: false };

        const loc = getLoc(locId);
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

    // Travel -> look ahead
    const destSlot = findFirstNonTravelSlotAfter(npcState.weekSchedule, slot);
    if (destSlot && destSlot.target && destSlot.target.locationId) {
        return getIntentLocationData(npcState, destSlot);
    }

    const spec = slot.target.spec || {};
    const locId = spec.toLocationId;
    if (locId == null) return { loc: null, placeName: null, isHome: false };

    const loc = getLoc(locId);
    return { loc, placeName: null, isHome: false };
}

function updateNextIntentText(npcState) {
    const el = byId(`npc-${npcState.id}-nextIntent`);
    if (!el || !scheduleManager || !npcState.npc) return;

    const peek = scheduleManager.peek(npcState.npc, 30, world.time.date);
    npcState.nextIntentSlot = peek.nextSlot || null;

    if (!peek.willMove || !npcState.nextIntentSlot) {
        el.textContent = "No move planned in the next 30 minutes.";
        return;
    }

    const slot = npcState.nextIntentSlot;
    const from = slot.from;
    const pad = (n) => (n < 10 ? "0" + n : "" + n);
    const timeStr = `${pad(from.getHours())}:${pad(from.getMinutes())}`;

    const { loc, placeName } = getIntentLocationData(npcState, slot);

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

function highlightIntentLocation(npcState, enabled) {
    if (!enabled) {
        updateMapHighlights();
        return;
    }

    updateMapHighlights(); // reset first

    if (!npcState.nextIntentSlot || !npcState.nextIntentSlot.target) return;

    const { loc } = getIntentLocationData(npcState, npcState.nextIntentSlot);
    if (!loc) return;

    const node = locationNodes.get(String(loc.id));
    if (!node) return;

    node.setAttribute("stroke", "#ff66cc");
    node.setAttribute("stroke-width", "4");
    node.setAttribute("r", "11");
}

// ----- week schedule renderer, per NPC -----

function attachBusHoverHandlers(container) {
    if (!container) return;

    if (container._busHoverBound) return;
    container._busHoverBound = true;

    container.addEventListener("mouseover", (ev) => {
        const el = ev.target.closest(".schedule-slot--bus");
        if (!el || !container.contains(el)) return;
        clearHighlightedBusPath();
        const pathStr = el.getAttribute("data-bus-path");
        if (!pathStr) return;
        const pairs = pathStr.split(",").filter(Boolean);

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
    });

    container.addEventListener("mouseout", (ev) => {
        const el = ev.target.closest(".schedule-slot--bus");
        if (!el || !container.contains(el)) return;
        clearHighlightedBusPath();
    });
}

//TODO: highlight what slot on the schedule the npc is following, add tiny button that scrolls it into view
function renderNpcWeekSchedule(npcState) {
    const container = byId(`npc-${npcState.id}-weekSchedule`);
    if (!container || !npcState.weekSchedule || !world) return;

    const slots = npcState.weekSchedule.slots || [];
    if (!slots.length) {
        container.textContent = "No schedule slots for this week.";
        return;
    }

    const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    const dayBuckets = getDayBuckets(slots);
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
                const last = walkGroup[walkGroup.length - 1];
                if (!last || last.to.getTime() === slot.from.getTime()) {
                    walkGroup.push(slot);
                } else {
                    flushWalkGroup();
                    walkGroup.push(slot);
                }
                continue;
            }

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

                    targetDesc = modeLabel;
                } else {
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

        flushWalkGroup();
    }

    container.innerHTML = lines.join("\n");
    attachBusHoverHandlers(container);
}

// ---------------------------
// Time controls
// ---------------------------

function advanceWorldMinutes(mins) {
    if (!world) return;
    world.advance(mins);
    syncAllNpcsToCurrentTime();
    renderWorldTime();
    renderDayInfo();
    renderActiveNpcPanel();
}

function bindButtons() {
    const plus1 = byId("btnTimePlus1");
    const plus30 = byId("btnTimePlus30");
    const plus120 = byId("btnTimePlus120");
    const plusWeek = byId("btnTimePlusWeek");
    const reset = byId("btnResetWorld");
    const autoBtn = byId("btnAutoForward");
    const slider = byId("speedSlider");
    const label = byId("speedLabel");

    if (plus1) plus1.addEventListener("click", () => advanceWorldMinutes(1));
    if (plus30) plus30.addEventListener("click", () => advanceWorldMinutes(30));
    if (plus120) plus120.addEventListener("click", () => advanceWorldMinutes(120));
    if (plusWeek) plusWeek.addEventListener("click", () => advanceWorldMinutes(7 * 24 * 60));

    if (reset) {
        reset.addEventListener("click", () => {
            initWorldAndNpcs(NPCS); // change list here
        });
    }

    if (slider && label) {
        slider.addEventListener("input", () => {
            const speed = 1000 - 1.9 * Number(slider.value);
            const minutesPerSecond = (1000 / speed).toFixed(1);
            label.textContent = `Speed: ${minutesPerSecond} s/min`;
        });
    }

    if (autoBtn) {
        autoBtn.addEventListener("click", () => {
            const speed = 1000 - 1.9 * Number(byId("speedSlider").value);

            if (!isAutoForwarding) {
                isAutoForwarding = true;
                autoBtn.textContent = "Pause Auto";

                autoForwardTimer = setInterval(() => {
                    advanceWorldMinutes(1);
                }, speed);
            } else {
                isAutoForwarding = false;
                autoBtn.textContent = "Play Schedule";

                if (autoForwardTimer !== null) {
                    clearInterval(autoForwardTimer);
                    autoForwardTimer = null;
                }
            }
        });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    // Pass whatever NPC keys you want to visualize
    initWorldAndNpcs(NPCS); // you can add more: ["taylor", "shade", "someOtherNpc"]
    bindButtons();
});
