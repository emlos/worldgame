import { Game } from "../../classes/game/game.js";
import { buildScene } from "../../classes/game/scene/sceneEngine.js";
import { performChoice } from "../../classes/game/scene/choiceEngine.js";
import { buildFullMapView } from "../../classes/game/scene/mapView.js";
import { renderMap as renderGraphMap } from "./renderMap.js";

const statusElement = document.querySelector("#status");
const noticeElement = document.querySelector("#notice");
const sceneElement = document.querySelector("#scene");
const restartButton = document.querySelector("#restart");
const openMapButton = document.querySelector("#open-map");
const closeMapButton = document.querySelector("#close-map");
const fullMapDialog = document.querySelector("#full-map-dialog");
const fullMapElement = document.querySelector("#full-map");
const fullMapDetails = document.querySelector("#full-map-details");

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

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = String(minutes % 60).padStart(2, "0");
  return `${hours}:${remainder}`;
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

function makeChoiceButton(choice, number) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice";
  button.dataset.choiceId = choice.id;

  const icon = document.createElement("span");
  icon.className = "choice-icon";
  icon.textContent = choice.icon || "•";

  const text = document.createElement("span");
  text.className = "choice-label";
  text.textContent = `(${number}) ${choice.label}`;

  const duration = document.createElement("span");
  duration.className = "choice-duration";
  duration.textContent = `(${formatDuration(choice.durationMinutes || 0)})`;

  button.append(icon, text, duration);
  button.addEventListener("click", () => choose(choice.id));
  choiceButtonsById.set(choice.id, button);
  return button;
}

function locationSummary(node) {
  const places = node.places.length
    ? node.places
        .map((place) => `${place.icon || "•"} ${place.name}`)
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

function render() {
  currentScene = buildScene(game);
  choiceButtons = [];
  choiceButtonsById = new Map();
  statusElement.textContent = formatStatus(currentScene.status);
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
      const button = makeChoiceButton(choice, choiceNumber++);
      choiceButtons.push(button);
      list.append(button);
    }

    sectionElement.append(list);
    sceneElement.append(sectionElement);
  }

  if (currentScene.map) renderLocalMap(currentScene.map);
}

function choose(choiceId) {
  try {
    noticeElement.textContent = performChoice(game, currentScene, choiceId);
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

render();
