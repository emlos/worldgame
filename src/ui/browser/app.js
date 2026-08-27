import { Game } from "../../classes/game/game.js";
import { teleportNPCToPlayer } from "../../classes/game/debugCommands.js";
import { buildScene } from "../../classes/game/scene/sceneEngine.js";
import { performChoice } from "../../classes/game/scene/choiceEngine.js";
import { buildPlayerDiaryView } from "../../classes/game/scene/diaryView.js";
import { buildFullMapView } from "../../classes/game/scene/mapView.js";
import {
  buildPhonePlayerStatsView,
  buildPhoneRelationshipsView,
} from "../../classes/game/scene/phoneView.js";
import { STATS } from "../../data/player/stats.js";
import { renderMap as renderGraphMap } from "./renderMap.js";

const statusElement = document.querySelector("#status");
const noticeElement = document.querySelector("#notice");
const sceneElement = document.querySelector("#scene");
const playerMoneyElement = document.querySelector("#player-money");
const playerTemperatureElement = document.querySelector("#player-temperature");
const playerStatsElement = document.querySelector("#player-stats");
const restartButton = document.querySelector("#restart");
const playerDiaryButton = document.querySelector("#player-diary-btn");
const closeDiaryButton = document.querySelector("#close-diary");
const playerDiaryDialog = document.querySelector("#player-diary-dialog");
const playerDiaryDate = document.querySelector("#player-diary-date");
const playerDiaryContent = document.querySelector("#player-diary-content");
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
const phoneRelationshipsButton = document.querySelector(
  "#phone-relationships-btn",
);
const phoneRelationshipsScreen = document.querySelector(
  "#phone-relationships-screen",
);
const phoneRelationshipsList = document.querySelector(
  "#phone-relationships-list",
);
const phoneStatsButton = document.querySelector("#phone-stats-btn");
const phoneStatsScreen = document.querySelector("#phone-stats-screen");
const phoneStatsContent = document.querySelector("#phone-stats-content");
const debugEnabled = typeof debug !== "undefined" && Boolean(debug);
const debugPanel = document.querySelector("#debug-panel");
const debugTeleportTaylorButton = document.querySelector(
  "#debug-teleport-taylor",
);
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

function renderPlayerPanel() {
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
  for (const change of choice.skillChanges) {
    const className =
      change.direction === "increase"
        ? "choice-skill-increase"
        : "choice-skill-decrease";
    details.append(makeChoiceDetail(className, change.label));
  }
  if (choice.skillCheck) {
    details.append(
      makeChoiceDetail(
        "choice-skill-check",
        choice.skillCheck.skillLabel + ": " + choice.skillCheck.difficultyLabel,
      ),
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

function makeDiaryCell(tagName, text) {
  const cell = document.createElement(tagName);
  cell.textContent = text;
  return cell;
}

function noSchoolMessage(view) {
  if (view.noSchoolReason === "school_disabled") {
    return "There is no school scheduled for you today.";
  }
  if (view.noSchoolReason === "timetable_unavailable") {
    return "There is no school timetable available for today.";
  }
  if (view.noSchoolReason === "out_of_term") {
    return "There is no school for you today. School is currently out of term.";
  }

  const holiday = view.day.holidays[0];
  if (holiday)
    return `There is no school for you today because it is ${holiday}.`;
  if (view.day.isWeekend)
    return "There is no school for you today. It is the weekend.";
  return "There is no school for you today.";
}

function renderPlayerDiary() {
  const view = buildPlayerDiaryView(game);
  playerDiaryDate.textContent = diaryDateFormatter.format(new Date(view.date));
  playerDiaryContent.replaceChildren();

  if (!view.hasSchool) {
    const notice = document.createElement("p");
    notice.className = "diary-empty";
    notice.textContent = noSchoolMessage(view);
    playerDiaryContent.append(notice);
    return;
  }

  const entry = document.createElement("section");
  entry.className = "diary-entry";

  const heading = document.createElement("h3");
  heading.textContent = view.school.name;

  const summary = document.createElement("p");
  summary.className = "diary-school-summary";
  summary.textContent = `You have to go to school from ${view.school.start} to ${view.school.end}.`;

  const table = document.createElement("table");
  table.className = "diary-schedule";

  const caption = document.createElement("caption");
  caption.textContent = "Today's classes";

  const tableHead = document.createElement("thead");
  const headingRow = document.createElement("tr");
  headingRow.append(
    makeDiaryCell("th", "Time"),
    makeDiaryCell("th", "Class / activity"),
  );
  tableHead.append(headingRow);

  const tableBody = document.createElement("tbody");
  for (const period of view.school.periods) {
    const row = document.createElement("tr");
    row.append(
      makeDiaryCell("td", `${period.start}–${period.end}`),
      makeDiaryCell("td", period.label),
    );
    tableBody.append(row);
  }

  table.append(caption, tableHead, tableBody);
  entry.append(heading, summary, table);
  playerDiaryContent.append(entry);
}

function formatRelationshipScore(score) {
  const value = Number(score);
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function relationshipScoreTone(score) {
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

function makePhoneRelationshipEntry(entry) {
  const item = document.createElement("li");
  item.className = "phone-relationship-card";
  item.dataset.npcId = entry.id;

  const avatar = document.createElement("div");
  avatar.className = "phone-relationship-avatar";
  if (entry.iconPath) {
    const icon = document.createElement("img");
    icon.src = entry.iconPath;
    icon.alt = "";
    icon.width = 32;
    icon.height = 32;
    avatar.append(icon);
  } else {
    const fallback = document.createElement("span");
    fallback.textContent = entry.name.charAt(0).toUpperCase();
    avatar.append(fallback);
  }

  const details = document.createElement("div");
  details.className = "phone-relationship-details";

  const name = document.createElement("h3");
  name.textContent = entry.name;

  const scoreRow = document.createElement("p");
  scoreRow.className = "phone-relationship-score";

  const scoreLabel = document.createElement("span");
  scoreLabel.textContent = "Score:";

  const scoreValue = document.createElement("output");
  scoreValue.className = "phone-relationship-score-value";
  scoreValue.dataset.tone = relationshipScoreTone(entry.score);
  scoreValue.textContent = formatRelationshipScore(entry.score);
  scoreValue.setAttribute("aria-label", `${entry.name} relationship score`);

  scoreRow.append(scoreLabel, scoreValue);
  details.append(name, scoreRow);
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

  const header = document.createElement("div");
  header.className = "phone-meter-header";

  const label = document.createElement("h4");
  label.textContent = entry.label;

  const value = document.createElement("output");
  value.textContent =
    kind === "skill"
      ? `${formatStatValue(entry.value)} / ${formatStatValue(entry.max)}`
      : formatStatValue(entry.value);
  value.setAttribute("aria-label", `${entry.label} value`);
  header.append(label, value);

  const meter = document.createElement("div");
  meter.className = "phone-meter";
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-label", entry.label);
  meter.setAttribute("aria-valuemin", String(entry.min));
  meter.setAttribute("aria-valuemax", String(entry.max));
  meter.setAttribute("aria-valuenow", String(entry.value));

  const fill = document.createElement("span");
  fill.className = "phone-meter-fill";
  fill.style.width = `${meterPercentage(entry.value, entry.min, entry.max)}%`;
  meter.append(fill);

  item.append(header, meter);
  return item;
}

function bodyPartTone(part) {
  const fraction = part.maxHealth ? part.health / part.maxHealth : 0;
  if (fraction <= 0.4) return "danger";
  if (fraction < 0.75 || part.pain > 0 || part.conditions.length)
    return "warning";
  return "healthy";
}

function makePhoneBodyPart(part) {
  const item = document.createElement("article");
  item.className = "phone-body-part";
  item.dataset.partId = part.id;
  item.dataset.tone = bodyPartTone(part);

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
  detail.textContent = `${formatPhoneLabel(part.region)} · Pain ${formatStatValue(part.pain)} · ${condition}`;

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

  const bodySection = makePhoneStatsSection("Body status");
  bodySection.append(
    makePhoneValueList([
      {
        label: "Overall health",
        value: `${formatStatValue(view.body.healthPercentage)}%`,
      },
      { label: "Condition", value: formatPhoneLabel(view.body.painLabel) },
      { label: "Pain", value: `${formatStatValue(view.body.pain)} / 100` },
      { label: "Pain stage", value: `${view.body.painStage} / 3` },
      {
        label: "Physical performance",
        value: `${Math.round(view.body.performanceMultiplier * 100)}%`,
      },
      {
        label: "Critical breaks",
        value: view.body.criticalBreaks ? "Yes" : "No",
      },
      { label: "Incapacitated", value: view.body.incapacitated ? "Yes" : "No" },
    ]),
  );

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
          ? `${formatPhoneLabel(item.id)} · ${Math.round(item.durability * 100)}% durability · ${Math.round(item.wetness * 100)}% wet`
          : "Not equipped",
        color: item?.color,
      })),
    ),
  );

  phoneStatsContent.replaceChildren(
    overviewSection,
    statsSection,
    skillsSection,
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

function showPhoneHomeScreen() {
  playerPhoneHeading.textContent = "Phone";
  phoneBackButton.hidden = true;
  phoneHomeScreen.hidden = false;
  phoneRelationshipsScreen.hidden = true;
  phoneStatsScreen.hidden = true;
}

function showPhoneRelationshipsScreen() {
  playerPhoneHeading.textContent = "Relationships";
  phoneBackButton.hidden = false;
  phoneHomeScreen.hidden = true;
  phoneRelationshipsScreen.hidden = false;
  phoneStatsScreen.hidden = true;
  phoneRelationshipsList.replaceChildren(
    ...buildPhoneRelationshipsView(game).map(makePhoneRelationshipEntry),
  );
  phoneRelationshipsScreen.scrollTop = 0;
}

function showPhoneStatsScreen() {
  playerPhoneHeading.textContent = "Player stats";
  phoneBackButton.hidden = false;
  phoneHomeScreen.hidden = true;
  phoneRelationshipsScreen.hidden = true;
  phoneStatsScreen.hidden = false;
  renderPhoneStats();
  phoneStatsScreen.scrollTop = 0;
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

playerDiaryButton.addEventListener("click", () => {
  renderPlayerDiary();
  playerDiaryDialog.showModal();
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
  playerPhoneDate.textContent = diaryDateFormatter.format(game.now);
  showPhoneHomeScreen();
  playerPhoneDialog.showModal();
});

phoneRelationshipsButton.addEventListener(
  "click",
  showPhoneRelationshipsScreen,
);
phoneStatsButton.addEventListener("click", showPhoneStatsScreen);
phoneBackButton.addEventListener("click", showPhoneHomeScreen);
closePhoneButton.addEventListener("click", () => playerPhoneDialog.close());
playerPhoneDialog.addEventListener("click", (event) => {
  if (event.target === playerPhoneDialog) playerPhoneDialog.close();
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
