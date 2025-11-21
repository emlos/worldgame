const byId = (id) => document.getElementById(id);

let world = null;
let taylor = null;
let locationNodes = new Map();
let projectedPositions = new Map();

const MAP_WIDTH = 100;
const MAP_HEIGHT = 50;

// Create world + Taylor instance
function initTaylorWorld() {
    const rnd = makeRNG(Date.now());

    world = new World({
        rnd,
        density: 0.1,
        startDate: new Date(),
        w: MAP_WIDTH,
        h: MAP_HEIGHT,
    });

    const ids = [...world.locations.keys()];

    // pick a start location that has neighbours, fallback to first
    const startCandidates = ids.filter((id) => world.locations.get(id).neighbors.size > 0);
    const startId = startCandidates.length ? startCandidates[0] : ids[0];

    // pick a different home location if possible
    const homeId = ids.find((id) => id !== startId) || startId;

    const base = npcFromRegistryKey("taylor");

    taylor = new NPC({
        ...base,
        locationId: startId,
        homeLocationId: homeId,
        homePlaceId: null,
        meta: base.meta || {},
    });

    renderMap();
    renderTaylorInfo();
}

function renderTaylorInfo() {
    if (!taylor || !world) return;

    const currentLoc = world.getLocation(taylor.locationId);
    const homeLoc = world.getLocation(taylor.homeLocationId);

    const currentEl = byId("taylorCurrent");
    const homeEl = byId("taylorHome");

    if (currentEl) {
        currentEl.textContent = currentLoc ? `${currentLoc.name} (${currentLoc.id})` : "—";
    }

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

    // compute bounds
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const rawPos = new Map();

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

    const scaleX = (targetWidth - margin * 2) / (maxX - minX);
    const scaleY = (targetHeight - margin * 2) / (maxY - minY);

    const project = ({ x, y }) => {
        const px = margin + (x - minX) * scaleX;
        const py = margin + (y - minY) * scaleY;
        return { x: px, y: py };
    };

    // collect edges (no duplicates)
    const edges = [];
    for (const [aId, loc] of world.locations.entries()) {
        for (const [bId] of loc.neighbors.entries()) {
            if (aId < bId) {
                const e = world.getTravelEdge(aId, bId);
                if (e) edges.push({ a: aId, b: bId, minutes: e.minutes });
            }
        }
    }

    svg.setAttribute("viewBox", `0 0 ${targetWidth} ${targetHeight}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(targetHeight));
    svg.style.background = "var(--map-bg, transparent)";

    // draw edges
    for (const e of edges) {
        const aP = project(rawPos.get(e.a));
        const bP = project(rawPos.get(e.b));

        const line = document.createElementNS(svg.namespaceURI, "line");
        line.setAttribute("x1", String(aP.x));
        line.setAttribute("y1", String(aP.y));
        line.setAttribute("x2", String(bP.x));
        line.setAttribute("y2", String(bP.y));
        line.setAttribute("stroke", "#26323b");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("stroke-linecap", "round");

        svg.appendChild(line);
    }

    // draw nodes
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
            // Clicking a node will move Taylor directly there (handy for testing)
            taylor.setLocation(id);
            renderTaylorInfo();
            updateMapHighlights();
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

function updateMapHighlights() {
    if (!taylor || !world) return;

    const currentId = taylor.locationId;
    const homeId = taylor.homeLocationId;

    for (const [id, node] of locationNodes.entries()) {
        node.setAttribute("fill", "#2d6cdf");
        node.setAttribute("stroke", "#153b7a");
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

function moveTaylorRandomNeighbor() {
    if (!taylor || !world) return;

    const current = world.getLocation(taylor.locationId);
    if (!current) return;

    const neighborIds = [...current.neighbors.keys()];
    if (!neighborIds.length) return;

    const rnd = world.rnd || Math.random;
    const idx = Math.floor(rnd() * neighborIds.length) % neighborIds.length;
    const nextId = neighborIds[idx];

    taylor.setLocation(nextId);
    renderTaylorInfo();
    updateMapHighlights();
}

function bindButtons() {
    const stepBtn = byId("btnStep");
    const resetBtn = byId("btnResetWorld");

    if (stepBtn) {
        stepBtn.addEventListener("click", () => {
            moveTaylorRandomNeighbor();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            initTaylorWorld();
        });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    initTaylorWorld();
    bindButtons();
});
