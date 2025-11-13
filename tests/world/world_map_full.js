function init() {
  // ------- World creation (random but stable per refresh) -------
  const world = new World({
    seed: Date.now(),
    locationCount: 50,
    startDate: new Date(), // now
  });

  // ------- DOM helpers -------
  const byId = (id) => document.getElementById(id);


  // ------- Map renderer (SVG grid, no crossing) -------
  function renderMap() {
    const host = byId("map");
    if (!host) return;
    host.innerHTML = "";

    // --- Tooltip ---
    let tip = byId("map-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "map-tip";
      tip.style.position = "fixed";
      tip.style.pointerEvents = "none";
      tip.style.padding = "6px 8px";
      tip.style.borderRadius = "6px";
      tip.style.background = "rgba(0,0,0,0.75)";
      tip.style.color = "#fff";
      tip.style.fontSize = "12px";
      tip.style.zIndex = "9999";
      tip.style.display = "none";
      document.body.appendChild(tip);
    }
    const showTip = (html, x, y) => {
      tip.innerHTML = html;
      tip.style.left = x + 12 + "px";
      tip.style.top = y + 12 + "px";
      tip.style.display = "block";
    };
    const hideTip = () => (tip.style.display = "none");

    // --- Pull intrinsic positions from the world ---
    const ids = [...world.locations.keys()];
    if (!ids.length) return;

    // Compute bounds
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const rawPos = new Map();
    for (const id of ids) {
      const loc = world.locations.get(id);
      const x = Number(loc.x) || 0;
      const y = Number(loc.y) || 0;
      rawPos.set(id, { x, y });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // Avoid zero-size bounds
    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }

    // --- Target canvas sizing ---
    const margin = 20;
    const targetHeight = 800; // tweak if you like
    const targetWidth = 1000;

    const worldW = maxX - minX;
    const worldH = maxY - minY;

    const innerW = Math.max(1, targetWidth - margin * 2);
    const innerH = Math.max(1, targetHeight - margin * 2);

    const sx = innerW / worldW;
    const sy = innerH / worldH;
    const s = Math.min(sx, sy); // preserve aspect ratio

    const offsetX = margin + (innerW - worldW * s) / 2;
    const offsetY = margin + (innerH - worldH * s) / 2;

    const project = ({ x, y }) => ({
      x: offsetX + (x - minX) * s,
      y: offsetY + (y - minY) * s,
    });

    // --- Gather real edges from world (unique undirected) ---
    const edges = [];
    for (const [aId, loc] of world.locations.entries()) {
      for (const [bId] of loc.neighbors.entries()) {
        if (aId < bId) {
          const e = world.getTravelEdge(aId, bId);
          if (e) edges.push({ a: aId, b: bId, minutes: e.minutes, street: e.streetName });
        }
      }
    }

    // --- SVG ---
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${targetWidth} ${targetHeight}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(targetHeight));
    svg.style.background = "var(--map-bg, transparent)";

    // defs for hover glow
    const defs = document.createElementNS(svg.namespaceURI, "defs");
    const glow = document.createElementNS(svg.namespaceURI, "filter");
    glow.setAttribute("id", "edgeGlow");
    glow.innerHTML = `<feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#000" flood-opacity="0.35"/>`;
    defs.appendChild(glow);
    svg.appendChild(defs);

    const gEdges = document.createElementNS(svg.namespaceURI, "g");
    const gNodes = document.createElementNS(svg.namespaceURI, "g");

    // --- Helpers ---
    const fmtHHMM = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };
    const bindEdgeHover = (el, label) => {
      el.addEventListener("mousemove", (ev) => showTip(label, ev.clientX, ev.clientY));
      el.addEventListener("mouseenter", () => {
        el.setAttribute("stroke-width", "4");
        el.setAttribute("filter", "url(#edgeGlow)");
      });
      el.addEventListener("mouseleave", () => {
        hideTip();
        el.setAttribute("stroke-width", "2");
        el.removeAttribute("filter");
      });
    };

    // --- Draw ONLY real edges (straight lines) ---
    for (const e of edges) {
      const aP = project(rawPos.get(e.a));
      const bP = project(rawPos.get(e.b));
      const line = document.createElementNS(svg.namespaceURI, "line");
      line.setAttribute("x1", String(aP.x));
      line.setAttribute("y1", String(aP.y));
      line.setAttribute("x2", String(bP.x));
      line.setAttribute("y2", String(bP.y));
      line.setAttribute("stroke", "#666");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-linecap", "round");
      line.style.cursor = "help";
      bindEdgeHover(line, `⏱ ${fmtHHMM(e.minutes)}<br/><small>${e.street}</small>`);
      gEdges.appendChild(line);
    }

    // --- Draw nodes using intrinsic positions ---
    for (const id of ids) {
      const loc = world.getLocation(id);
      const { x, y } = project(rawPos.get(id));

      const node = document.createElementNS(svg.namespaceURI, "circle");
      node.setAttribute("cx", String(x));
      node.setAttribute("cy", String(y));
      node.setAttribute("r", "10");
      node.setAttribute("fill", "#2d6cdf");
      node.setAttribute("stroke", "#153b7a");
      node.setAttribute("stroke-width", "2");
      node.style.cursor = "pointer";

      // hover: name + places
      const places = (loc.places || []).map((p) => p.name).join(", ") || "—";
      node.addEventListener("mousemove", (ev) => showTip(`<b>${loc.name}</b><br/><small>${places}</small>`, ev.clientX, ev.clientY));
      node.addEventListener("mouseenter", () => node.setAttribute("fill", "#4b84ff"));
      node.addEventListener("mouseleave", () => {
        hideTip();
        node.setAttribute("fill", "#2d6cdf");
      });

      // label
      const label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", String(x + 14));
      label.setAttribute("y", String(y + 4));
      label.setAttribute("font-size", "12");
      label.setAttribute("fill", "#ffffffff");
      label.textContent = loc.name;

      gNodes.appendChild(node);
      gNodes.appendChild(label);
    }

    svg.appendChild(gEdges);
    svg.appendChild(gNodes);
    host.appendChild(svg);
  }

  renderMap();
}

// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", init);
