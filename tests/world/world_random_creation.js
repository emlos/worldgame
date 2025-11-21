function init() {
  // ------- World creation (random but stable per refresh) -------
  const world = new World({
    rnd: makeRNG(Date.now()),
    locationCount: 10,
    startDate: new Date(), // now
  });

  // ------- DOM helpers -------
  const byId = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    }
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
      r.forEach((cell) => tr.append(el(r.isHeader ? "th" : "td", { html: cell ?? "" })));
      tbody.append(tr);
    });
    t.append(tbody);
    return t;
  };

  // ------- Formatters -------
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const dowName = (d) => [DAY_KEYS[0], DAY_KEYS[1], DAY_KEYS[2], DAY_KEYS[3], DAY_KEYS[4], DAY_KEYS[5], DAY_KEYS[6]][d.getDay()];
  const monthName = (mIdx) => ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][mIdx];

  // ------- Controls (buttons & inputs) -------
  const controlsRow = document.querySelector(".row");

  const btns = el(
    "div",
    { class: "controls" },
    el("button", { id: "tMinus60" }, "-60m"),
    el("button", { id: "tMinus5" }, "-5m"),
    el("button", { id: "tPlus5" }, "+5m"),
    el("button", { id: "tPlus60" }, "+60m"),
    el("button", { id: "tPlusDay" }, "+1 day"),
    el("button", { id: "tPlusMonth" }, "+1 Month")
  );

  const jumper = el(
    "div",
    { class: "jumper" },
    el("label", {}, "Jump to: "),
    (() => {
      const d = el("input", { id: "jumpDate", type: "date" });
      // default to current world date
      const wd = world.time.date;
      d.value = `${wd.getFullYear()}-${pad2(wd.getMonth() + 1)}-${pad2(wd.getDate())}`;
      return d;
    })(),
    (() => {
      const t = el("input", { id: "jumpTime", type: "time", step: "60" });
      const wd = world.time.date;
      t.value = `${pad2(wd.getHours())}:${pad2(wd.getMinutes())}`;
      return t;
    })(),
    el("button", { id: "doJump" }, "Go")
  );

  controlsRow.prepend(btns, jumper);

  // ------- Rendering -------
  function renderTimeDate() {
    const c = byId("time-date");
    c.innerHTML = "";
    const d = world.time.date;
    const dayInfo = world.getDayInfo(d);
    const rows = [
      ["Date", `${fmtDate(d)} (${dowName(d)})`],
      ["Time", fmtTime(d)],
      ["Season", `<code>${world.season}</code>`],
      ["Day kind", dayInfo.dayOff ? "<b>Day off</b>" : "Workday"],
      ["Holidays", dayInfo.holidays.length ? dayInfo.holidays.map((s) => s.name + ` <code>${s.category}</code>`).join("<br>") : "—"],
      ["Specials", dayInfo.specials.length ? dayInfo.specials.map((s) => s.name + ` <code>${s.category}</code>`).join("<br>") : "—"],
    ];
    c.append(el("h2", { html: "Time & Date" }));
    c.append(table(rows, ["Property", "Value"]));
  }

  //

  function renderWeatherSeason() {
    const c = byId("weather-season");
    c.innerHTML = "";

    // detailed moon info (phase + illumination)
    const mi = world.moonInfo; // { age, fraction, phase, angle }

    const rows = [
      ["Weather", `<code>${world.currentWeather}</code>`],
      ["Temperature", `${world.temperature.toFixed(1)} °C`],
      ["Season", `<code>${world.season}</code>`],

      ["Moon phase", `<code>${mi.phase}</code>`],
      ["Moon illum.", `${Math.round(mi.fraction * 100)} %`],
      // (Optional) show age in days:
      ["Moon age", `${mi.age.toFixed(1)} days`],
    ];

    c.append(el("h2", { html: "Weather & Season" }));
    c.append(table(rows, ["Property", "Value"]));
  }

  function renderCalendar() {
    const c = byId("calendar");
    c.innerHTML = "";
    const d = world.time.date;
    const year = d.getFullYear();
    const month = d.getMonth(); // 0..11
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const rows = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(year, month, day, d.getHours(), d.getMinutes());
      const info = world.getDayInfo(dt);
      rows.push([
        `${monthName(month)} ${pad2(day)}, ${year}`,
        dowName(dt),
        info.holidays.length ? info.holidays.map((s) => s.name).join("<br>") : "—",
        info.specials.length ? info.specials.map((s) => s.name).join("<br>") : "—",
        info.dayOff ? "Yes" : "No",
      ]);
    }

    c.append(el("h2", { html: `Calendar – ${monthName(month)} ${year}` }));
    c.append(table(rows, ["Date", "DOW", "Holidays", "Specials", "Day off?"]));
  }

  function renderStatus(msg = "") {
    byId("status").textContent = msg;
  }

  function renderAll(msg) {
    renderTimeDate();
    renderWeatherSeason();
    renderCalendar();
    if (msg) renderStatus(msg);
  }

  // ------- Time manipulation helpers -------
  function forward(mins) {
    world.advance(mins); // uses World.advance to handle weather ticks & season updates
    renderAll(`advanced +${mins} minutes`);
  }

  function backward(mins) {
    const ms = mins * 60 * 1000;
    world.time.date = new Date(world.time.date.getTime() - ms);
    world.season = (function monthToSeason(month) {
      if (month === 12 || month <= 2) return Season.WINTER;
      if (month <= 5) return Season.SPRING;
      if (month <= 8) return Season.SUMMER;
      return Season.AUTUMN;
    })(world.time.date.getMonth() + 1);

    world.temperatureC = world.weather.computeTemperature();

    // keep moon in lockstep when going backward
    world.moon.setDate(world.time.date);

    //world.advance(0)

    renderAll(`rewound -${mins} minutes`);
  }

  function jumpTo(dateStr, timeStr) {
    const [Y, M, D] = dateStr.split("-").map((x) => parseInt(x, 10));
    const [h, m] = timeStr.split(":").map((x) => parseInt(x, 10));
    const newDt = new Date(Y, M - 1, D, h, m || 0);
    const prev = world.time.date;
    const diffMin = Math.round((newDt - prev) / 60000);
    if (diffMin == 0) return;
    if (diffMin >= 0) {
      // use forward path for better weather cadence
      world.advance(diffMin);
    } else {
      backward(-diffMin);
      // backward() already renders, so exit early
      return;
    }
    renderAll(`jumped to ${fmtDate(world.time.date)} ${fmtTime(world.time.date)}`);
  }

  // ------- Wire controls -------
  byId("tPlus5").addEventListener("click", () => forward(5));
  byId("tPlus60").addEventListener("click", () => forward(60));
  byId("tPlusDay").addEventListener("click", () => forward(24 * 60));
  byId("tPlusMonth").addEventListener("click", () => forward(24 * 60 * 30));
  byId("tMinus5").addEventListener("click", () => backward(5));
  byId("tMinus60").addEventListener("click", () => backward(60));
  byId("doJump").addEventListener("click", () => {
    const d = byId("jumpDate").value;
    const t = byId("jumpTime").value || "00:00";
    if (!d) return renderStatus("Please pick a date");
    jumpTo(d, t);
  });

  // ------- Map renderer (SVG grid, no crossing) -------
  function renderMap() {
    const host = document.getElementById("map");
    if (!host) return;
    host.innerHTML = "";

    // --- Tooltip ---
    let tip = document.getElementById("map-tip");
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
    const margin = 40;
    const targetHeight = 360; // tweak if you like
    const targetWidth = host.clientWidth || 640;

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

  // ------- Initial render -------
  renderAll("world initialized");
}

// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", init);
