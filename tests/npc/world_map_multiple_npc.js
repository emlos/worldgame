const byId = (id) => document.getElementById(id);

const MAP_WIDTH = 70;
const MAP_HEIGHT = 50;

// ---------- Globals ----------
let world = null;
let scheduleManager = null;

const npcStates = []; // { id, npc, color, weekSchedule, nextIntentSlot }
let activeNpcId = null;

let locationNodes = new Map();
let projectedPositions = new Map();
let npcMarkers = new Map(); // npcId -> svg circle element

let autoForwardTimer = null;
let isAutoForwarding = false;

// Palette for NPC dots
const NPC_COLORS = ["#ffcc00", "#ff66cc", "#00d68f", "#fd9644", "#a55eea", "#20bf6b"];

const NPCS = ["taylor", "shade", "officer_vega", "clara", "mike", "vincent"];

// Bridge to new NPCScheduler API (returns an array with .startDate/.endDate attached)
function getCurrentWeekScheduleFor(npc) {
    const now = world.time.date;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today
    const slots = scheduleManager.getWeekSchedule(npc, weekStart);

    // mimic old API: attach metadata onto the array
    slots.startDate = weekStart;
    slots.endDate = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
    return slots;
}

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

        const weekSchedule = getCurrentWeekScheduleFor(npc);

        npcStates.push({
            id: key,
            npc,
            color: NPC_COLORS[idx % NPC_COLORS.length],
            weekSchedule,
            nextIntentSlot: null,
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

    let active = null;
    for (const slot of weekSchedule) {
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

    const now = world.time.date;
    let ws = npcState.weekSchedule;

    // Refresh schedule if current time is outside cached week
    if (!ws || now < ws.startDate || now >= ws.endDate) {
        ws = getCurrentWeekScheduleFor(npc);
        npcState.weekSchedule = ws;
    }

    const slot = findActiveSlotForTime(ws, now);
    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    // Default state
    npc.isInTransit = false;
    npcState.isAtMicroStop = false;

    if (!slot) {
        // No slot → fallback to home
        if (npc.homeLocationId) {
            if (typeof npc.setLocationAndPlace === "function") {
                npc.setLocationAndPlace(npc.homeLocationId, npc.homePlaceId);
            } else {
                npc.setLocation(npc.homeLocationId);
            }
        }
    } else if (slot.activityType === "travel") {
        // TRAVEL SLOTS
        npc.isInTransit = true;

        // "micro stop" = lingering at a concrete location (walk_linger / bus_wait / bus_linger)
        const isMicroStop = !!slot.locationId;
        npcState.isAtMicroStop = isMicroStop;

        if (isMicroStop) {
            const locId =
                slot.locationId ??
                (slot.location && slot.location.id) ??
                npc.locationId ??
                npc.homeLocationId;

            const placeId = slot.placeId ?? null;

            if (locId != null) {
                if (typeof npc.setLocationAndPlace === "function") {
                    npc.setLocationAndPlace(locId, placeId);
                } else {
                    npc.setLocation(locId);
                }
            }
        } else {
            // edge / bus_ride / car_drive → NPC is "between" locations, marker hidden
            // keep last known location, don't teleport
        }
    } else {
        // STAY SLOTS
        npc.isInTransit = false;
        npcState.isAtMicroStop = false;

        const locId =
            slot.locationId ??
            (slot.location && slot.location.id) ??
            npc.locationId ??
            npc.homeLocationId;

        const placeId = slot.placeId ?? null;

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

// ---------------------------
// Update NPC markers + home/current styling
// ---------------------------

function updateNpcMarkers() {
    if (!world) return;

    for (const state of npcStates) {
        const marker = npcMarkers.get(state.id);
        if (!marker) continue;

        const { npc } = state;

        // hide when travelling and NOT at a micro-stop
        if (npc.isInTransit && !state.isAtMicroStop) {
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

    resetRoadHighlights();

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
}

function resetRoadHighlights() {
    const mapEl = byId("map");
    if (!mapEl) return;
    const svg = mapEl.querySelector("svg");
    if (!svg) return;

    const edges = svg.querySelectorAll(".road-edge");
    edges.forEach((line) => {
        line.setAttribute("stroke", "#26323b");
        line.setAttribute("stroke-width", "2");
    });
}

function highlightTravelGroupPath(group, enabled) {
    resetRoadHighlights();
    if (!enabled || !group || !group.slots || !group.slots.length) return;
    if (!world || !world.map) return;

    const mapObj = world.map;

    // Collect all traveled edges (a-b key where a<b)
    const edgeKeys = new Set();

    for (const slot of group.slots) {
        if (slot.activityType !== "travel") continue;

        const meta = slot.travelMeta || {};
        const from = meta.fromLocationId;
        const to = meta.toLocationId;
        if (!from || !to) continue;

        const kind = slot.travelSegmentKind;

        // 1) Walking edge: already a single edge
        if (kind === "walk_edge") {
            const a = String(from);
            const b = String(to);
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            edgeKeys.add(key);
            continue;
        }

        // 2) Car / bus ride: reconstruct the multi-edge path
        if (kind === "car_drive" || kind === "bus_ride") {
            const route = mapObj.getTravelTotal(String(from), String(to));
            if (!route || !Array.isArray(route.locations) || route.locations.length < 2) continue;

            const locs = route.locations;
            for (let i = 0; i < locs.length - 1; i++) {
                const a = String(locs[i]);
                const b = String(locs[i + 1]);
                const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                edgeKeys.add(key);
            }
        }

        // 3) Other travel segment kinds (walk_linger, bus_wait, bus_linger) –
        //    they don't correspond to edges, just locations, so we ignore them here.
    }

    const mapEl = byId("map");
    if (!mapEl) return;
    const svg = mapEl.querySelector("svg");
    if (!svg) return;

    const edges = svg.querySelectorAll(".road-edge");
    edges.forEach((line) => {
        const a = line.dataset.a;
        const b = line.dataset.b;
        if (!a || !b) return;
        const key1 = `${a}-${b}`;
        const key2 = `${b}-${a}`;

        if (edgeKeys.has(key1) || edgeKeys.has(key2)) {
            line.setAttribute("stroke", "#f5f81a");
            line.setAttribute("stroke-width", "4");
        }
    });
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

    // No active slot -> just show current/fallback
    if (!slot) {
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

    // Use new slot: locationId/placeId
    const locId =
        slot.locationId ??
        (slot.location && slot.location.id) ??
        npc.locationId ??
        npc.homeLocationId;
    const currentLoc = locId != null ? getLoc(locId) : null;

    if (currentEl) {
        currentEl.textContent = currentLoc ? `${currentLoc.name} (${currentLoc.id})` : "—";
    }

    if (placesEl) {
        if (currentLoc && Array.isArray(currentLoc.places) && currentLoc.places.length) {
            const html = currentLoc.places
                .map((place) => {
                    const isActive = slot.placeId && place.id == slot.placeId;
                    const label = place.name || place.key || place.id;
                    return isActive
                        ? `<strong><code>${label}</code></strong>`
                        : `<code>${label}</code>`;
                })
                .join(" ");
            placesEl.innerHTML = html;
        } else {
            placesEl.textContent = "—";
        }
    }
}

// ----- next intent + highlight -----

function findFirstNonTravelSlotAfter(weekSchedule, startSlot) {
    if (!weekSchedule || !startSlot) return null;
    const slots = weekSchedule;
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
    if (!slot || !world) {
        return { loc: null, placeName: null, isHome: false };
    }

    const { npc } = npcState;
    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    const locId =
        slot.locationId ??
        (slot.location && slot.location.id) ??
        npc.locationId ??
        npc.homeLocationId;

    const loc = locId != null ? getLoc(locId) : null;
    if (!loc) return { loc: null, placeName: null, isHome: false };

    let placeName = null;
    if (slot.placeId && Array.isArray(loc.places)) {
        const placeObj = loc.places.find((p) => p.id == slot.placeId);
        if (placeObj) {
            placeName = placeObj.name || placeObj.key || null;
        }
    }

    const isHome = npc.homeLocationId != null && loc.id === npc.homeLocationId;

    return { loc, placeName, isHome };
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

function renderNpcWeekSchedule(npcState) {
    const container = byId(`npc-${npcState.id}-weekSchedule`);
    if (!container || !npcState.weekSchedule || !world) return;

    const slots = npcState.weekSchedule || [];
    container.innerHTML = "";

    if (!slots.length) {
        container.textContent = "No schedule slots for this week.";
        return;
    }

    const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    const dayBuckets = getDayBuckets(slots);
    const sortedKeys = [...dayBuckets.keys()].sort();

    const now = world.time.date;
    const activeSlot = findActiveSlotForTime(slots, now);

    const formatTimeRange = (from, to) =>
        `${pad2(from.getHours())}:${pad2(from.getMinutes())}–${pad2(to.getHours())}:${pad2(
            to.getMinutes()
        )}`;

    for (const key of sortedKeys) {
        const { date, slots: daySlotsRaw } = dayBuckets.get(key);
        const daySlots = daySlotsRaw.slice().sort((a, b) => a.from - b.from);

        const dow = date.toLocaleDateString(undefined, { weekday: "short" });
        const headerText = `${dow} ${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
            date.getDate()
        )}`;

        const headerEl = document.createElement("h3");
        headerEl.className = "schedule-day";
        headerEl.textContent = headerText;
        container.appendChild(headerEl);

        const groups = groupDaySlotsForTravel(daySlots);

        for (const group of groups) {
            if (group.type === "stay") {
                // Render each stay slot normally
                for (const slot of group.slots) {
                    const from = slot.from;
                    const to = slot.to;
                    const timeStr = formatTimeRange(from, to);

                    const locId =
                        slot.locationId ??
                        (slot.location && slot.location.id) ??
                        npcState.npc.locationId ??
                        npcState.npc.homeLocationId;

                    const loc = locId != null ? getLoc(locId) : null;

                    let desc = loc ? `${loc.name} (${loc.id})` : "Unknown location";
                    if (slot.placeId && loc && Array.isArray(loc.places)) {
                        const placeObj = loc.places.find((p) => p.id == slot.placeId);
                        if (placeObj) {
                            const label = placeObj.name || placeObj.key || placeObj.id;
                            desc += ` – ${label}`;
                        }
                    }

                    const sourceId = slot.sourceRuleId || "";
                    const ruleType = slot.ruleType || "";

                    const div = document.createElement("div");
                    const classNames = ["schedule-slot"];
                    if (activeSlot && slot === activeSlot) {
                        classNames.push("schedule-slot--active");
                    }
                    div.className = classNames.join(" ");
                    div.innerHTML =
                        `${timeStr} – ${desc} ` +
                        `<span style="opacity:0.6;">[${ruleType ? ruleType : "rule"}${
                            sourceId ? ": " + sourceId : ""
                        }]</span>`;

                    container.appendChild(div);
                }
            } else if (group.type === "walk") {
                // Walking travel: collapse into <details>
                const firstSlot = group.slots[0];
                const lastSlot = group.slots[group.slots.length - 1];

                const from = firstSlot.from;
                const to = lastSlot.to;
                const timeStr = formatTimeRange(from, to);

                const totalMinutes = Math.round((to.getTime() - from.getTime()) / 60000);
                const streets = group.slots.filter(
                    (s) => s.travelSegmentKind === "walk_edge"
                ).length;

                const details = document.createElement("details");
                details.className =
                    "schedule-slot schedule-slot--travel schedule-slot--travel-walk";

                const summary = document.createElement("summary");
                summary.textContent = `${timeStr} – Walking (${totalMinutes} min, ${streets} streets)`;
                details.appendChild(summary);

                // Inner list of walking steps
                const list = document.createElement("ul");
                list.style.margin = "4px 0 0 16px";
                list.style.fontSize = "11px";

                for (const slot of group.slots) {
                    const li = document.createElement("li");
                    const tStr = formatTimeRange(slot.from, slot.to);

                    if (slot.travelSegmentKind === "walk_edge") {
                        const meta = slot.travelMeta || {};
                        const a = meta.fromLocationId;
                        const b = meta.toLocationId;
                        const aLoc = a ? getLoc(a) : null;
                        const bLoc = b ? getLoc(b) : null;
                        const aName = aLoc ? aLoc.name : a || "?";
                        const bName = bLoc ? bLoc.name : b || "?";
                        li.textContent = `${tStr} – walk from ${aName} to ${bName}`;
                    } else if (slot.travelSegmentKind === "walk_linger") {
                        const locId =
                            slot.locationId ?? (slot.location && slot.location.id) ?? null;
                        const loc = locId != null ? getLoc(locId) : null;
                        const name = loc ? `${loc.name} (${loc.id})` : "location";
                        li.textContent = `${tStr} – short stop at ${name}`;
                    } else {
                        li.textContent = `${tStr} – walking (segment)`;
                    }

                    list.appendChild(li);
                }

                details.appendChild(list);
                container.appendChild(details);
            } else if (group.type === "bus" || group.type === "car") {
                // Bus/car travel: single summarized line with hover path highlight
                const firstSlot = group.slots[0];
                const lastSlot = group.slots[group.slots.length - 1];

                const from = firstSlot.from;
                const to = lastSlot.to;
                const timeStr = formatTimeRange(from, to);
                const totalMinutes = Math.round((to.getTime() - from.getTime()) / 60000);

                const div = document.createElement("div");
                const classNames = [
                    "schedule-slot",
                    "schedule-slot--travel",
                    `schedule-slot--travel-${group.type}`,
                ];
                if (activeSlot && group.slots.includes(activeSlot)) {
                    classNames.push("schedule-slot--active");
                }
                div.className = classNames.join(" ");

                const label = group.type === "bus" ? "On the bus" : "Travelling by car";

                div.innerHTML = `<code>${timeStr} – ${label} (${totalMinutes} min)</code>`;

                // Hover to highlight the route on the map
                div.addEventListener("mouseenter", () => highlightTravelGroupPath(group, true));
                div.addEventListener("mouseleave", () => highlightTravelGroupPath(group, false));

                container.appendChild(div);
            } else {
                // Unknown travel mode: just dump as plain slots
                for (const slot of group.slots) {
                    const from = slot.from;
                    const to = slot.to;
                    const timeStr = formatTimeRange(from, to);
                    const div = document.createElement("div");
                    div.className = "schedule-slot";
                    div.textContent = `${timeStr} – [${group.type} travel]`;
                    container.appendChild(div);
                }
            }
        }
    }

    // Scroll active slot into view if present
    const activeEl =
        container.querySelector(".schedule-slot--active") ||
        container.querySelector("details.schedule-slot--active");
    if (activeEl) {
        activeEl.scrollIntoView({ block: "center" });
    }
}

function groupDaySlotsForTravel(daySlots) {
    const groups = [];
    let currentGroup = null;

    const commit = () => {
        if (currentGroup && currentGroup.slots.length) {
            groups.push(currentGroup);
        }
        currentGroup = null;
    };

    for (const slot of daySlots) {
        const isTravel = slot.activityType === "travel";
        const mode = isTravel ? slot.travelMode : null;

        if (!isTravel || !mode) {
            // non-travel slot
            commit();
            groups.push({ type: "stay", slots: [slot] });
            continue;
        }

        // travel slot
        if (!currentGroup || currentGroup.type !== mode) {
            commit();
            currentGroup = { type: mode, slots: [slot] };
        } else {
            currentGroup.slots.push(slot);
        }
    }

    commit();
    return groups;
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
