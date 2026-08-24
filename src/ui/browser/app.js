import { Game } from "../../classes/game/game.js";
import {
  buildScene,
  performChoice,
} from "../../classes/game/scene/sceneEngine.js";

const statusElement = document.querySelector("#status");
const noticeElement = document.querySelector("#notice");
const sceneElement = document.querySelector("#scene");
const restartButton = document.querySelector("#restart");

let game = createGame();
let currentScene = null;
let choiceButtons = [];

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
  return button;
}

function render() {
  currentScene = buildScene(game);
  choiceButtons = [];
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

render();
