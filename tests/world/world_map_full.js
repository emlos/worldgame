const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs))
        k === "class" ? (n.className = v) : k === "html" ? (n.innerHTML = v) : n.setAttribute(k, v);
    for (const c of kids) n.append(c);
    return n;
};

const table = (rows, headers = []) => {
    const t = el("table");
    if (headers.length) {
        const thead = el("thead");
        const tr = el("tr");
        headers.forEach((h) => tr.append(el("th", { html: h })));
        thead.append(tr);
        t.append(thead);
    }
    const tbody = el("tbody");
    rows.forEach((r) => {
        const tr = el("tr");
        r.forEach((cell) => tr.append(el("td", { html: cell ?? "" })));
        tbody.append(tr);
    });
    t.append(tbody);
    return t;
};

function formatOpeningHours(hours) {
    if (!hours) return "Hours: —";

    const order = [
        DAY_KEYS[1],
        DAY_KEYS[2],
        DAY_KEYS[3],
        DAY_KEYS[4],
        DAY_KEYS[5],
        DAY_KEYS[6],
        DAY_KEYS[0],
    ];
    const lines = order.map((dayKey) => {
        const label = dayKey;
        const slots = hours[dayKey] || [];
        if (!slots.length) {
            return `${label}: closed`;
        }
        const ranges = slots
            .map((slot) => {
                const from = slot.from || (Array.isArray(slot) ? slot[0] : "");
                const to = slot.to || (Array.isArray(slot) ? slot[1] : "");
                return `${from}–${to}`;
            })
            .join(", ");
        return `${label}: ${ranges}`;
    });

    return "Hours:<br>" + lines.join("<br>");
}

function init(density, width, height) {
    // ------- World creation (random but stable per refresh) -------

    let gentime = Date.now();
    const world = new World({
        rnd: makeRNG(Date.now()),
        density: density,
        startDate: new Date(), // now
        w: width,
        h: height,
    });

    gentime = Date.now() - gentime;

    // ------- Detail card (location info) -------

    const detailCard = byId("location");

    function renderLocationCard(loc) {
        if (!detailCard) return;

        if (!loc) {
            detailCard.innerHTML = `
        <h2>Location details</h2>
        <p>No location selected.</p>
      `;
            return;
        }

        const tags = (loc.tags || []).join(", ") || "—";
        const district = loc.districtKey || "—";
        const places = loc.places || [];

        const placesHtml = places.length
            ? `<ul>${places
                  .map((p) => {
                      const icon = p.props && p.props.icon ? p.props.icon + " " : "";
                      const type = p.key ? ` <small>(${p.key})</small>` : "";
                      const tags = (p?.props.category ? p.props.category : [])
                          .map((c) => `<code>${c}</code>`)
                          .join(" ");
                      const hours =
                          p.props && p.props.openingHours
                              ? `<small>${formatOpeningHours(p.props.openingHours)}</small>`
                              : "";
                      return `<li>${icon}<strong>${p.name}</strong>${type}<p>Tags: ${tags}</p>${hours}</li><br>`;
                  })
                  .join("")}</ul>`
            : "<p>No places at this location.</p>";

        detailCard.innerHTML = `
      <h2>${loc.name}</h2>
      <p><small>District: ${district}</small></p>
      <p><small>Tags: ${tags}</small></p>
      <h3>Places</h3>
      ${placesHtml}
    `;
    }

    const streetColors = new Map();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // ------- Map renderer (SVG grid, no crossing) -------
    function renderMap() {
        const host = byId("map");
        if (!host) return;
        host.innerHTML = "";

        //strret colors

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
        const targetHeight = (height || 50) * 10; // tweak if you like
        const targetWidth = (width || 100) * 10;

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

        // --- Draw edges ---
        for (const e of edges) {
            const aP = project(rawPos.get(e.a));
            const bP = project(rawPos.get(e.b));
            const line = document.createElementNS(svg.namespaceURI, "line");

            let color;
            if (streetColors.has(e.street)) {
                color = streetColors.get(e.street);
            } else {
                color = randomHexColor(world.rnd);
                streetColors.set(e.street, color);
            }

            line.setAttribute("x1", String(aP.x));
            line.setAttribute("y1", String(aP.y));
            line.setAttribute("x2", String(bP.x));
            line.setAttribute("y2", String(bP.y));
            line.setAttribute("stroke", color);
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
            node.addEventListener("mousemove", (ev) =>
                showTip(`<b>${loc.name}</b><br/><small>${places}</small>`, ev.clientX, ev.clientY)
            );
            node.addEventListener("mouseenter", () => node.setAttribute("fill", "#4b84ff"));
            node.addEventListener("mouseleave", () => {
                hideTip();
                node.setAttribute("fill", "#2d6cdf");
            });

            // click: show full info in the detail card
            node.addEventListener("click", () => {
                hideTip(); // hide the floating tooltip
                renderLocationCard(loc); // update the side card with full info
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

    // ------- General Info card --------
    const collectedstreets = Array.from(streetColors.keys()).map((name) => {
        return {
            street: name,
            color: streetColors.get(name),
            amnt: svg.querySelectorAll(`line[stroke="${streetColors.get(name)}"]`).length,
            elements: [...svg.querySelectorAll(`line[stroke="${streetColors.get(name)}"]`)],
        };
    });
    byId("mapinfo").innerHTML = "";
    byId("mapinfo").append(el("h2", { html: "Map Information" }));
    byId("mapinfo").append(el("small", { html: `Generation took: ${gentime}ms` }));

    const placed = Array.from(world.map.locations.values())
        .map((loc) => loc.places)
        .flat()
        .map((place) => place.key)
        .filter((value, index, array) => array.indexOf(value) === index);
    const unCommonArray = (first, second) => {
        const res = [];
        for (let i = 0; i < first.length; i++) {
            if (second.indexOf(first[i]) === -1) {
                res.push(first[i]);
            }
        }
        for (let j = 0; j < second.length; j++) {
            if (first.indexOf(second[j]) === -1) {
                res.push(second[j]);
            }
        }
        return res;
    };

    const missing = unCommonArray(
        PLACE_REGISTRY.map((p) => p.key),
        placed
    );
    console.log(missing);

    byId("mapinfo").append(
        table(
            [
                ["Streets amount", streetColors.size],
                [
                    "Street names<br><small>hover over the name to highlight street</small>",
                    collectedstreets
                        .map(
                            (street) =>
                                `<code class="streetnameintable" style="cursor: pointer; color: ${street.color}">${street.street}</code> length: ${street.amnt}`
                        )
                        .join("<br>"),
                ],
                ["Location amount", world.map.locations.size],
                [
                    "Place amount",
                    Array.from(world.map.locations.values()).reduce(
                        (accumulator, currentValue) => accumulator + currentValue.places.length,
                        0
                    ),
                ],
                [
                    "Locations not on map",
                    missing.length > 0 ? missing.map((m) => `<code>${m}</code>`).join("<br>") : "-",
                ],
            ],
            ["Property", "Value"]
        )
    );

    //highlighting on hover over the street name
    document.querySelectorAll(".streetnameintable").forEach((e) => {
        const lines = collectedstreets.find((s) => s.street == e.innerHTML).elements;

        e.addEventListener("mouseenter", () => {
            lines.forEach((l) => {
                l.setAttribute("stroke-width", "7");
                l.setAttribute("filter", "url(#edgeGlow)");
            });
        });
        e.addEventListener("mouseleave", () => {
            lines.forEach((l) => {
                l.setAttribute("stroke-width", "2");
                l.removeAttribute("filter");
            });
        });
    });

    // ------- Locations Info card -------
    const locations = Array.from(world.map.locations.values());
    byId("locationinfo").innerHTML = "";
    byId("locationinfo").append(
        table(
            [
                ...locations.map((loc) => {
                    return [
                        loc.name,
                        loc.tags.map((tag) => `<small><code>${tag}</code></small>`).join(", "),
                    ];
                }),
            ],

            ["Location", "Tags"]
        )
    );
}

// ------- DOM helpers -------
const byId = (id) => document.getElementById(id);

function bindControls() {
    const slider = byId("densitySlider");

    const mapWidth = byId("worldWidth");
    const mapHeight = byId("worldHeight");
    const btnGen = byId("btnGenerate");
    const btnReset = byId("adjustProportions");

    btnGen.addEventListener("click", () => {
        init(
            parseFloat(slider.value / 100),
            parseInt(mapWidth.value) || 100,
            parseInt(mapHeight.value) || 50
        );
    });

    btnReset.addEventListener("click", () => {
        mapWidth.value = 100;
        mapHeight.value = 50;
    });

    slider.addEventListener("change", () => {
        byId("density").innerText = slider.value == 0 ? "minimal" : `+ ${slider.value}%`;
    });
}

// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", () => {
    init(0, 100, 50);
    bindControls();
});
