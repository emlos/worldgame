import { Game } from "../../classes/game/game.js";
import { teleportNPCToPlayer } from "../../classes/game/debugCommands.js";
import { buildScene } from "../../classes/game/scene/sceneEngine.js";
import { performChoice } from "../../classes/game/scene/choiceEngine.js";
import { buildFullMapView } from "../../classes/game/scene/mapView.js";
import { STATS } from "../../data/player/stats.js";
import { renderMap as renderGraphMap } from "./renderMap.js";

const statusElement = document.querySelector("#status");
const noticeElement = document.querySelector("#notice");
const sceneElement = document.querySelector("#scene");
const playerMoneyElement = document.querySelector("#player-money");
const playerTemperatureElement = document.querySelector("#player-temperature");
const playerStatsElement = document.querySelector("#player-stats");
const restartButton = document.querySelector("#restart");
const openMapButton = document.querySelector("#open-map");
const closeMapButton = document.querySelector("#close-map");
const fullMapDialog = document.querySelector("#full-map-dialog");
const fullMapElement = document.querySelector("#full-map");
const fullMapDetails = document.querySelector("#full-map-details");
const debugEnabled = typeof debug !== "undefined" && Boolean(debug);
const debugPanel = document.querySelector("#debug-panel");
const debugTeleportTaylorButton = document.querySelector("#debug-teleport-taylor");
const debugTaylorPosition = document.querySelector("#debug-taylor-position");
const debugTaylorGoal = document.querySelector("#debug-taylor-goal");
const debugTaylorAction = document.querySelector("#debug-taylor-action");

document.body.classList.toggle("debug-enabled", debugEnabled);
debugPanel.hidden = !debugEnabled;

let game = createGame();
let currentScene = null;
let choiceButtons = [];
let choiceButtonsById = new Map();

function createGame() {
  return new Game({
    seed: 117,
    startDate: new Date("2026-08-24T08:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
}

const moneyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

function formatPlayerTemperature(value) {
  return String(value)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatStatValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderPlayerPanel() {
  playerMoneyElement.textContent = moneyFormatter.format(game.player.money);
  playerTemperatureElement.textContent = formatPlayerTemperature(game.player.temperature);
  playerTemperatureElement.dataset.temperature = game.player.temperature;
  playerStatsElement.replaceChildren();

  for (const [name, definition] of Object.entries(STATS)) {
    const value = game.player.getStatValue(name);
    const fraction = (value - definition.min) / (definition.max - definition.min);
    const percentage = Math.max(0, Math.min(1, fraction)) * 100;

    const row = document.createElement("div");
    row.className = "player-stat";
    row.dataset.stat = name;

    const label = document.createElement("span");
    label.className = "player-stat-label";
    label.textContent = definition.label;

    const meter = document.createElement("div");
    meter.className = "player-stat-meter";
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", definition.label);
    meter.setAttribute("aria-valuemin", String(definition.min));
    meter.setAttribute("aria-valuemax", String(definition.max));
    meter.setAttribute("aria-valuenow", String(value));

    const fill = document.createElement("span");
    fill.className = "player-stat-meter-fill";
    fill.style.width = `${percentage}%`;
    meter.append(fill);
    row.append(label, meter);
    playerStatsElement.append(row);
  }
}

function formatDuration(minutes) {
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const remainderMinutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const time = `${hours}:${String(remainderMinutes).padStart(2, "0")}`;
  return seconds ? `${time}:${String(seconds).padStart(2, "0")}` : time;
}

function formatDescriptor(descriptor, kind) {
  if (descriptor.label) return descriptor.label;
  if (descriptor.amount === undefined) return descriptor.type;

  if (kind === "cost") return `${descriptor.amount} ${descriptor.type}`;
  const sign = descriptor.amount > 0 ? "+" : "";
  return `${sign}${descriptor.amount} ${descriptor.type}`;
}

function makeChoiceDetail(className, text) {
  const detail = document.createElement("span");
  detail.className = className;
  detail.textContent = text;
  return detail;
}

function formatStatus(status) {
  const date = new Date(status.now);
  const dateText = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);

  return `${dateText} · ${status.weather} · ${Math.round(status.temperatureC)}°C`;
}

function makeChoiceButton(sceneId, choice, number) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice";
  button.dataset.sceneId = sceneId;
  button.dataset.choiceId = choice.id;

  const icon = document.createElement("span");
  icon.className = "choice-icon";
  icon.textContent = choice.icon || "";

  const text = document.createElement("span");
  text.className = "choice-label";
  text.textContent = `(${number}) ${choice.label}`;

  let duration;
  if (choice.durationMinutes > 0) {
    duration = document.createElement("span");
    duration.className = "choice-duration";
    duration.textContent = `(${formatDuration(choice.durationMinutes)})`;
  }

  const details = document.createElement("span");
  details.className = "choice-details";
  if (duration) details.append(duration);

  for (const cost of choice.costs) {
    details.append(
      makeChoiceDetail("choice-cost", formatDescriptor(cost, "cost")),
    );
  }
  for (const effect of choice.effectsPreview) {
    details.append(
      makeChoiceDetail("choice-effect", formatDescriptor(effect, "effect")),
    );
  }
  if (choice.warning) {
    details.append(makeChoiceDetail("choice-warning", `⚠ ${choice.warning}`));
  }
  if (!choice.enabled && choice.disabledReason) {
    details.append(
      makeChoiceDetail("choice-disabled-reason", choice.disabledReason),
    );
  }

  button.disabled = !choice.enabled;
  button.append(icon, text, details);
  button.addEventListener("click", () => choose(sceneId, choice.id));
  choiceButtonsById.set(choice.id, button);
  return button;
}

function locationSummary(node) {
  const places = node.places.length
    ? node.places
        .map((place) => `${place.icon || ""} ${place.name}`)
        .join(" · ")
    : "No marked places";
  return `${node.name} — ${places}`;
}

function renderLocalMap(mapView) {
  const section = document.createElement("section");
  section.className = "map-section";

  const heading = document.createElement("h2");
  heading.textContent = "Nearby map";
  section.append(heading);

  const frame = document.createElement("div");
  frame.className = "map-frame map-frame--local";
  const details = document.createElement("p");
  details.className = "map-details";
  const currentNode = mapView.nodes.find((node) => node.current);
  details.textContent = currentNode
    ? `You are in ${currentNode.name}. Select an adjacent location to focus its travel choice.`
    : "Select a location for details.";

  renderGraphMap(frame, mapView, {
    onSelectNode(node) {
      details.textContent = locationSummary(node);
      const travelButton = choiceButtonsById.get(`travel:${node.id}`);
      if (!travelButton) return;
      travelButton.focus();
      travelButton.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  });

  section.append(frame, details);
  sceneElement.append(section);
}

function renderFullMap() {
  const mapView = buildFullMapView(game);
  const currentNode = mapView.nodes.find((node) => node.current);
  fullMapDetails.textContent = currentNode
    ? `You are in ${currentNode.name}.`
    : "Select a location for details.";
  renderGraphMap(fullMapElement, mapView, {
    onSelectNode(node) {
      fullMapDetails.textContent = locationSummary(node);
    },
  });
}

function renderDebugPanel() {
  if (!debugEnabled) return;
  const taylor = game.npcs.get("taylor");
  if (!taylor) {
    debugTaylorPosition.textContent = "Not in this game";
    debugTaylorGoal.textContent = "—";
    debugTaylorAction.textContent = "—";
    debugTeleportTaylorButton.disabled = true;
    return;
  }

  const location = game.world.getLocation(taylor.locationId);
  const place = (location?.places || []).find(
    (candidate) => String(candidate.id) === String(taylor.currentPlaceId),
  );
  debugTaylorPosition.textContent = place
    ? `${place.name}, ${location?.name || taylor.locationId}`
    : location?.name || String(taylor.locationId);
  debugTaylorGoal.textContent = taylor.brain?.currentGoal?.ruleId || "None";
  debugTaylorAction.textContent = taylor.brain?.currentAction?.type || "None";
}

function render() {
  currentScene = buildScene(game);
  choiceButtons = [];
  choiceButtonsById = new Map();
  statusElement.textContent = formatStatus(currentScene.status);
  renderPlayerPanel();
  sceneElement.replaceChildren();

  const heading = document.createElement("h1");
  heading.textContent = currentScene.heading;
  sceneElement.append(heading);

  for (const paragraphText of currentScene.paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.textContent = paragraphText;
    sceneElement.append(paragraph);
  }

  let choiceNumber = 1;
  for (const section of currentScene.sections) {
    const sectionElement = document.createElement("section");
    const sectionHeading = document.createElement("h2");
    sectionHeading.textContent = section.heading;
    sectionElement.append(sectionHeading);

    const list = document.createElement("div");
    list.className = "choices";
    for (const choice of section.choices) {
      const button = makeChoiceButton(currentScene.id, choice, choiceNumber++);
      choiceButtons.push(button);
      list.append(button);
    }

    sectionElement.append(list);
    sceneElement.append(sectionElement);
  }

  if (currentScene.map) renderLocalMap(currentScene.map);
  renderDebugPanel();
}

function choose(sceneId, choiceId) {
  try {
    noticeElement.textContent = performChoice(game, {
      sceneId,
      choiceId,
    });
    noticeElement.className = "notice";
  } catch (error) {
    noticeElement.textContent = error.message;
    noticeElement.className = "notice error";
  }
  render();
}

window.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const index = event.key === "0" ? 9 : Number(event.key) - 1;
  if (!Number.isInteger(index) || !choiceButtons[index]) return;
  event.preventDefault();
  choiceButtons[index].click();
});

restartButton.addEventListener("click", () => {
  game = createGame();
  noticeElement.textContent = "";
  render();
});

openMapButton.addEventListener("click", () => {
  renderFullMap();
  fullMapDialog.showModal();
});

closeMapButton.addEventListener("click", () => fullMapDialog.close());
fullMapDialog.addEventListener("click", (event) => {
  if (event.target === fullMapDialog) fullMapDialog.close();
});

debugTeleportTaylorButton.addEventListener("click", () => {
  try {
    const result = teleportNPCToPlayer(game, "taylor", { stayMinutes: 30 });
    const name = result.npc.meta?.shortName || result.npc.name;
    noticeElement.textContent = result.busyWithObligation
      ? `${name} was moved here, but is still committed to their obligation.`
      : `${name} was moved here and will stay for up to 30 minutes.`;
    noticeElement.className = "notice";
  } catch (error) {
    noticeElement.textContent = error.message;
    noticeElement.className = "notice error";
  }
  render();
});

render();
