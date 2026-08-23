import { World } from "../../src/classes/world/world.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SPEEDS = [0, 1, 5, 30, 120, 360, 1440];
const SVG_NS = "http://www.w3.org/2000/svg";

const WEATHER_META = {
    clear: { icon: "◯", color: "#89d7ff" },
    sunny: { icon: "☀", color: "#ffd166" },
    cloudy: { icon: "☁", color: "#91a7b5" },
    rain: { icon: "☂", color: "#5f8cff" },
    storm: { icon: "ϟ", color: "#a88bff" },
    windy: { icon: "≋", color: "#65d9d0" },
    snow: { icon: "❄", color: "#d8f3ff" },
};

const $ = (id) => document.getElementById(id);
const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});
const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long" });

let world = null;
let history = [];
let running = false;
let previousFrame = performance.now();
let minuteAccumulator = 0;
let lastRenderAt = 0;
let lastHistoryAt = 0;

function parseUtcInput(value) {
    if (!value) throw new Error("Choose a UTC date and time.");
    const date = new Date(`${value}:00Z`);
    if (!Number.isFinite(date.getTime())) throw new Error(`Invalid UTC date: ${value}`);
    return date;
}

function toUtcInput(date) {
    return date.toISOString().slice(0, 16);
}

function formatDate(date) {
    return `${fmt.format(date).replace(",", "")} UTC`;
}

function formatCompact(date) {
    return date.toISOString().slice(0, 16).replace("T", " ");
}

function weatherMeta(kind) {
    return WEATHER_META[kind] || { icon: "?", color: "#ffffff" };
}

function environmentNow() {
    return world.getEnvironmentAt(world.time.date);
}

function randomSeed() {
    if (globalThis.crypto?.getRandomValues) {
        const out = new Uint32Array(1);
        globalThis.crypto.getRandomValues(out);
        return out[0] >>> 0;
    }
    return Date.now() >>> 0;
}

function resetTimeline() {
    try {
        const rawSeed = Number($("seedInput").value);
        const seed = Number.isFinite(rawSeed) ? rawSeed >>> 0 : randomSeed();
        const startDate = parseUtcInput($("startInput").value);
        $("seedInput").value = String(seed);

        world = new World({ seed, startDate, density: 0 });
        history = [];
        running = false;
        minuteAccumulator = 0;
        $("queryInput").value = toUtcInput(new Date(startDate.getTime() + 180 * DAY_MS));
        $("saveLoadResult").textContent = "Not run yet.";
        $("saveLoadResult").className = "muted";
        recordHistory();
        updateSpeedUI();
        renderAll();
        $("engineStatus").textContent = `seed ${seed} · algorithm v${world.weather.toJSON().algorithmVersion}`;
    } catch (error) {
        $("engineStatus").textContent = error?.message || String(error);
        $("engineStatus").className = "error";
    }
}

function advance(minutes, { record = true } = {}) {
    if (!world) return;
    try {
        world.advance(minutes);
        if (record) recordHistory();
        renderAll();
    } catch (error) {
        running = false;
        updateSpeedUI();
        $("engineStatus").textContent = error?.message || String(error);
        $("engineStatus").className = "error";
    }
}

function recordHistory() {
    const env = environmentNow();
    history.unshift({ date: new Date(world.time.date), ...env });
    history = history.slice(0, 60);
}

function renderSummary() {
    const date = world.time.date;
    const env = environmentNow();
    const meta = weatherMeta(env.weather);
    const nextBoundary = new Date((Math.floor(date.getTime() / HOUR_MS) + 1) * HOUR_MS);
    const ageMinutes = Math.floor((date - world.weather.originDate) / 60_000);

    $("currentTime").textContent = formatDate(date);
    $("weatherIcon").textContent = meta.icon;
    $("weatherIcon").style.color = meta.color;
    $("weatherKind").textContent = env.weather;
    $("weatherRun").textContent = `${world.weather.runHours} unchanged hourly transition${world.weather.runHours === 1 ? "" : "s"}`;
    $("temperature").textContent = `${env.temperature.toFixed(1)}°C`;
    $("season").textContent = env.season;
    $("monthLabel").textContent = monthFmt.format(date);
    $("nextBoundary").textContent = nextBoundary.toISOString().slice(11, 16);
    $("timelineAge").textContent = ageMinutes < 60 ? `${ageMinutes} min` : `${(ageMinutes / 60).toFixed(1)} h`;
    $("originLabel").textContent = `origin ${formatCompact(world.weather.originDate)} UTC`;
    $("rewindHourBtn").disabled = date.getTime() - HOUR_MS < world.weather.originDate.getTime();
}

function makeForecast(hours = 72) {
    const start = world.time.date.getTime();
    const rows = [];
    for (let hour = 0; hour <= hours; hour++) {
        const date = new Date(start + hour * HOUR_MS);
        rows.push({ date, ...world.getEnvironmentAt(date) });
    }
    return rows;
}

function svgElement(name, attrs = {}) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
}

function renderChart(forecast) {
    const svg = $("temperatureChart");
    svg.replaceChildren();
    const width = 960;
    const height = 250;
    const pad = { left: 52, right: 18, top: 34, bottom: 34 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const temps = forecast.map((row) => row.temperature);
    const min = Math.floor(Math.min(...temps) - 2);
    const max = Math.ceil(Math.max(...temps) + 2);
    const span = Math.max(1, max - min);
    const x = (index) => pad.left + (index / (forecast.length - 1)) * chartW;
    const y = (temperature) => pad.top + ((max - temperature) / span) * chartH;

    const bandWidth = chartW / Math.max(1, forecast.length - 1);
    forecast.slice(0, -1).forEach((row, index) => {
        svg.appendChild(svgElement("rect", {
            x: x(index), y: 5, width: bandWidth + .4, height: 12,
            fill: weatherMeta(row.weather).color, opacity: .78,
        }));
    });

    for (let i = 0; i <= 4; i++) {
        const value = min + (span * i) / 4;
        const yy = y(value);
        svg.appendChild(svgElement("line", { x1: pad.left, x2: width - pad.right, y1: yy, y2: yy, stroke: "#1d3443", "stroke-width": 1 }));
        const label = svgElement("text", { x: pad.left - 8, y: yy + 4, fill: "#91a7b5", "font-size": 11, "text-anchor": "end" });
        label.textContent = `${value.toFixed(0)}°`;
        svg.appendChild(label);
    }

    const points = forecast.map((row, index) => `${x(index)},${y(row.temperature)}`).join(" ");
    svg.appendChild(svgElement("polyline", { points, fill: "none", stroke: "#51d8e5", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }));

    for (let hour = 0; hour <= 72; hour += 12) {
        const xx = x(hour);
        svg.appendChild(svgElement("line", { x1: xx, x2: xx, y1: pad.top, y2: height - pad.bottom, stroke: "#203847", "stroke-width": 1, "stroke-dasharray": "3 5" }));
        const label = svgElement("text", { x: xx, y: height - 11, fill: "#91a7b5", "font-size": 11, "text-anchor": hour === 0 ? "start" : hour === 72 ? "end" : "middle" });
        label.textContent = hour === 0 ? "now" : `+${hour}h`;
        svg.appendChild(label);
    }
}

function renderForecastTable(forecast) {
    const body = $("forecastBody");
    body.replaceChildren();
    for (let i = 0; i < forecast.length; i += 6) {
        const row = forecast[i];
        const tr = document.createElement("tr");
        const values = [
            `${formatCompact(row.date)} UTC`,
            `${weatherMeta(row.weather).icon} ${row.weather}`,
            `${row.temperature.toFixed(1)}°C`,
            row.season,
        ];
        values.forEach((value) => {
            const td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
        });
        body.appendChild(tr);
    }
}

function renderHistory() {
    const body = $("historyBody");
    body.replaceChildren();
    for (const item of history) {
        const tr = document.createElement("tr");
        [`${formatCompact(item.date)} UTC`, `${weatherMeta(item.weather).icon} ${item.weather}`, `${item.temperature.toFixed(1)}°C`].forEach((value) => {
            const td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
        });
        body.appendChild(tr);
    }
}

function inspectQueryDate() {
    const result = $("queryResult");
    try {
        const date = parseUtcInput($("queryInput").value);
        const before = JSON.stringify(world);
        const env = world.getEnvironmentAt(date);
        const state = world.weather.stateAt(date);
        const unchanged = JSON.stringify(world) === before;
        const meta = weatherMeta(env.weather);

        result.replaceChildren();
        const title = document.createElement("strong");
        title.textContent = formatDate(date);
        result.appendChild(title);
        const grid = document.createElement("div");
        grid.className = "query-grid";
        [
            ["Weather", `${meta.icon} ${env.weather}`],
            ["Temperature", `${env.temperature.toFixed(1)}°C`],
            ["Season", env.season],
            ["Run length", `${state.runHours} hours`],
        ].forEach(([label, value]) => {
            const cell = document.createElement("div");
            const small = document.createElement("div");
            small.className = "card-label";
            small.textContent = label;
            const content = document.createElement("strong");
            content.textContent = value;
            cell.append(small, content);
            grid.appendChild(cell);
        });
        result.appendChild(grid);
        const purity = document.createElement("p");
        purity.className = unchanged ? "pass" : "fail";
        purity.textContent = unchanged ? "✓ Query left committed world state unchanged" : "✗ Query mutated committed world state";
        result.appendChild(purity);
    } catch (error) {
        result.textContent = error?.message || String(error);
        result.className = "query-result error";
        return;
    }
    result.className = "query-result";
}

function runSaveLoadProbe() {
    const result = $("saveLoadResult");
    try {
        const loaded = World.fromJSON(JSON.parse(JSON.stringify(world)));
        const target = new Date(world.time.date.getTime() + 90 * DAY_MS);
        const originalFuture = world.getEnvironmentAt(target);
        const loadedFuture = loaded.getEnvironmentAt(target);
        const pass = JSON.stringify(originalFuture) === JSON.stringify(loadedFuture);
        result.textContent = pass
            ? `✓ Match at ${formatCompact(target)} UTC: ${originalFuture.weather}, ${originalFuture.temperature.toFixed(1)}°C`
            : "✗ Loaded timeline diverged from the original";
        result.className = pass ? "pass" : "fail";
    } catch (error) {
        result.textContent = error?.message || String(error);
        result.className = "error";
    }
}

function renderAll() {
    if (!world) return;
    renderSummary();
    const forecast = makeForecast();
    renderChart(forecast);
    renderForecastTable(forecast);
    renderHistory();
}

function speedValue() {
    const index = Math.max(0, Math.min(SPEEDS.length - 1, Number($("speedSlider").value) || 0));
    return SPEEDS[index];
}

function updateSpeedUI() {
    const speed = speedValue();
    $("speedLabel").textContent = speed === 0 ? "paused" : `${speed} game min/s`;
    $("playPauseBtn").textContent = running ? "pause" : "play";
}

function frame(now) {
    const dt = Math.min(.25, Math.max(0, (now - previousFrame) / 1000));
    previousFrame = now;

    if (running && world) {
        minuteAccumulator += speedValue() * dt;
        const wholeMinutes = Math.floor(minuteAccumulator);
        if (wholeMinutes > 0) {
            minuteAccumulator -= wholeMinutes;
            world.advance(wholeMinutes);
        }
        if (now - lastRenderAt > 250) {
            if (now - lastHistoryAt > 1000) {
                recordHistory();
                lastHistoryAt = now;
            }
            renderAll();
            lastRenderAt = now;
        }
    }

    requestAnimationFrame(frame);
}

document.querySelectorAll("button[data-minutes]").forEach((button) => {
    button.addEventListener("click", () => {
        running = false;
        updateSpeedUI();
        advance(Number(button.dataset.minutes));
    });
});

$("randomSeedBtn").addEventListener("click", () => {
    $("seedInput").value = String(randomSeed());
});
$("resetBtn").addEventListener("click", resetTimeline);
$("playPauseBtn").addEventListener("click", () => {
    if (!running && speedValue() === 0) $("speedSlider").value = "2";
    running = !running;
    updateSpeedUI();
});
$("speedSlider").addEventListener("input", () => {
    if (speedValue() === 0) running = false;
    updateSpeedUI();
});
$("queryBtn").addEventListener("click", inspectQueryDate);
$("queryCurrentBtn").addEventListener("click", () => {
    $("queryInput").value = toUtcInput(world.time.date);
    inspectQueryDate();
});
$("queryJulyBtn").addEventListener("click", () => {
    const year = world.time.date.getUTCFullYear();
    $("queryInput").value = `${year}-07-15T15:00`;
    inspectQueryDate();
});
$("saveLoadBtn").addEventListener("click", runSaveLoadProbe);

resetTimeline();
requestAnimationFrame(frame);
