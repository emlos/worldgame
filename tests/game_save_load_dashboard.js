import { Game } from "../src/classes/game/game.js";

const STORAGE_KEY = "worldgame:save-load-dashboard:v6";
const MINUTE_MS = 60 * 1000;
const $ = (id) => document.getElementById(id);

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

let game = null;

function parseUtcInput(value) {
    if (!value) throw new Error("Choose a UTC start date and time.");
    const date = new Date(`${value}:00Z`);
    if (!Number.isFinite(date.getTime())) throw new Error(`Invalid UTC date: ${value}`);
    return date;
}

function formatDate(date) {
    return `${dateFormatter.format(date).replace(",", "")} UTC`;
}

function formatMinutes(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes === 0) return "no change";

    const sign = minutes > 0 ? "+" : "−";
    let remaining = Math.abs(minutes);
    const days = Math.floor(remaining / 1440);
    remaining -= days * 1440;
    const hours = Math.floor(remaining / 60);
    remaining -= hours * 60;
    const parts = [];
    if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
    if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (remaining) parts.push(`${remaining} minute${remaining === 1 ? "" : "s"}`);
    return `${sign}${parts.join(" ")}`;
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function setStatus(message, type = "") {
    const status = $("status");
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ""}`;
}

function json(value) {
    return JSON.stringify(value, null, 2);
}

function serializedGame() {
    return game.toJSON();
}

function createGame() {
    try {
        const rawSeed = Number($("seedInput").value);
        const seed = Number.isFinite(rawSeed) ? rawSeed >>> 0 : 12345;
        const startDate = parseUtcInput($("startInput").value);
        $("seedInput").value = String(seed);
        game = new Game({ seed, startDate });
        render();
        setStatus(`Created game seed ${seed} at ${formatDate(game.now)}.`, "pass");
    } catch (error) {
        setStatus(error?.message || String(error), "error");
    }
}

function changeTime(minutes) {
    if (!game) return;
    const amount = Number(minutes);
    if (!Number.isFinite(amount) || amount === 0) return;

    try {
        if (amount > 0) {
            game.advanceMinutes(amount);
        } else {
            game.jumpToDate(new Date(game.now.getTime() + amount * MINUTE_MS));
        }
        render();
        setStatus(`Applied ${formatMinutes(amount)}. Game is now ${formatDate(game.now)}.`, "pass");
    } catch (error) {
        setStatus(error?.message || String(error), "error");
    }
}

function saveCurrentGame() {
    try {
        const text = json(serializedGame());
        $("saveEditor").value = text;
        localStorage.setItem(STORAGE_KEY, text);
        $("slotStatus").textContent = `Saved ${formatBytes(new Blob([text]).size)} at ${formatDate(game.now)}.`;
        setStatus("Current game saved to the editor and local dashboard slot.", "pass");
    } catch (error) {
        setStatus(`Save failed: ${error?.message || String(error)}`, "error");
    }
}

function hydrate(text) {
    if (!text.trim()) throw new Error("The save editor is empty.");
    const data = JSON.parse(text);
    return Game.fromJSON(data);
}

function loadEditorSnapshot() {
    try {
        game = hydrate($("saveEditor").value);
        render();
        $("slotStatus").textContent = `Loaded schema v${game.toJSON().saveVersion} at ${formatDate(game.now)}.`;
        setStatus("Snapshot loaded. NPC behavior and runtime state came entirely from the save JSON.", "pass");
    } catch (error) {
        setStatus(`Load failed: ${error?.message || String(error)}`, "error");
    }
}

function verifyRoundTrip() {
    try {
        const before = JSON.stringify(serializedGame());
        const restored = hydrate(before);
        const after = JSON.stringify(restored.toJSON());
        if (before !== after) throw new Error("Hydrated game does not serialize back to the same snapshot.");
        $("slotStatus").textContent = `Exact round trip passed (${formatBytes(new Blob([before]).size)}).`;
        setStatus("Exact Game → JSON → Game round trip passed.", "pass");
    } catch (error) {
        setStatus(`Round trip failed: ${error?.message || String(error)}`, "error");
    }
}

function clearSaveSlot() {
    localStorage.removeItem(STORAGE_KEY);
    $("saveEditor").value = "";
    $("slotStatus").textContent = "Save slot cleared. The running game was not changed.";
    setStatus("Local dashboard save slot cleared.");
}

function appendDefinitionList(target, rows) {
    target.replaceChildren();
    for (const [label, value] of rows) {
        const term = document.createElement("dt");
        term.textContent = label;
        const definition = document.createElement("dd");
        definition.textContent = value;
        target.append(term, definition);
    }
}

function renderNpcTable() {
    const body = $("npcBody");
    body.replaceChildren();

    for (const npc of game.npcsArray) {
        const location = game.world.getLocation(npc.locationId);
        const place = (location?.places || []).find((candidate) => candidate.id === npc.currentPlaceId);
        const goal = npc.brain?.currentGoal;
        const action = npc.brain?.currentAction;
        const row = document.createElement("tr");
        const values = [
            npc.name,
            `${location?.name || npc.locationId || "—"}${place ? ` / ${place.name}` : ""}`,
            goal ? `${goal.ruleId} (${goal.type})` : "—",
            action?.type || "—",
            npc.brain?.nextDecisionAt ? formatDate(npc.brain.nextDecisionAt) : "—",
        ];
        for (const value of values) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
        }
        body.append(row);
    }
}

function render() {
    if (!game) return;
    const save = serializedGame();
    const compactSave = JSON.stringify(save);
    const environment = game.world.getEnvironmentAt(game.now);
    const day = game.world.getDayInfo(game.now);
    const holidays = [...day.holidays, ...day.specials].map((entry) => entry.name);
    const location = game.location;
    const placeCount = [...game.world.locations.values()].reduce(
        (total, item) => total + (item.places?.length || 0),
        0,
    );
    const activeBrains = game.npcsArray.filter((npc) => npc.brain).length;

    $("timeCard").textContent = game.now.toISOString().slice(0, 16).replace("T", " ");
    $("weatherCard").textContent = environment.weather;
    $("temperatureCard").textContent = `${environment.temperature.toFixed(1)}°C · ${environment.season}`;
    $("calendarCard").textContent = day.kind;
    $("holidayCard").textContent = holidays.join(", ") || "no holiday";
    $("locationCard").textContent = location?.name || game.currentLocationId || "—";
    $("placeCard").textContent = game.currentPlace?.name || game.currentPlaceKey || "outside";
    $("flagsCard").textContent = `${game.flags.size} flag${game.flags.size === 1 ? "" : "s"}`;
    $("npcCard").textContent = String(game.npcsArray.length);
    $("activeBrainsCard").textContent = `${activeBrains} active brain${activeBrains === 1 ? "" : "s"}`;
    $("mapCard").textContent = `${game.world.locations.size} locations`;
    $("placeCountCard").textContent = `${game.world.edges.length} streets · ${placeCount} places`;
    $("schemaCard").textContent = `v${save.saveVersion}`;
    $("saveSizeCard").textContent = formatBytes(new Blob([compactSave]).size);

    appendDefinitionList($("runtimeOverview"), [
        ["Master seed", String(game.seed)],
        ["World seed", String(game.world.random.seed)],
        ["Current UTC time", formatDate(game.now)],
        ["Player location id", String(game.currentLocationId ?? "—")],
        ["Player place id", String(game.currentPlaceId ?? "—")],
        ["Home", `${game.homeLocationId ?? "—"} / ${game.homePlaceId ?? "—"}`],
        ["Weather", `${environment.weather}, ${environment.temperature.toFixed(1)}°C`],
        ["Moon", game.world.moonPhase],
        ["Log entries", String(game.log.length)],
    ]);

    $("playerJson").textContent = json(save.player);
    $("runtimeJson").textContent = json({
        random: save.random,
        flags: save.flags,
        log: save.log,
    });
    $("fullGameJson").textContent = json(save);
    renderNpcTable();
}

function updateDeltaLabel() {
    const value = Number($("timeDelta").value);
    const label = formatMinutes(value);
    $("timeDeltaLabel").textContent = label;
    $("applyTimeBtn").textContent = `Apply ${label}`;
}

function initialise() {
    $("newGameBtn").addEventListener("click", createGame);
    $("timeDelta").addEventListener("input", updateDeltaLabel);
    $("applyTimeBtn").addEventListener("click", () => changeTime($("timeDelta").value));
    for (const button of document.querySelectorAll("[data-minutes]")) {
        button.addEventListener("click", () => changeTime(button.dataset.minutes));
    }
    $("saveBtn").addEventListener("click", saveCurrentGame);
    $("loadBtn").addEventListener("click", loadEditorSnapshot);
    $("roundTripBtn").addEventListener("click", verifyRoundTrip);
    $("clearSaveBtn").addEventListener("click", clearSaveSlot);

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            $("saveEditor").value = stored;
            $("slotStatus").textContent = `Found a stored v6 slot (${formatBytes(new Blob([stored]).size)}).`;
        }
    } catch (error) {
        $("slotStatus").textContent = `Browser storage unavailable: ${error?.message || String(error)}`;
    }

    updateDeltaLabel();
    createGame();
}

window.addEventListener("DOMContentLoaded", initialise);
