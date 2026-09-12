import { Game } from "../../game/game.js";
import {
  NEW_GAME_SEED,
  NEW_GAME_START_ISO,
} from "../../game/newGameConfig.js";
import { createPhoneChats } from "./phoneChats.js";
import {
  addDebugMoney,
  advanceDebugHour,
  teleportNPCToPlayer,
} from "../../game/debugCommands.js";
import { buildScene } from "../../game/scene/sceneEngine.js";
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
import { searchNavigationDestinations } from "../../game/navigation.js";
import {
  buildPhoneGpsView,
  buildPhonePlayerStatsView,
  buildPhoneRelationshipsView,
  buildPhoneRemindersView,
} from "../../game/scene/phoneView.js";
import { STATS } from "../../characters/player/stats.js";
import { renderMap as renderGraphMap } from "./renderMap.js";
import { createSceneTransition } from "./sceneTransition.js";
import { createChoiceSection, renderSceneContent } from "./sceneContent.js";
import {
  createSceneVisualElement,
  destroySceneVisualElement,
} from "./sceneVisual.js";
import { MENU_HOTKEYS, choiceHotkeyLabel, resolveKeyboardAction } from "./keyboard.js";
import {
  OUTCOME,
  outcomeForChange,
  outcomeForRange,
  outcomeForRelationship,
  setOutcomeText,
} from "./outcomes.js";
import { getEncounterDebugSnapshot } from "../../features/encounter/debug.js";

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
const playerPhoneButton = document.querySelector("#player-phone-btn");
const closePhoneButton = document.querySelector("#close-phone");
const playerPhoneDialog = document.querySelector("#player-phone-dialog");
const playerPhoneHeading = document.querySelector(
  "#player-phone-dialog-heading",
);
const playerPhoneDate = document.querySelector("#player-phone-date");
const phoneBackButton = document.querySelector("#phone-back");
const phoneHomeScreen = document.querySelector("#phone-home-screen");
const phoneRemindersButton = document.querySelector("#phone-reminders-btn");
const phoneRemindersScreen = document.querySelector("#phone-reminders-screen");
const phoneRemindersContent = document.querySelector("#phone-reminders-content");
const phoneRelationshipsButton = document.querySelector(
  "#phone-relationships-btn",
);
const phoneRelationshipsScreen = document.querySelector(
  "#phone-relationships-screen",
);
const phoneRelationshipsList = document.querySelector(
  "#phone-relationships-list",
);
const phoneGpsButton = document.querySelector("#phone-gps-btn");
const phoneGpsScreen = document.querySelector("#phone-gps-screen");
const phoneGpsSearch = document.querySelector("#phone-gps-search");
const phoneGpsStatus = document.querySelector("#phone-gps-status");
const phoneGpsStopButton = document.querySelector("#phone-gps-stop");
const phoneGpsDestinations = document.querySelector("#phone-gps-destinations");
const phoneStatsButton = document.querySelector("#phone-stats-btn");
const phoneStatsScreen = document.querySelector("#phone-stats-screen");
const phoneStatsContent = document.querySelector("#phone-stats-content");
const phoneSettingsButton = document.querySelector("#phone-settings-btn");
const phoneSettingsScreen = document.querySelector("#phone-settings-screen");
const phoneHotkeysContent = document.querySelector("#phone-hotkeys-content");
const phoneChatsButton = document.querySelector("#phone-chats-btn");
const phoneChatsScreen = document.querySelector("#phone-chats-screen");
const phoneChatThreadScreen = document.querySelector("#phone-chat-thread-screen");
const debugEnabled = typeof debug !== "undefined" && Boolean(debug);
const debugPanel = document.querySelector("#debug-panel");
const debugAddMoneyButton = document.querySelector("#debug-add-money");
const debugAdvanceHourButton = document.querySelector("#debug-advance-hour");
const debugTeleportSchoolButton = document.querySelector(
  "#debug-teleport-school",
);
const debugTeleportCinemaButton = document.querySelector(
  "#debug-teleport-cinema",
);
const debugTeleportAlleyButton = document.querySelector(
  "#debug-teleport-alley",
);
const debugTeleportTaylorButton = document.querySelector(
  "#debug-teleport-taylor",
);
const debugTaylorPosition = document.querySelector("#debug-taylor-position");
const debugTaylorGoal = document.querySelector("#debug-taylor-goal");
const debugTaylorAction = document.querySelector("#debug-taylor-action");
const debugCaroPosition = document.querySelector("#debug-caro-position");
const debugCaroGoal = document.querySelector("#debug-caro-goal");
const debugCaroAction = document.querySelector("#debug-caro-action");
const debugEncounterSection = document.querySelector("#debug-encounter-section");
const debugEncounterPersonality = document.querySelector("#debug-encounter-personality");
const debugEncounterCommitment = document.querySelector("#debug-encounter-commitment");
const debugEncounterIntent = document.querySelector("#debug-encounter-intent");
const debugEncounterScores = document.querySelector("#debug-encounter-scores");
const debugEncounterAvailability = document.querySelector("#debug-encounter-availability");
const debugEncounterRolls = document.querySelector("#debug-encounter-rolls");
const debugEncounterInvariants = document.querySelector("#debug-encounter-invariants");
const debugEncounterState = document.querySelector("#debug-encounter-state");

document.body.classList.toggle("debug-enabled", debugEnabled);
debugPanel.hidden = !debugEnabled;

let game = createGame();
let chatsUI;
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

const moneyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

const diaryDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatPlayerTemperature(value) {
  return String(value)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatStatValue(value) {
  return Number.isInteger(value) ? String(value) : Math.floor(value);
}

function formatPainValue(value) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function renderPlayerPanel() {
  playerDiaryButton.hidden = !canReadJournal(game);
  playerMoneyElement.textContent = moneyFormatter.format(game.player.money);
  playerTemperatureElement.textContent = formatPlayerTemperature(
    game.player.temperature,
  );
  playerTemperatureElement.dataset.temperature = game.player.temperature;
  playerStatsElement.replaceChildren();

  for (const [name, definition] of Object.entries(STATS)) {
    const value = game.player.getStatValue(name);
    const fraction =
      (value - definition.min) / (definition.max - definition.min);
    const percentage = Math.max(0, Math.min(1, fraction)) * 100;

    const row = document.createElement("div");
    row.className = "player-stat";
    row.dataset.stat = name;
    row.dataset.outcome = outcomeForRange(value, definition.min, definition.max, {
      lowerIsBetter: definition.higherIsBetter === false,
    });

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
    row.dataset.outcome = outcomeForRange(pain, 0, 100, { lowerIsBetter: true });

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

function formatDuration(minutes) {
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const remainderMinutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const time = `${String(hours).padStart(2, "0")}:${String(remainderMinutes).padStart(2, "0")}`;
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
  if (choice.durationRangeMinutes) {
    duration = document.createElement("span");
    duration.className = "choice-duration";
    duration.textContent =
      `(${formatDuration(choice.durationRangeMinutes.min)}-` +
      `${formatDuration(choice.durationRangeMinutes.max)})`;
  } else if (choice.durationMinutes > 0) {
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
    const detail = makeChoiceDetail("choice-effect", formatDescriptor(effect, "effect"));
    detail.dataset.outcome = outcomeForChange(effect);
    details.append(detail);
  }
  if (choice.skillCheck) {
    details.append(
      makeChoiceDetail(
        "choice-skill-check",
        choice.skillCheck.targetLabel + ": " + choice.skillCheck.difficultyLabel,
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
  if (!choice.enabled && choice.disabledReason) button.title = choice.disabledReason;
  choiceButtons.push(button);
  return button;
}

function renderEmbeddedJournal(scene) {
  const view = scene.presentation;
  const writing = scene.sections.find((section) => section.id === "journal-writing");
  const actions = scene.sections.find((section) => section.id === "journal-actions");
  if (!writing || !actions) throw new Error("Journal scene is missing its choices");
  const exitChoice = actions.choices.find((choice) => choice.id === "journal-exit");

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
  writingChoices.append(...writing.choices.map((choice) =>
    makeEmbeddedJournalChoice(
      scene,
      choice,
      choiceNumber++,
      "journal-write-choice",
    )));
  const actionChoices = document.createElement("div");
  actionChoices.className = "journal-scene-actions";
  actionChoices.append(...actions.choices
    .filter((choice) => choice.id !== "journal-exit")
    .map((choice) =>
    makeEmbeddedJournalChoice(
      scene,
      choice,
      choiceNumber++,
      "journal-stop-writing",
    )));
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
    prosePage.append(...entries.map((entry) => makeJournalEntryElement(document, entry)));
  } else {
    const blank = document.createElement("p");
    blank.className = "journal-empty-page";
    blank.textContent = "Pick something from the left page to begin writing.";
    prosePage.append(blank);
  }

  book.append(choicePage, prosePage);
  sceneElement.append(book);
  if (exitChoice) {
    sceneElement.append(makeEmbeddedJournalChoice(
      scene,
      exitChoice,
      choiceNumber,
      "journal-write-choice journal-scene-exit",
    ));
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

function formatRelationshipScore(score) {
  const value = Number(score);
  return Number.isFinite(value) ? String(Math.round(value)) : "0";
}

function makePhoneRelationshipEntry(entry) {
  const item = document.createElement("li");
  item.className = "phone-relationship-card";
  item.dataset.npcId = entry.id;

  const avatar = document.createElement("div");
  avatar.className = "phone-relationship-avatar";
  const fallback = document.createElement("span");
  fallback.textContent = entry.name.charAt(0).toUpperCase();
  if (entry.iconPath) {
    const icon = document.createElement("img");
    icon.src = entry.iconPath;
    icon.alt = "";
    icon.width = 32;
    icon.height = 32;
    icon.addEventListener("error", () => avatar.replaceChildren(fallback), {
      once: true,
    });
    avatar.append(icon);
  } else {
    avatar.append(fallback);
  }

  const details = document.createElement("div");
  details.className = "phone-relationship-details";

  const name = document.createElement("h3");
  name.textContent = entry.name;

  const meters = document.createElement("div");
  meters.className = "phone-relationship-meters";
  for (const meter of entry.meters) {
    const outcome = outcomeForRelationship(meter.value, {
      higherIsBetter: meter.higherIsBetter,
    });
    const row = document.createElement("div");
    row.className = "phone-relationship-meter";
    row.title = meter.description;

    const header = document.createElement("div");
    header.className = "phone-relationship-meter-header";
    const label = document.createElement("span");
    label.textContent = meter.label;
    const value = document.createElement("output");
    value.className = "phone-relationship-meter-value";
    value.dataset.outcome = outcome;
    value.textContent = formatRelationshipScore(meter.value);
    value.setAttribute("aria-label", `${entry.name} ${meter.label} value`);
    header.append(label, value);

    const bar = document.createElement("progress");
    bar.className = "phone-relationship-meter-bar";
    bar.min = meter.min;
    bar.max = meter.max;
    bar.value = meter.value;
    bar.dataset.outcome = outcome;
    bar.setAttribute("aria-label", `${entry.name} ${meter.label}`);
    row.append(header, bar);
    meters.append(row);
  }

  if (!entry.meters.length) {
    const empty = document.createElement("p");
    empty.className = "phone-relationship-meters-empty";
    empty.textContent = "No known profile details.";
    meters.append(empty);
  }

  details.append(name, meters);
  item.append(avatar, details);
  return item;
}

function formatPhoneLabel(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function makePhoneStatsSection(title) {
  const section = document.createElement("section");
  section.className = "phone-stats-section";

  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  return section;
}

function makePhoneValueList(entries) {
  const list = document.createElement("dl");
  list.className = "phone-value-list";

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "phone-value-row";

    const label = document.createElement("dt");
    label.textContent = entry.label;

    const value = document.createElement("dd");
    if (entry.color) {
      const swatch = document.createElement("span");
      swatch.className = "phone-color-swatch";
      swatch.style.backgroundColor = entry.color;
      swatch.setAttribute("aria-hidden", "true");
      value.append(swatch);
    }
    value.append(String(entry.value));
    row.append(label, value);
    list.append(row);
  }

  return list;
}

function meterPercentage(value, min, max) {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min))) * 100;
}

function makePhoneMeterEntry(entry, kind) {
  const item = document.createElement("article");
  item.className = "phone-meter-entry";
  item.dataset.valueId = entry.id;
  item.dataset.kind = kind;
  item.dataset.outcome = outcomeForRange(entry.value, entry.min, entry.max, {
    lowerIsBetter:
      kind === "stat" && STATS[entry.id]?.higherIsBetter === false,
  });

  const header = document.createElement("div");
  header.className = "phone-meter-header";

  const label = document.createElement("h4");
  label.textContent = entry.label;

  const value = document.createElement("output");
  value.textContent = entry.valueLabel ?? (
    kind === "skill"
      ? `${formatStatValue(entry.value)} / ${formatStatValue(entry.max)}`
      : formatStatValue(entry.value)
  );
  value.setAttribute("aria-label", `${entry.label} value`);
  header.append(label, value);

  const meter = document.createElement("div");
  meter.className = "phone-meter";
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-label", entry.label);
  meter.setAttribute("aria-valuemin", String(entry.min));
  meter.setAttribute("aria-valuemax", String(entry.max));
  meter.setAttribute("aria-valuenow", String(entry.value));
  if (entry.valueLabel) meter.setAttribute("aria-valuetext", entry.valueLabel);

  const fill = document.createElement("span");
  fill.className = "phone-meter-fill";
  fill.style.width = `${meterPercentage(entry.value, entry.min, entry.max)}%`;
  meter.append(fill);

  item.append(header, meter);
  return item;
}

function bodyPartOutcome(part) {
  const fraction = part.maxHealth ? part.health / part.maxHealth : 0;
  const healthOutcome = outcomeForRange(fraction, 0, 1);
  if (
    (part.pain > 0 || part.conditions.length) &&
    [OUTCOME.VERY_GOOD, OUTCOME.OK].includes(healthOutcome)
  ) {
    return OUTCOME.WARNING;
  }
  return healthOutcome;
}

function makePhoneBodyPart(part) {
  const item = document.createElement("article");
  item.className = "phone-body-part";
  item.dataset.partId = part.id;
  item.dataset.outcome = bodyPartOutcome(part);

  const header = document.createElement("div");
  header.className = "phone-body-part-header";

  const label = document.createElement("h4");
  label.textContent = part.label;

  const value = document.createElement("output");
  value.textContent = `${formatStatValue(part.health)} / ${formatStatValue(part.maxHealth)}`;
  value.setAttribute("aria-label", `${part.label} health`);
  header.append(label, value);

  const meter = document.createElement("div");
  meter.className = "phone-meter phone-body-part-meter";
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-label", `${part.label} health`);
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", String(part.maxHealth));
  meter.setAttribute("aria-valuenow", String(part.health));

  const fill = document.createElement("span");
  fill.className = "phone-meter-fill";
  fill.style.width = `${meterPercentage(part.health, 0, part.maxHealth)}%`;
  meter.append(fill);

  const detail = document.createElement("p");
  detail.className = "phone-meter-detail";
  const condition = part.conditions.length
    ? part.conditions.map(formatPhoneLabel).join(", ")
    : "Healthy";
  detail.textContent = [
    formatPhoneLabel(part.region),
    part.pain > 0 ? `Pain ${formatPainValue(part.pain)}` : null,
    condition,
  ].filter(Boolean).join(" | ");

  item.append(header, meter, detail);
  return item;
}

function renderPhoneStats() {
  const view = buildPhonePlayerStatsView(game);
  const { overview } = view;

  const overviewSection = makePhoneStatsSection("Overview");
  overviewSection.append(
    makePhoneValueList([
      { label: "Money", value: moneyFormatter.format(overview.money) },
      { label: "Temperature", value: formatPhoneLabel(overview.temperature) },
    ]),
  );

  const identitySection = makePhoneStatsSection("Identity");
  identitySection.append(
    makePhoneValueList([
      { label: "Age", value: overview.age },
      { label: "Gender", value: formatPhoneLabel(overview.gender) },
      {
        label: "Perceived gender",
        value: formatPhoneLabel(overview.perceivedGender),
      },
    ]),
  );

  const statsSection = makePhoneStatsSection("Stats");
  statsSection.append(
    ...view.stats.map((entry) => makePhoneMeterEntry(entry, "stat")),
  );

  const skillsSection = makePhoneStatsSection("Skills");
  skillsSection.classList.add("phone-skills-section");
  skillsSection.append(
    ...view.skills.map((entry) => makePhoneMeterEntry(entry, "skill")),
  );

  const featureSections = view.featureSections.map((featureSection) => {
    const section = makePhoneStatsSection(featureSection.label);
    section.append(
      ...featureSection.entries.map((entry) =>
        makePhoneMeterEntry(entry, entry.kind || featureSection.id),
      ),
    );
    return section;
  });

  const bodySection = makePhoneStatsSection("Body status");
  const bodyStatusEntries = [
      {
        label: "Overall health",
        value: `${formatStatValue(view.body.healthPercentage)}%`,
      },
      {
        label: "Physical performance",
        value: `${Math.round(view.body.performanceMultiplier * 100)}%`,
      },
      {
        label: "Critical breaks",
        value: view.body.criticalBreaks ? "Yes" : "No",
      },
      { label: "Incapacitated", value: view.body.incapacitated ? "Yes" : "No" },
  ];
  if (view.body.pain > 0) {
    bodyStatusEntries.splice(1, 0,
      { label: "Condition", value: formatPhoneLabel(view.body.painLabel) },
      { label: "Pain", value: `${formatPainValue(view.body.pain)} / 100` },
      { label: "Pain stage", value: `${view.body.painStage} / 3` },
    );
  }
  bodySection.append(makePhoneValueList(bodyStatusEntries));

  const bodyPartsSection = makePhoneStatsSection("Body parts");
  bodyPartsSection.append(...view.body.parts.map(makePhoneBodyPart));

  const appearanceSection = makePhoneStatsSection("Appearance");
  appearanceSection.append(
    makePhoneValueList([
      {
        label: "Skin tone",
        value: overviewValue(view.appearance.skinTone),
        color: view.appearance.skinTone,
      },
      {
        label: "Eye colour",
        value: overviewValue(view.appearance.eyeColor),
        color: view.appearance.eyeColor,
      },
      {
        label: "Hair colour",
        value: overviewValue(view.appearance.hairColor),
        color: view.appearance.hairColor,
      },
    ]),
  );

  const clothingSection = makePhoneStatsSection("Clothing");
  clothingSection.append(
    makePhoneValueList(
      view.clothing.map(({ slot, item }) => ({
        label: formatPhoneLabel(slot),
        value: item
          ? `${formatPhoneLabel(item.id)} | ${Math.round(item.durability * 100)}% durability | ${Math.round(item.wetness * 100)}% wet`
          : "Not equipped",
        color: item?.color,
      })),
    ),
  );

  phoneStatsContent.replaceChildren(
    overviewSection,
    statsSection,
    skillsSection,
    ...featureSections,
    bodySection,
    bodyPartsSection,
    identitySection,
    appearanceSection,
    clothingSection,
  );
}

function overviewValue(value) {
  return value || "Not set";
}

function makePhoneGpsDestination(entry) {
  const item = document.createElement("li");
  item.className = "phone-gps-destination";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "phone-gps-destination-button";
  button.dataset.active = String(entry.active);
  button.dataset.placeId = entry.placeId;

  const name = document.createElement("span");
  name.className = "phone-gps-destination-name";
  name.textContent = `${entry.icon || "◆"} ${entry.name}`;

  const district = document.createElement("span");
  district.className = "phone-gps-destination-district";
  const labels = [entry.districtName];
  if (entry.recommended) labels.push("School");
  if (entry.alreadyHere) labels.push("Current district");
  if (entry.active) labels.push("Navigating");
  district.textContent = labels.join(" | ");

  button.append(name, district);
  button.addEventListener("click", () => {
    try {
      game.setGpsTarget(entry.placeId);
      noticeElement.textContent = "";
      noticeElement.className = "notice";
    } catch (error) {
      noticeElement.textContent = error.message;
      noticeElement.className = "notice error";
    }
    renderPhoneGps();
    render();
  });

  item.append(button);
  return item;
}

function renderPhoneGps() {
  const view = buildPhoneGpsView(game);
  const destinations = searchNavigationDestinations(
    view.destinations,
    phoneGpsSearch.value,
  );

  if (view.activeRoute) {
    phoneGpsStatus.textContent =
      `Navigating to ${view.activeRoute.destination.name} in ` +
      `${view.activeRoute.destination.districtName} | ` +
      `${formatDuration(view.activeRoute.totalMinutes)} remaining`;
    phoneGpsStopButton.hidden = false;
  } else {
    phoneGpsStatus.textContent = "No active route.";
    phoneGpsStopButton.hidden = true;
  }

  if (destinations.length) {
    phoneGpsDestinations.replaceChildren(
      ...destinations.map(makePhoneGpsDestination),
    );
  } else {
    const empty = document.createElement("li");
    empty.className = "phone-gps-empty";
    empty.textContent = "No destinations match your search.";
    phoneGpsDestinations.replaceChildren(empty);
  }
}

const phoneScreens = [
  phoneChatsScreen,
  phoneChatThreadScreen,
  phoneHomeScreen,
  phoneRemindersScreen,
  phoneRelationshipsScreen,
  phoneGpsScreen,
  phoneStatsScreen,
  phoneSettingsScreen,
];

function showOnlyPhoneScreen(screen) {
  if (screen !== phoneChatThreadScreen) chatsUI?.leaveThread();
  phoneBackButton.setAttribute("aria-label", screen === phoneChatThreadScreen ? "Back to chats" : "Back to phone menu");
  for (const candidate of phoneScreens) candidate.hidden = candidate !== screen;
}

function showPhoneHomeScreen() {
  const previousScreen = phoneScreens.find((screen) => !screen.hidden);
  playerPhoneHeading.textContent = "Phone";
  phoneBackButton.hidden = true;
  showOnlyPhoneScreen(phoneHomeScreen);
  if (playerPhoneDialog.open) {
    const homeButton = new Map([
      [phoneRelationshipsScreen, phoneRelationshipsButton],
      [phoneChatsScreen, phoneChatsButton],
      [phoneChatThreadScreen, phoneChatsButton],
      [phoneRemindersScreen, phoneRemindersButton],
      [phoneGpsScreen, phoneGpsButton],
      [phoneStatsScreen, phoneStatsButton],
      [phoneSettingsScreen, phoneSettingsButton],
    ]).get(previousScreen);
    (homeButton || phoneRelationshipsButton).focus();
  }
}

function showPhoneRelationshipsScreen() {
  playerPhoneHeading.textContent = "Relationships";
  phoneBackButton.hidden = false;
  showOnlyPhoneScreen(phoneRelationshipsScreen);
  const relationships = buildPhoneRelationshipsView(game);
  if (relationships.length) {
    phoneRelationshipsList.replaceChildren(
      ...relationships.map(makePhoneRelationshipEntry),
    );
  } else {
    const empty = document.createElement("li");
    empty.className = "phone-relationships-empty";
    empty.textContent = "You haven't met anyone yet.";
    phoneRelationshipsList.replaceChildren(empty);
  }
  phoneRelationshipsScreen.scrollTop = 0;
  phoneRelationshipsScreen.focus();
}

function showPhoneRemindersScreen() {
  playerPhoneHeading.textContent = "Reminders";
  phoneBackButton.hidden = false;
  showOnlyPhoneScreen(phoneRemindersScreen);
  const view = buildPhoneRemindersView(game);
  const groups = view.groups.map((group) => {
    const section = document.createElement("section");
    section.className = "phone-reminder-group";
    const heading = document.createElement("h3");
    heading.textContent = group.label;
    const list = document.createElement("ul");
    list.className = "phone-reminder-list";
    for (const reminder of group.items) {
      const item = document.createElement("li");
      item.className = "phone-reminder-item";
      item.dataset.tone = reminder.tone;
      setOutcomeText(item, reminder.text);
      list.append(item);
    }
    section.append(heading, list);
    return section;
  });
  if (view.count === 0) {
    const empty = document.createElement("p");
    empty.className = "phone-reminders-empty";
    empty.textContent = "No active reminders.";
    groups.push(empty);
  }
  phoneRemindersContent.replaceChildren(...groups);
  phoneRemindersScreen.scrollTop = 0;
  phoneRemindersScreen.focus();
}

function showPhoneGpsScreen() {
  playerPhoneHeading.textContent = "GPS";
  phoneBackButton.hidden = false;
  showOnlyPhoneScreen(phoneGpsScreen);
  phoneGpsSearch.value = "";
  renderPhoneGps();
  phoneGpsScreen.scrollTop = 0;
  phoneGpsSearch.focus();
}

function showPhoneStatsScreen() {
  playerPhoneHeading.textContent = "Player stats";
  phoneBackButton.hidden = false;
  showOnlyPhoneScreen(phoneStatsScreen);
  renderPhoneStats();
  phoneStatsScreen.scrollTop = 0;
  phoneStatsScreen.focus();
}

function renderPhoneHotkeys() {
  const sections = new Map();
  for (const hotkey of MENU_HOTKEYS) {
    if (!menuActionAvailable(hotkey.id)) continue;
    if (!sections.has(hotkey.group)) {
      const section = document.createElement("section");
      section.className = "phone-hotkey-section";
      const heading = document.createElement("h4");
      heading.textContent = hotkey.group;
      const list = document.createElement("dl");
      list.className = "phone-hotkey-list";
      section.append(heading, list);
      sections.set(hotkey.group, { section, list });
    }
    const row = document.createElement("div");
    row.className = "phone-hotkey-row";
    const description = document.createElement("dt");
    description.textContent = hotkey.description;
    const value = document.createElement("dd");
    const key = document.createElement("kbd");
    key.textContent = hotkey.label;
    value.append(key);
    row.append(description, value);
    sections.get(hotkey.group).list.append(row);
  }
  phoneHotkeysContent.replaceChildren(...[...sections.values()].map(({ section }) => section));
}

function showPhoneSettingsScreen() {
  playerPhoneHeading.textContent = "Settings";
  phoneBackButton.hidden = false;
  showOnlyPhoneScreen(phoneSettingsScreen);
  renderPhoneHotkeys();
  phoneSettingsScreen.scrollTop = 0;
  phoneSettingsScreen.focus();
}

function openPhone(screen = showPhoneHomeScreen) {
  playerPhoneDate.textContent = diaryDateFormatter.format(game.now);
  if (!playerPhoneDialog.open) playerPhoneDialog.showModal();
  screen();
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

function renderDebugPanel() {
  if (!debugEnabled) return;
  renderDebugNPC("taylor", {
    position: debugTaylorPosition,
    goal: debugTaylorGoal,
    action: debugTaylorAction,
  }, debugTeleportTaylorButton);
  renderDebugNPC("caro", {
    position: debugCaroPosition,
    goal: debugCaroGoal,
    action: debugCaroAction,
  });
  renderDebugEncounter();
}

function renderDebugEncounter() {
  const snapshot = getEncounterDebugSnapshot(game);
  debugEncounterSection.hidden = !snapshot;
  if (!snapshot) return;
  const decision = snapshot.decision;
  debugEncounterPersonality.textContent = decision?.personality.label
    || snapshot.state.participants.mugger.personalityId;
  debugEncounterCommitment.textContent = decision
    ? `${decision.commitment.value}/100 — ${decision.commitment.band}`
    : "Encounter ended";
  debugEncounterIntent.textContent = snapshot.state.npcIntent?.actionId || "None";
  debugEncounterScores.textContent = decision?.candidates.map((candidate, index) => {
    const marker = index === 0 ? "*" : " ";
    const parts = Object.entries(candidate.breakdown).map(([key, value]) => `${key} ${value}`).join(", ");
    return `${marker} ${candidate.instance.actionId} = ${candidate.score}\n    ${parts}`;
  }).join("\n") || "No active NPC decision.";
  debugEncounterAvailability.textContent = ["player", "mugger"].map((actorId) => {
    const rows = snapshot.availability[actorId].map((row) =>
      `${row.available ? "+" : "-"} ${row.actionId}${row.reasons.length ? ` — ${row.reasons.join("; ")}` : ""}`);
    return `${actorId.toUpperCase()}\n${rows.join("\n")}`;
  }).join("\n\n");
  debugEncounterRolls.textContent = snapshot.rolls.length
    ? snapshot.rolls.map((roll) => `${roll.actionId}/${roll.purpose}: ${roll.roll} < ${roll.chance} => ${roll.success}`).join("\n")
    : "No rolls in the latest exchange.";
  debugEncounterInvariants.textContent = snapshot.invariants.checks
    .map((item) => `${item.valid ? "OK" : "FAIL"} ${item.label}${item.valid ? "" : ` — ${item.message}`}`)
    .join("\n");
  debugEncounterState.textContent = JSON.stringify(snapshot.state, null, 2);
}

function render(preludeParagraphs = []) {
  sceneTransition.cancel();
  renderScene(preludeParagraphs);
}

function renderScene(preludeParagraphs = []) {
  currentScene = buildScene(game);
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
      const sectionElement = createChoiceSection(document, section, (choice) => {
        const button = makeChoiceButton(currentScene.id, choice, choiceNumber++);
        choiceButtons.push(button);
        return button;
      });
      sceneElement.append(sectionElement);
    }
  }

  if (currentScene.map) renderLocalMap(currentScene.map);
  renderDebugPanel();
  chatsUI?.refresh();
  if (currentScene.alerts.length) game.dismissDailyAnnouncements();
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
    await sceneTransition.play(() => renderScene(result.paragraphs));
  } catch (error) {
    noticeElement.textContent = error.message;
    noticeElement.className = "notice error";
    render();
  }
}

const menuActions = {
  chats: () => openPhone(() => chatsUI.openList()),
  phone: () => playerPhoneDialog.open ? playerPhoneDialog.close() : openPhone(),
  diary: () => playerDiaryButton.click(),
  map: () => openMapButton.click(),
  relationships: () => openPhone(showPhoneRelationshipsScreen),
  gps: () => openPhone(showPhoneGpsScreen),
  stats: () => openPhone(showPhoneStatsScreen),
  settings: () => openPhone(showPhoneSettingsScreen),
};

function menuActionAvailable(id) {
  return id !== "diary" || canReadJournal(game);
}

const hotkeyButtons = {
  chats: phoneChatsButton,
  phone: playerPhoneButton,
  diary: playerDiaryButton,
  map: openMapButton,
  relationships: phoneRelationshipsButton,
  gps: phoneGpsButton,
  stats: phoneStatsButton,
  settings: phoneSettingsButton,
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
    dialog: dialog === playerPhoneDialog ? "phone" : dialog ? "other" : null,
    phoneHome: !phoneHomeScreen.hidden,
    transitioning: sceneTransition.running,
    choices: choiceButtons,
  });
  if (dialog && event.key === "Escape" && !event.defaultPrevented) event.preventDefault();
  if (!action) return;
  event.preventDefault();
  if (action.type === "choice") choiceButtons[action.index].click();
  else if (action.type === "menu" && menuActionAvailable(action.id)) menuActions[action.id]();
  else if (action.type === "phone-home") { if (!chatsUI.back()) showPhoneHomeScreen(); }
  else if (action.type === "close-dialog") dialog.close();
});

restartButton.addEventListener("click", () => {
  chatsUI.leaveThread();
  game = createGame();
  if (playerPhoneDialog.open) showPhoneHomeScreen();
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

playerPhoneButton.addEventListener("click", () => {
  openPhone();
});

phoneRelationshipsButton.addEventListener(
  "click",
  showPhoneRelationshipsScreen,
);
phoneGpsButton.addEventListener("click", showPhoneGpsScreen);
phoneRemindersButton.addEventListener("click", showPhoneRemindersScreen);
phoneGpsSearch.addEventListener("input", renderPhoneGps);
phoneGpsStopButton.addEventListener("click", () => {
  game.clearGpsTarget();
  noticeElement.textContent = "";
  noticeElement.className = "notice";
  renderPhoneGps();
  render();
});
phoneStatsButton.addEventListener("click", showPhoneStatsScreen);
phoneSettingsButton.addEventListener("click", showPhoneSettingsScreen);
phoneChatsButton.addEventListener("click", () => chatsUI.openList());
phoneBackButton.addEventListener("click", () => { if (!chatsUI.back()) showPhoneHomeScreen(); });
closePhoneButton.addEventListener("click", () => playerPhoneDialog.close());
playerPhoneDialog.addEventListener("click", (event) => {
  if (event.target === playerPhoneDialog) playerPhoneDialog.close();
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

debugTeleportSchoolButton.addEventListener("click", () => {
  try {
    const action = game.features.getDebugAction("school.teleport-player");
    if (!action) throw new Error("The school debug action is unavailable");
    action(game);
    noticeElement.textContent = "";
    noticeElement.className = "notice";
  } catch (error) {
    noticeElement.textContent = error.message;
    noticeElement.className = "notice error";
  }
  render();
});

debugTeleportCinemaButton.addEventListener("click", () => {
  try {
    const action = game.features.getDebugAction("cinema.teleport-player");
    if (!action) throw new Error("The cinema debug action is unavailable");
    action(game);
    noticeElement.textContent = "";
    noticeElement.className = "notice";
  } catch (error) {
    noticeElement.textContent = error.message;
    noticeElement.className = "notice error";
  }
  render();
});

debugTeleportAlleyButton.addEventListener("click", () => {
  try {
    const action = game.features.getDebugAction("encounter.teleport-player-to-alley");
    if (!action) throw new Error("The alley debug action is unavailable");
    action(game);
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

chatsUI = createPhoneChats({
  getGame: () => game,
  onChange: () => render(),
  openScreen: (screen, heading) => {
    playerPhoneHeading.textContent = heading;
    phoneBackButton.hidden = false;
    showOnlyPhoneScreen(screen);
  },
});

render();
