import { Game } from "../../game/game.js";
import { NEW_GAME_SEED, NEW_GAME_START_ISO } from "../../game/newGameConfig.js";
import {
  addDebugMoney,
  advanceDebugHour,
  teleportNPCToPlayer,
} from "../../game/debugCommands.js";
import { presentScene as presentGameScene } from "./scenePresentation.js";
import { performChoice } from "../../game/scene/choiceEngine.js";
import { buildJournalReadView } from "../../game/journal/view.js";
import { canReadJournal } from "../../game/journal/runtime.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../../story/wg/runtime/sceneExposure.js";
import {
  makeJournalEntryElement,
  renderJournalReadPage as renderJournalReadPageUI,
} from "./journalUI.js";
import { buildFullMapView } from "../../game/scene/mapView.js";
import { STATS } from "../../characters/player/stats.js";
import { renderMap as renderGraphMap } from "./renderMap.js";
import { createSceneTransition } from "./sceneTransition.js";
import { createChoiceSection, renderSceneContent } from "./sceneContent.js";
import {
  createSceneVisualElement,
  destroySceneVisualElement,
} from "./sceneVisual.js";
import {
  MENU_HOTKEYS,
  choiceHotkeyLabel,
  resolveKeyboardAction,
} from "./keyboard.js";
import { outcomeForChange, outcomeForRange, setOutcomeText } from "./outcomes.js";
import {
  renderFeatureDebugActions,
  renderFeatureDebugSections,
} from "./featureDebugUI.js";
import { createPhoneUI } from "./phoneUI.js";
import {
  diaryDateFormatter,
  formatDuration,
  formatPainValue,
  formatStatValue,
  moneyFormatter,
} from "./formatters.js";

const statusElement = document.querySelector("#status");
const noticeElement = document.querySelector("#notice");
const sceneElement = document.querySelector("#scene");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const sceneTransition = createSceneTransition(sceneElement, motionPreference);
const playerMoneyElement = document.querySelector("#player-money");
const playerTemperatureElement = document.querySelector("#player-temperature");
const playerStatsElement = document.querySelector("#player-stats");
const restartButton = document.querySelector("#restart");
const playerDiaryButton = document.querySelector("#player-diary-btn");
const closeDiaryButton = document.querySelector("#close-diary");
const playerDiaryDialog = document.querySelector("#player-diary-dialog");
const playerDiaryDate = document.querySelector("#player-diary-date");
const playerDiaryContent = document.querySelector("#player-diary-content");
const journalPrevPageButton = document.querySelector("#journal-prev-page");
const journalNextPageButton = document.querySelector("#journal-next-page");
const openMapButton = document.querySelector("#open-map");
const closeMapButton = document.querySelector("#close-map");
const fullMapDialog = document.querySelector("#full-map-dialog");
const fullMapElement = document.querySelector("#full-map");
const fullMapDetails = document.querySelector("#full-map-details");
const debugEnabled = typeof debug !== "undefined" && Boolean(debug);
const debugPanel = document.querySelector("#debug-panel");
const debugAddMoneyButton = document.querySelector("#debug-add-money");
const debugAdvanceHourButton = document.querySelector("#debug-advance-hour");
const debugFeatureActions = document.querySelector("#debug-feature-actions");
const debugFeatureSections = document.querySelector("#debug-feature-sections");
const debugTeleportTaylorButton = document.querySelector(
  "#debug-teleport-taylor",
);
const debugTaylorPosition = document.querySelector("#debug-taylor-position");
const debugTaylorGoal = document.querySelector("#debug-taylor-goal");
const debugTaylorAction = document.querySelector("#debug-taylor-action");
const debugCaroPosition = document.querySelector("#debug-caro-position");
const debugCaroGoal = document.querySelector("#debug-caro-goal");
const debugCaroAction = document.querySelector("#debug-caro-action");

document.body.classList.toggle("debug-enabled", debugEnabled);
debugPanel.hidden = !debugEnabled;

let game = createGame();
let currentScene = null;
let currentSceneVisualElement = null;
let choiceButtons = [];
let choiceButtonsById = new Map();
let journalPageIndex = 0;

function createGame() {
  const newGame = new Game({
    seed: NEW_GAME_SEED,
    startDate: new Date(NEW_GAME_START_ISO),
  });
  resolveWGAutomaticScene(newGame, WG_AUTO_TRIGGER.enterPlace);
  return newGame;
}

function formatPlayerTemperature(value) {
  return String(value)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderPlayerPanel() {
  playerDiaryButton.hidden = !canReadJournal(game);
  playerMoneyElement.textContent = moneyFormatter.format(game.player.money);
  playerTemperatureElement.textContent = formatPlayerTemperature(
    game.player.temperature,
  );
  playerTemperatureElement.dataset.temperature = game.player.temperature;
  playerStatsElement.replaceChildren();

  const conditionRow = document.createElement("div");
  conditionRow.className = "player-stat";
  conditionRow.dataset.stat = "condition";
  conditionRow.dataset.outcome = outcomeForRange(
    game.player.getBodyConditionScore(),
    0,
    100,
  );
  const conditionLabel = document.createElement("span");
  conditionLabel.className = "player-stat-label";
  conditionLabel.textContent = "Condition";
  const conditionValue = document.createElement("output");
  conditionValue.className = "player-stat-value";
  conditionValue.textContent = game.player.getBodyConditionLabel();
  conditionValue.setAttribute("aria-label", "Condition value");
  conditionRow.append(conditionLabel, conditionValue);
  playerStatsElement.append(conditionRow);

  for (const [name, definition] of Object.entries(STATS)) {
    const value = game.player.getStatValue(name);
    const fraction =
      (value - definition.min) / (definition.max - definition.min);
    const percentage = Math.max(0, Math.min(1, fraction)) * 100;

    const row = document.createElement("div");
    row.className = "player-stat";
    row.dataset.stat = name;
    row.dataset.outcome = outcomeForRange(
      value,
      definition.min,
      definition.max,
      {
        lowerIsBetter: definition.higherIsBetter === false,
      },
    );

    const label = document.createElement("span");
    label.className = "player-stat-label";
    label.textContent = definition.label;

    const valueElement = document.createElement("output");
    valueElement.className = "player-stat-value";
    valueElement.textContent = formatStatValue(value);
    valueElement.setAttribute("aria-label", `${definition.label} value`);

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
    row.append(label, valueElement, meter);
    playerStatsElement.append(row);
  }

  const pain = game.player.getBodyPain();
  if (pain > 0) {
    const row = document.createElement("div");
    row.className = "player-stat";
    row.dataset.stat = "pain";
    row.dataset.outcome = outcomeForRange(pain, 0, 100, {
      lowerIsBetter: true,
    });

    const label = document.createElement("span");
    label.className = "player-stat-label";
    label.textContent = "Pain";

    const valueElement = document.createElement("output");
    valueElement.className = "player-stat-value";
    valueElement.textContent = formatPainValue(pain);
    valueElement.setAttribute("aria-label", "Pain value");

    const meter = document.createElement("div");
    meter.className = "player-stat-meter";
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", "Pain");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(pain));

    const fill = document.createElement("span");
    fill.className = "player-stat-meter-fill";
    fill.style.width = `${Math.max(0, Math.min(100, pain))}%`;
    meter.append(fill);
    row.append(label, valueElement, meter);
    playerStatsElement.append(row);
  }
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

  return `${dateText} | ${status.weather} | ${Math.round(status.temperatureC)}°C`;
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
  const hotkey = choiceHotkeyLabel(number - 1);
  setOutcomeText(text, hotkey ? `(${hotkey}) ${choice.label}` : choice.label);
  if (hotkey) button.setAttribute("aria-keyshortcuts", hotkey);

  let duration;
  if (choice.showDuration !== false && choice.durationRangeMinutes) {
    duration = document.createElement("span");
    duration.className = "choice-duration";
    duration.textContent =
      `(${formatDuration(choice.durationRangeMinutes.min)}-` +
      `${formatDuration(choice.durationRangeMinutes.max)})`;
  } else if (choice.showDuration !== false && choice.durationMinutes > 0) {
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
    const detail = makeChoiceDetail(
      "choice-effect",
      formatDescriptor(effect, "effect"),
    );
    detail.dataset.outcome = outcomeForChange(effect);
    details.append(detail);
  }
  if (choice.skillCheck) {
    details.append(
      makeChoiceDetail(
        "choice-skill-check",
        choice.skillCheck.targetLabel +
          ": " +
          choice.skillCheck.difficultyLabel,
      ),
    );
  }
  if (choice.warning) {
    details.append(makeChoiceDetail("choice-warning", `⚠ ${choice.warning}`));
  }
  if (choice.navigation) {
    details.append(
      makeChoiceDetail(
        "choice-navigation",
        `to ${choice.navigation.destinationName}`,
      ),
    );
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

function makeTableChoiceButton(sceneId, choice) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "utility-button scene-table-action";
  button.dataset.sceneId = sceneId;
  button.dataset.choiceId = choice.id;
  button.textContent = choice.label;
  button.disabled = !choice.enabled;
  if (!choice.enabled && choice.disabledReason) {
    button.title = choice.disabledReason;
  }
  button.addEventListener("click", () => choose(sceneId, choice.id));
  return button;
}

function locationSummary(node) {
  const places = node.places.length
    ? node.places
        .map((place) => `${place.icon || ""} ${place.name}`)
        .join(" | ")
    : "No marked places";
  return `${node.name} - ${places}`;
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
    ? `You are in ${currentNode.name}. ` +
      (mapView.gps
        ? ` The route to ${mapView.gps.destinationName} is highlighted in yellow.`
        : "")
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
    ? `You are in ${currentNode.name}.` +
      (mapView.gps
        ? ` The route to ${mapView.gps.destinationName} is highlighted in yellow.`
        : "")
    : "Select a location for details.";
  renderGraphMap(fullMapElement, mapView, {
    onSelectNode(node) {
      fullMapDetails.textContent = locationSummary(node);
    },
  });
}

function makeEmbeddedJournalChoice(scene, choice, number, className) {
  const button = makeChoiceButton(scene.id, choice, number);
  button.className = className;
  button.querySelector(".choice-icon")?.remove();
  button.querySelector(".choice-details")?.remove();
  const label = button.querySelector(".choice-label");
  if (label) label.textContent = choice.label;
  if (!choice.enabled && choice.disabledReason)
    button.title = choice.disabledReason;
  choiceButtons.push(button);
  return button;
}

function renderEmbeddedJournal(scene) {
  const view = scene.presentation;
  const writing = scene.sections.find(
    (section) => section.id === "journal-writing",
  );
  const actions = scene.sections.find(
    (section) => section.id === "journal-actions",
  );
  if (!writing || !actions)
    throw new Error("Journal scene is missing its choices");
  const exitChoice = actions.choices.find(
    (choice) => choice.id === "journal-exit",
  );

  const book = document.createElement("div");
  book.className = "journal-book journal-scene-book";
  book.setAttribute("aria-live", "polite");

  const choicePage = document.createElement("section");
  choicePage.className = "journal-page journal-page--choices";
  choicePage.setAttribute("aria-label", "Journal writing choices");
  const intro = document.createElement("p");
  intro.className = "journal-write-intro";
  intro.textContent = view.intro;
  const writingChoices = document.createElement("div");
  writingChoices.className = "journal-write-choices";

  let choiceNumber = 1;
  writingChoices.append(
    ...writing.choices.map((choice) =>
      makeEmbeddedJournalChoice(
        scene,
        choice,
        choiceNumber++,
        "journal-write-choice",
      ),
    ),
  );
  const actionChoices = document.createElement("div");
  actionChoices.className = "journal-scene-actions";
  actionChoices.append(
    ...actions.choices
      .filter((choice) => choice.id !== "journal-exit")
      .map((choice) =>
        makeEmbeddedJournalChoice(
          scene,
          choice,
          choiceNumber++,
          "journal-stop-writing",
        ),
      ),
  );
  choicePage.append(intro, writingChoices, actionChoices);

  const prosePage = document.createElement("section");
  prosePage.className = "journal-page journal-page--prose diary-content";
  prosePage.setAttribute("aria-label", "Diary page");
  const date = document.createElement("p");
  date.className = "journal-scene-date";
  date.textContent = diaryDateFormatter.format(new Date(view.date));
  prosePage.append(date);
  const entries = [...view.entries];
  if (view.activeEntry) entries.push(view.activeEntry);
  if (entries.length) {
    prosePage.append(
      ...entries.map((entry) => makeJournalEntryElement(document, entry)),
    );
  } else {
    const blank = document.createElement("p");
    blank.className = "journal-empty-page";
    blank.textContent = "Pick something from the left page to begin writing.";
    prosePage.append(blank);
  }

  book.append(choicePage, prosePage);
  sceneElement.append(book);
  if (exitChoice) {
    sceneElement.append(
      makeEmbeddedJournalChoice(
        scene,
        exitChoice,
        choiceNumber,
        "journal-write-choice journal-scene-exit",
      ),
    );
  }
}

function renderJournalReadPage() {
  journalPageIndex = renderJournalReadPageUI({
    game,
    pageIndex: journalPageIndex,
    document,
    dialog: playerDiaryDialog,
    dateElement: playerDiaryDate,
    contentElement: playerDiaryContent,
    previousButton: journalPrevPageButton,
    nextButton: journalNextPageButton,
    formatDate: (date) => diaryDateFormatter.format(date),
  });
}

function openPlayerDiary() {
  renderJournalReadPage();
  if (!playerDiaryDialog.open) playerDiaryDialog.showModal();
}

function renderDebugNPC(npcId, elements, teleportButton = null) {
  const npc = game.npcs.get(npcId);
  if (!npc) {
    elements.position.textContent = "Not in this game";
    elements.goal.textContent = "-";
    elements.action.textContent = "-";
    if (teleportButton) teleportButton.disabled = true;
    return;
  }

  if (teleportButton) teleportButton.disabled = false;
  const location = game.world.getLocation(npc.locationId);
  const place = (location?.places || []).find(
    (candidate) => String(candidate.id) === String(npc.currentPlaceId),
  );
  elements.position.textContent = place
    ? `${place.name}, ${location?.name || npc.locationId}`
    : location?.name || String(npc.locationId);
  elements.goal.textContent = npc.brain?.currentGoal?.ruleId || "None";
  elements.action.textContent = npc.brain?.currentAction?.type || "None";
}

function runFeatureDebugAction(id) {
  try {
    const action = game.features.getDebugAction(id);
    if (!action) throw new Error(`Debug action '${id}' is unavailable`);
    action(game);
    noticeElement.textContent = "";
    noticeElement.className = "notice";
  } catch (error) {
    noticeElement.textContent = error.message;
    noticeElement.className = "notice error";
  }
  render();
}

function renderDebugPanel() {
  if (!debugEnabled) return;
  renderFeatureDebugActions(
    document,
    debugFeatureActions,
    game.features,
    runFeatureDebugAction,
  );
  renderDebugNPC(
    "taylor",
    {
      position: debugTaylorPosition,
      goal: debugTaylorGoal,
      action: debugTaylorAction,
    },
    debugTeleportTaylorButton,
  );
  renderDebugNPC("caro", {
    position: debugCaroPosition,
    goal: debugCaroGoal,
    action: debugCaroAction,
  });
  renderFeatureDebugSections(
    document,
    debugFeatureSections,
    game.features.buildDebugSections(game),
  );
}

function render(preludeParagraphs = []) {
  sceneTransition.cancel();
  presentCurrentScene(preludeParagraphs);
}

function presentCurrentScene(preludeParagraphs = []) {
  return presentGameScene(game, renderScene, preludeParagraphs);
}

function renderScene(scene, preludeParagraphs = []) {
  currentScene = scene;
  choiceButtons = [];
  choiceButtonsById = new Map();
  statusElement.textContent = formatStatus(currentScene.status);
  renderPlayerPanel();
  destroySceneVisualElement(currentSceneVisualElement);
  currentSceneVisualElement = null;
  sceneElement.replaceChildren();

  if (currentScene.heading !== null) {
    const heading = document.createElement("h1");
    heading.textContent = currentScene.heading;
    sceneElement.append(heading);
  }

  if (currentScene.visual !== null) {
    currentSceneVisualElement = createSceneVisualElement(
      document,
      currentScene.visual,
      { motionPreference },
    );
    sceneElement.append(currentSceneVisualElement);
  }

  for (const alert of currentScene.alerts) {
    const alertElement = document.createElement("p");
    alertElement.className = "scene-alert";
    alertElement.dataset.tone = alert.tone;
    setOutcomeText(alertElement, alert.text);
    sceneElement.append(alertElement);
  }

  for (const paragraphText of preludeParagraphs) {
    const paragraph = document.createElement("p");
    paragraph.className = "scene-response";
    setOutcomeText(paragraph, paragraphText);
    sceneElement.append(paragraph);
  }

  renderSceneContent(sceneElement, currentScene.content, {
    makeTableAction: (choice) => makeTableChoiceButton(currentScene.id, choice),
  });

  if (currentScene.presentation?.type === "journal-writing") {
    renderEmbeddedJournal(currentScene);
  } else {
    let choiceNumber = 1;
    for (const section of currentScene.sections) {
      const sectionElement = createChoiceSection(
        document,
        section,
        (choice) => {
          const button = makeChoiceButton(
            currentScene.id,
            choice,
            choiceNumber++,
          );
          choiceButtons.push(button);
          return button;
        },
      );
      sceneElement.append(sectionElement);
    }
  }

  if (currentScene.map) renderLocalMap(currentScene.map);
  renderDebugPanel();
  phoneUI.refresh();
}

async function choose(sceneId, choiceId) {
  if (sceneTransition.running) return;
  try {
    const result = performChoice(game, {
      sceneId,
      choiceId,
    });
    noticeElement.textContent = result.paragraphs.length ? "" : result.notice;
    noticeElement.className = "notice";
    await sceneTransition.play(() => presentCurrentScene(result.paragraphs));
  } catch (error) {
    noticeElement.textContent = error.message;
    noticeElement.className = "notice error";
    render();
  }
}

function menuActionAvailable(id) {
  return id !== "diary" || canReadJournal(game);
}

const phoneUI = createPhoneUI({
  getGame: () => game,
  onGameChange: () => render(),
  isMenuActionAvailable: menuActionAvailable,
  setNotice(message, isError = false) {
    noticeElement.textContent = message;
    noticeElement.className = isError ? "notice error" : "notice";
  },
});

const menuActions = {
  chats: () => phoneUI.open("chats"),
  phone: () => phoneUI.toggle(),
  diary: () => playerDiaryButton.click(),
  map: () => openMapButton.click(),
  relationships: () => phoneUI.open("relationships"),
  gps: () => phoneUI.open("gps"),
  stats: () => phoneUI.open("stats"),
  settings: () => phoneUI.open("settings"),
};

const hotkeyButtons = {
  ...phoneUI.buttons,
  diary: playerDiaryButton,
  map: openMapButton,
};
for (const hotkey of MENU_HOTKEYS) {
  const button = hotkeyButtons[hotkey.id];
  if (!button) continue;
  button.title = `${hotkey.description} (${hotkey.label})`;
  button.setAttribute("aria-keyshortcuts", hotkey.key);
}

window.addEventListener("keydown", (event) => {
  const dialog = document.querySelector("dialog[open]");
  // Consume Escape ourselves, including repeats, so native dialog dismissal
  // cannot also close the phone after a single back action or held key.
  const action = resolveKeyboardAction(event, {
    dialog: dialog === phoneUI.dialog ? "phone" : dialog ? "other" : null,
    phoneHome: phoneUI.isHome(),
    transitioning: sceneTransition.running,
    choices: choiceButtons,
  });
  if (dialog && event.key === "Escape" && !event.defaultPrevented)
    event.preventDefault();
  if (!action) return;
  event.preventDefault();
  if (action.type === "choice") choiceButtons[action.index].click();
  else if (action.type === "menu" && menuActionAvailable(action.id))
    menuActions[action.id]();
  else if (action.type === "phone-home") {
    phoneUI.back();
  } else if (action.type === "close-dialog") dialog.close();
});

restartButton.addEventListener("click", () => {
  game = createGame();
  phoneUI.reset();
  noticeElement.textContent = "";
  render();
});

playerDiaryButton.addEventListener("click", () => {
  if (!canReadJournal(game)) return;
  journalPageIndex = Math.max(0, buildJournalReadView(game).pages.length - 1);
  openPlayerDiary();
});

journalPrevPageButton.addEventListener("click", () => {
  journalPageIndex -= 1;
  renderJournalReadPage();
});
journalNextPageButton.addEventListener("click", () => {
  journalPageIndex += 1;
  renderJournalReadPage();
});
closeDiaryButton.addEventListener("click", () => playerDiaryDialog.close());
playerDiaryDialog.addEventListener("click", (event) => {
  if (event.target === playerDiaryDialog) playerDiaryDialog.close();
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
    teleportNPCToPlayer(game, "taylor", { stayMinutes: 30 });
    noticeElement.textContent = "";
    noticeElement.className = "notice";
  } catch (error) {
    noticeElement.textContent = error.message;
    noticeElement.className = "notice error";
  }
  render();
});

debugAdvanceHourButton.addEventListener("click", () => {
  try {
    advanceDebugHour(game);
    noticeElement.textContent = "";
    noticeElement.className = "notice";
  } catch (error) {
    noticeElement.textContent = error.message;
    noticeElement.className = "notice error";
  }
  render();
});

debugAddMoneyButton.addEventListener("click", () => {
  addDebugMoney(game);
  noticeElement.textContent = "";
  noticeElement.className = "notice";
  render();
});


render();
