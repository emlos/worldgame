// tests/npc/world_map_single.js

const byId = (id) => document.getElementById(id);

let world = null;
let activeNpc = null;
let scheduleManager = null;
let weekSchedule = null; // array of slots with .startDate/.endDate attached

let locationNodes = new Map();
let projectedPositions = new Map();
let nextIntentSlot = null;

let autoForwardTimer = null;
let isAutoForwarding = false;

// ---------------------------
// URL + config helpers
// ---------------------------

function pad2(n) {
    return String(n).padStart(2, "0");
}
function fmtYMD(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseNum(val, fallback) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
}

function parseStartDateFromYMD(ymd) {
    // Use 09:00 local so it matches fuzz defaults (and avoids midnight edge cases)
    if (!ymd) return new Date();
    const [y, m, d] = String(ymd)
        .split("-")
        .map((x) => parseInt(x, 10));
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d, 9, 0, 0, 0);
}

function weekStartForDate(date) {
    const base = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const day = base.getDay(); // 0=Sun, 1=Mon ...
    const monIndex = (day + 6) % 7; // Mon=0 ... Sun=6
    return new Date(base.getTime() - monIndex * MS_PER_DAY);
}

function getConfigFromUrl() {
    const p = new URLSearchParams(window.location.search);

    const npc = p.get("npc") || "taylor";
    const seed = Math.trunc(parseNum(p.get("seed"), Date.now()));
    const density = Math.max(0.01, Math.min(1, parseNum(p.get("density"), 0.15)));
    const w = Math.max(10, Math.trunc(parseNum(p.get("w"), 70)));
    const h = Math.max(10, Math.trunc(parseNum(p.get("h"), 50)));
    const start = parseStartDateFromYMD(p.get("start"));

    return { npcKey: npc, seed, density, w, h, startDate: start };
}

function getConfigFromUI() {
    const npcKey = String(byId("cfgNpc")?.value || "taylor").trim() || "taylor";
    const seed = Math.trunc(parseNum(byId("cfgSeed")?.value, Date.now()));
    const density = Math.max(0.01, Math.min(1, parseNum(byId("cfgDensity")?.value, 0.15)));
    const w = Math.max(10, Math.trunc(parseNum(byId("cfgW")?.value, 70)));
    const h = Math.max(10, Math.trunc(parseNum(byId("cfgH")?.value, 50)));

    const ymd = byId("cfgStartDate")?.value;
    const startDate = parseStartDateFromYMD(ymd);

    return { npcKey, seed, density, w, h, startDate };
}

function applyConfigToUI(cfg) {
    const npcSel = byId("cfgNpc");
    const seedEl = byId("cfgSeed");
    const densEl = byId("cfgDensity");
    const wEl = byId("cfgW");
    const hEl = byId("cfgH");
    const startEl = byId("cfgStartDate");

    if (npcSel) npcSel.value = cfg.npcKey;
    if (seedEl) seedEl.value = String(cfg.seed);
    if (densEl) densEl.value = String(cfg.density);
    if (wEl) wEl.value = String(cfg.w);
    if (hEl) hEl.value = String(cfg.h);
    if (startEl) startEl.value = fmtYMD(cfg.startDate);
}

function updateUrlFromConfig(cfg) {
    const u = new URL(window.location.href);
    u.searchParams.set("npc", String(cfg.npcKey));
    u.searchParams.set("seed", String(cfg.seed));
    u.searchParams.set("density", String(cfg.density));
    u.searchParams.set("w", String(cfg.w));
    u.searchParams.set("h", String(cfg.h));
    u.searchParams.set("start", fmtYMD(cfg.startDate));
    history.replaceState(null, "", u.toString());
}

function populateNpcSelect() {
    const sel = byId("cfgNpc");
    if (!sel) return;

    sel.innerHTML = "";

    // NPC_REGISTRY is available globally because debug=true and data.js assigns to window
    const list = Array.isArray(window.NPC_REGISTRY) ? window.NPC_REGISTRY : [];

    const usable = list.filter((d) => d && d.key && d.example !== true);

    if (!usable.length) {
        // fallback
        const opt = document.createElement("option");
        opt.value = "taylor";
        opt.textContent = "taylor";
        sel.appendChild(opt);
        return;
    }

    for (const def of usable) {
        const opt = document.createElement("option");
        opt.value = def.key;
        opt.textContent = def.key;
        sel.appendChild(opt);
    }
}

// ---------------------------
// World + NPC init
// ---------------------------

function getCurrentWeekScheduleFor(npc) {
    const weekStart = weekStartForDate(world.time.date);
    const slots = scheduleManager.getWeekSchedule(npc, weekStart);

    // mimic old API: attach metadata onto the array
    slots.startDate = weekStart;
    slots.endDate = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
    return slots;
}

function initWorldAndNpc(cfg) {
    const rnd = makeRNG(cfg.seed);

    world = new World({
        rnd,
        density: cfg.density,
        startDate: cfg.startDate,
        w: cfg.w,
        h: cfg.h,
    });

    const base = npcFromRegistryKey(cfg.npcKey);
    if (!base) {
        console.error(`npcFromRegistryKey("${cfg.npcKey}") returned null`);
        return;
    }

    const locIds = [...world.locations.keys()];
    const homeLocId = locIds[0];

    activeNpc = new NPC({
        ...base,
        id: base.id || cfg.npcKey,
        locationId: homeLocId,
        homeLocationId: homeLocId,
        homePlaceId: `home-${cfg.npcKey}-${cfg.seed}`,
        meta: base.meta || {},
    });

    scheduleManager = new NPCScheduler({ world, rnd });
    weekSchedule = getCurrentWeekScheduleFor(activeNpc);

    const titleName = byId("npcTitleName");
    if (titleName) titleName.textContent = base?.meta?.shortName || base?.name || cfg.npcKey;

    renderMap(cfg);
    syncNpcToCurrentTime();
    renderAllInfo();
    renderWeekSchedule();
}

// ---------------------------
// Schedule helpers
// ---------------------------

function findActiveSlotForTime(date) {
    if (!weekSchedule) return null;

    if (date < weekSchedule.startDate || date >= weekSchedule.endDate) {
        weekSchedule = getCurrentWeekScheduleFor(activeNpc);
    }

    for (const slot of weekSchedule) {
        if (slot.from <= date && date < slot.to) return slot;
        if (slot.from > date) break;
    }
    return null;
}

function syncNpcToCurrentTime() {
    if (!world || !activeNpc || !scheduleManager) return;

    const now = world.time.date;
    const slot = findActiveSlotForTime(now);

    if (!slot) {
        activeNpc.isInTransit = false;
        if (activeNpc.homeLocationId) {
            if (typeof activeNpc.setLocationAndPlace === "function") {
                activeNpc.setLocationAndPlace(activeNpc.homeLocationId, activeNpc.homePlaceId);
            } else {
                activeNpc.setLocation(activeNpc.homeLocationId);
            }
        }
    } else {
        const target = slot.target || {};
        const spec = target.spec || {};
        const mode = spec.mode;
        const isTravel = target.type === "travel";
        const isMicroStop = isTravel && spec.microStop === true;

        const isTransit = isTravel && mode !== "wait";
        activeNpc.isInTransit = isTransit;

        if (!isTransit || isMicroStop) {
            let locId = null;
            let placeId = null;

            if (isTravel) {
                if (mode === "wait" || isMicroStop) {
                    locId =
                        spec.toLocationId ??
                        spec.fromLocationId ??
                        activeNpc.locationId ??
                        activeNpc.homeLocationId;
                } else {
                    locId = target.locationId || activeNpc.homeLocationId || activeNpc.locationId;
                }
            } else {
                locId = target.locationId || activeNpc.homeLocationId || activeNpc.locationId;
                placeId = target.placeId || null;
            }

            if (locId != null) {
                if (typeof activeNpc.setLocationAndPlace === "function") {
                    activeNpc.setLocationAndPlace(locId, placeId);
                } else {
                    activeNpc.setLocation(locId);
                }
            }
        }
    }

    updateMapHighlights();
    renderNpcInfo();
    updateNextIntent();
}

// ---------------------------
// Rendering
// ---------------------------

function renderAllInfo() {
    renderNpcInfo();
    renderWorldTime();
    renderDayInfo();
    updateNextIntent();
}

function renderWorldTime() {
    const el = byId("worldTime");
    if (!el || !world) return;
    const d = world.time.date;
    const dateStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const timeStr = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

    if (extra.length) text += " (" + extra.join(", ") + ")";
    el.textContent = text;
}

function renderNpcInfo() {
    if (!activeNpc || !world) return;

    const now = world.time.date;
    const slot = findActiveSlotForTime(now);

    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    const currentEl = byId("taylorCurrent");
    const homeEl = byId("taylorHome");
    const placesEl = byId("placesAtLoc");

    const homeLoc = getLoc(activeNpc.homeLocationId);
    if (homeEl) homeEl.textContent = homeLoc ? `${homeLoc.name} (${homeLoc.id})` : "—";

    const fallbackLoc = getLoc(activeNpc.locationId);

    if (!slot || !slot.target) {
        if (currentEl)
            currentEl.textContent = fallbackLoc ? `${fallbackLoc.name} (${fallbackLoc.id})` : "—";
        if (placesEl) {
            if (fallbackLoc && Array.isArray(fallbackLoc.places) && fallbackLoc.places.length) {
                placesEl.innerHTML = fallbackLoc.places
                    .map((p) => `<code>${p.key}</code>`)
                    .join(" ");
            } else placesEl.textContent = "—";
        }
        return;
    }

    if (slot.target.type === "travel") {
        const spec = slot.target.spec || {};
        const mode = spec.mode;
        const isMicroStop = spec.microStop === true;

        if (mode === "wait" || isMicroStop) {
            const locId =
                spec.toLocationId ??
                spec.fromLocationId ??
                activeNpc.locationId ??
                activeNpc.homeLocationId;
            const loc = locId != null ? getLoc(locId) : null;
            const baseName = loc ? `${loc.name} (${loc.id})` : "somewhere";

            const label =
                mode === "wait" ? `waiting at ${baseName}` : `walking, paused at ${baseName}`;
            if (currentEl) currentEl.textContent = label;

            if (placesEl) {
                if (loc && Array.isArray(loc.places) && loc.places.length) {
                    placesEl.innerHTML = loc.places.map((p) => `<code>${p.key}</code>`).join(" ");
                } else placesEl.textContent = "—";
            }
            return;
        }
    }

    const locId = slot.target.locationId || activeNpc.locationId;
    const currentLoc = getLoc(locId);

    if (currentEl)
        currentEl.textContent = currentLoc ? `${currentLoc.name} (${currentLoc.id})` : "—";

    if (placesEl) {
        if (currentLoc && Array.isArray(currentLoc.places) && currentLoc.places.length) {
            placesEl.innerHTML = currentLoc.places.map((p) => `<code>${p.key}</code>`).join(" ");
        } else placesEl.textContent = "—";
    }
}

function renderMap(cfg) {
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
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
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
    const targetWidth = (cfg?.w || 70) * 9;
    const targetHeight = (cfg?.h || 50) * 11;

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
            edges.push({ a: id, b: nbId });
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
            activeNpc.setLocation(id);
            updateMapHighlights();
            renderNpcInfo();
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

        locationNodes.set(String(id), node);
    }

    host.appendChild(svg);
    updateMapHighlights();
}

function clearHighlightedBusPath() {
    const svg = byId("map")?.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("line.road-edge--highlight").forEach((line) =>
        line.classList.remove("road-edge--highlight")
    );
}

function highlightBusPathForSlot(slot) {
    if (!slot || !slot.target || !slot.target.spec) return;

    const spec = slot.target.spec;
    const pathEdges = Array.isArray(spec.pathEdges) ? spec.pathEdges : [];
    if (!pathEdges.length) return;

    const pairs = pathEdges.map((e) => `${e.fromId}-${e.toId}`);
    const svg = byId("map")?.querySelector("svg");
    if (!svg) return;

    svg.querySelectorAll("line.road-edge").forEach((line) => {
        const a = line.dataset.a;
        const b = line.dataset.b;
        const key1 = `${a}-${b}`;
        const key2 = `${b}-${a}`;
        if (pairs.includes(key1) || pairs.includes(key2))
            line.classList.add("road-edge--highlight");
    });
}

function highlightBusPathFromElement(el) {
    const pathStr = el?.getAttribute("data-bus-path");
    if (!pathStr) return;

    const pairs = pathStr.split(",").filter(Boolean);
    if (!pairs.length) return;

    const svg = byId("map")?.querySelector("svg");
    if (!svg) return;

    svg.querySelectorAll("line.road-edge").forEach((line) => {
        const a = line.dataset.a;
        const b = line.dataset.b;
        const key1 = `${a}-${b}`;
        const key2 = `${b}-${a}`;
        if (pairs.includes(key1) || pairs.includes(key2))
            line.classList.add("road-edge--highlight");
    });
}

function attachBusHoverHandlers() {
    const container = byId("weekSchedule");
    if (!container) return;
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

function updateMapHighlights() {
    if (!activeNpc || !world) return;

    clearHighlightedBusPath();

    const now = world.time.date;
    const slot = findActiveSlotForTime(now);

    let inMicroStop = false;
    if (slot && slot.target && slot.target.type === "travel") {
        const spec = slot.target.spec || {};
        if (spec.microStop === true) inMicroStop = true;
    }

    const currentId = activeNpc.isInTransit && !inMicroStop ? "" : String(activeNpc.locationId);
    const homeId = activeNpc.homeLocationId != null ? String(activeNpc.homeLocationId) : "";

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

    if (slot && slot.target && slot.target.type === "travel") {
        const spec = slot.target.spec || {};
        const mode = spec.mode;
        if (mode === "bus" || (mode === "walk" && !spec.microStop)) {
            highlightBusPathForSlot(slot);
        }
    }
}

// ---------------------------
// Intent display + hover highlight
// ---------------------------

function findFirstNonTravelSlotAfter(startSlot) {
    if (!weekSchedule || !startSlot) return null;
    const idx = weekSchedule.indexOf(startSlot);
    if (idx === -1) return null;

    for (let i = idx + 1; i < weekSchedule.length; i++) {
        const s = weekSchedule[i];
        if (!s.target) continue;
        if (s.target.type === "travel") continue;
        return s;
    }
    return null;
}

function getIntentLocationData(slot) {
    if (!slot || !slot.target || !world) return { loc: null, placeName: null, isHome: false };

    if (slot.target.type !== "travel") {
        const locId = slot.target.locationId;
        if (!locId) return { loc: null, placeName: null, isHome: false };

        const loc = world.getLocation?.(locId) || world.locations.get(String(locId));
        if (!loc) return { loc: null, placeName: null, isHome: false };

        const spec = slot.target.spec || {};
        const isHomeTarget =
            slot.target.type === TARGET_TYPE.home || spec.type === TARGET_TYPE.home;

        let placeName = null;
        if (isHomeTarget) {
            placeName = TARGET_TYPE.home;
        } else if (slot.target.placeId && Array.isArray(loc.places)) {
            const placeObj = loc.places.find((p) => p.id == slot.target.placeId);
            if (placeObj) placeName = placeObj.name || placeObj.key || null;
        }

        return { loc, placeName, isHome: isHomeTarget };
    }

    const destSlot = findFirstNonTravelSlotAfter(slot);
    if (destSlot && destSlot.target && destSlot.target.locationId)
        return getIntentLocationData(destSlot);

    const spec = slot.target.spec || {};
    const locId = spec.toLocationId;
    if (locId == null) return { loc: null, placeName: null, isHome: false };

    const loc = world.getLocation?.(locId) || world.locations.get(String(locId));
    return { loc, placeName: null, isHome: false };
}

function updateNextIntent() {
    const el = byId("taylorNextIntent");
    if (!el || !scheduleManager || !activeNpc) return;

    const peek = scheduleManager.peek(activeNpc, 30, world.time.date);
    nextIntentSlot = peek.nextSlot || null;

    if (!peek.willMove || !nextIntentSlot) {
        el.textContent = "No move planned in the next 30 minutes.";
        return;
    }

    const slot = nextIntentSlot;
    const from = slot.from;
    const timeStr = `${pad2(from.getHours())}:${pad2(from.getMinutes())}`;

    const { loc, placeName } = getIntentLocationData(slot);

    if (!loc) {
        el.textContent = `${timeStr}: move to unknown destination.`;
        return;
    }

    let desc = `${loc.name} (${loc.id})`;
    if (placeName) desc += `, targeting place: ${placeName}`;

    el.textContent = `${timeStr}: move to ${desc}.`;
}

function highlightIntentLocation(enabled) {
    if (!enabled) {
        updateMapHighlights();
        return;
    }

    updateMapHighlights();

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

    const slots = weekSchedule || [];
    if (!slots.length) {
        el.textContent = "No schedule slots for this week.";
        return;
    }

    const getLoc = (id) =>
        world.getLocation ? world.getLocation(id) : world.locations.get(String(id));

    const pad = (n) => (n < 10 ? "0" + n : "" + n);

    const dayBuckets = new Map();
    for (const slot of slots) {
        const d = slot.from;
        const y = d.getFullYear();
        const m = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
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
        `${pad(from.getHours())}:${pad(from.getMinutes())}–${pad(to.getHours())}:${pad(
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
        const header = `${dow} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
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
                if (!last || last.to.getTime() === slot.from.getTime()) walkGroup.push(slot);
                else {
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
                const isHomeTarget =
                    slot.target.type === TARGET_TYPE.home || spec.type === TARGET_TYPE.home;

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
                            place = TARGET_TYPE.home;
                        } else if (slot.target.placeId && Array.isArray(loc.places)) {
                            const placeObj = loc.places.find((p) => p.id == slot.target.placeId);
                            if (placeObj) place = placeObj.name || placeObj.key || "";
                        }

                        targetDesc = `${loc.name} (${loc.id})`;
                        if (place) targetDesc += ` – ${place}`;
                    } else {
                        targetDesc = isHomeTarget ? TARGET_TYPE.home : "activity";
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

    el.innerHTML = lines.join("\n");
    attachBusHoverHandlers();
}

// ---------------------------
// Time controls
// ---------------------------

function advanceWorldMinutes(mins) {
    if (!world) return;
    world.advance(mins);
    weekSchedule = getCurrentWeekScheduleFor(activeNpc);
    syncNpcToCurrentTime();
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
    const autoBtn = byId("btnAutoForward");

    const slider = byId("speedSlider");
    const label = byId("speedLabel");

    if (plus1) plus1.addEventListener("click", () => advanceWorldMinutes(1));
    if (plus30) plus30.addEventListener("click", () => advanceWorldMinutes(30));
    if (plus120) plus120.addEventListener("click", () => advanceWorldMinutes(120));
    if (plusWeek) plusWeek.addEventListener("click", () => advanceWorldMinutes(7 * 24 * 60));

    if (reset) {
        reset.addEventListener("click", () => {
            const cfg = getConfigFromUI();
            cfg.seed = Date.now();
            applyConfigToUI(cfg);
            updateUrlFromConfig(cfg);
            initWorldAndNpc(cfg);
        });
    }

    if (slider && label) {
        slider.addEventListener("input", () => {
            const speedMs = Math.max(10, 1000 - 1.9 * Number(slider.value));
            label.textContent = `Speed: ${(speedMs / 1000).toFixed(2)}s per +1 min`;
        });
    }

    if (autoBtn && slider) {
        autoBtn.addEventListener("click", () => {
            const speedMs = Math.max(10, 1000 - 1.9 * Number(slider.value));

            if (!isAutoForwarding) {
                isAutoForwarding = true;
                autoBtn.textContent = "Pause Auto";

                autoForwardTimer = setInterval(() => {
                    advanceWorldMinutes(1);
                }, speedMs);
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

    if (nextIntentEl) {
        nextIntentEl.addEventListener("mouseenter", () => highlightIntentLocation(true));
        nextIntentEl.addEventListener("mouseleave", () => highlightIntentLocation(false));
    }
}

// ---------------------------
// Config controls
// ---------------------------

function bindConfigControls() {
    const applyBtn = byId("btnApplyConfig");
    const copyBtn = byId("btnCopyLink");

    if (applyBtn) {
        applyBtn.addEventListener("click", () => {
            const cfg = getConfigFromUI();
            updateUrlFromConfig(cfg);
            initWorldAndNpc(cfg);
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
            try {
                const cfg = getConfigFromUI();
                updateUrlFromConfig(cfg);
                await navigator.clipboard.writeText(window.location.href);
                copyBtn.textContent = "Copied!";
                setTimeout(() => (copyBtn.textContent = "Copy link"), 800);
            } catch (e) {
                console.warn("Clipboard copy failed:", e);
            }
        });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    populateNpcSelect();

    const cfg = getConfigFromUrl();
    applyConfigToUI(cfg);
    updateUrlFromConfig(cfg);

    initWorldAndNpc(cfg);
    bindButtons();
    bindConfigControls();
});
