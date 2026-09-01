import { Game } from "../src/classes/game/game.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import {
  enterWGScene,
  enterWGSequence,
  resolveActiveWGStory,
} from "../src/classes/game/scene/wg/storyRuntime.js";
import { WG_BUNDLE } from "../src/generated/wg/scenes.js";
import { SKILLS, STATS } from "../src/data/player/stats.js";
import {
  SCHOOL_SUBJECTS,
  SUBJECT_GRADE_MAX,
  SUBJECT_GRADE_MIN,
} from "../src/data/player/education.js";
import { getSchoolDayState } from "../src/data/player/schedule.js";
import { createWGRuntimeContext } from "../src/classes/game/scene/wg/runtimeContext.js";
import { createChoiceSection, renderSceneContent } from "../src/ui/browser/sceneContent.js";
import { setOutcomeText } from "../src/ui/browser/outcomes.js";

const SANDBOX_SEED = 117;
const SANDBOX_DATE = "2026-09-01T07:00:00.000Z";

const elements = {
  catalogCount: document.querySelector("#catalog-count"),
  targetFilter: document.querySelector("#target-filter"),
  targetSelect: document.querySelector("#target-select"),
  targetSummary: document.querySelector("#target-summary"),
  startTarget: document.querySelector("#start-target"),
  restartTarget: document.querySelector("#restart-target"),
  newSandbox: document.querySelector("#new-sandbox"),
  playerFields: document.querySelector("#player-fields"),
  referencedFlags: document.querySelector("#referenced-flags"),
  addFlagForm: document.querySelector("#add-flag-form"),
  flagKind: document.querySelector("#flag-kind"),
  flagName: document.querySelector("#flag-name"),
  activeFlags: document.querySelector("#active-flags"),
  relationshipFields: document.querySelector("#relationship-fields"),
  storyJson: document.querySelector("#story-json"),
  applyStoryJson: document.querySelector("#apply-story-json"),
  activeKind: document.querySelector("#active-kind"),
  activeTarget: document.querySelector("#active-target"),
  sceneStatus: document.querySelector("#scene-status"),
  undoChoice: document.querySelector("#undo-choice"),
  notice: document.querySelector("#inspector-notice"),
  scenePreview: document.querySelector("#scene-preview"),
  runtimeSummary: document.querySelector("#runtime-summary"),
  currentFrame: document.querySelector("#current-frame"),
  runtimeContext: document.querySelector("#runtime-context"),
  sceneContract: document.querySelector("#scene-contract"),
  clearTrace: document.querySelector("#clear-trace"),
  actionTrace: document.querySelector("#action-trace"),
  valueFieldTemplate: document.querySelector("#value-field-template"),
};

function createGame() {
  return new Game({
    seed: SANDBOX_SEED,
    startDate: new Date(SANDBOX_DATE),
    playerOptions: { startPlaceId: null },
  });
}

function detachedGameSave() {
  return JSON.parse(JSON.stringify(game));
}

function titleForDefinition(id, definition) {
  return definition.heading || definition.choiceHeading || id;
}

const catalog = [
  ...Object.entries(WG_BUNDLE.scenes).map(([id, definition]) => ({
    key: `scene:${id}`,
    id,
    type: "scene",
    definition,
    title: titleForDefinition(id, definition),
    detail: `${definition.kind} scene${definition.tags?.length ? ` · ${definition.tags.join(", ")}` : ""}`,
  })),
  ...Object.entries(WG_BUNDLE.sequences || {}).map(([id, definition]) => ({
    key: `sequence:${id}`,
    id,
    type: "sequence",
    definition,
    title: titleForDefinition(id, definition),
    detail: definition.system
      ? `${definition.system.id} system sequence`
      : `${definition.passages?.length || 0} passage sequence`,
  })),
].sort((left, right) =>
  left.type.localeCompare(right.type) ||
  left.id.localeCompare(right.id, undefined, { numeric: true }),
);
const catalogByKey = new Map(catalog.map((entry) => [entry.key, entry]));

let game = createGame();
let selectedKey = null;
let activeCatalogEntry = null;
let currentScene = null;
let trace = [];
let preludeParagraphs = [];
let undoStack = [];
let entryCheckpoint = null;
let editorOverrides = createEditorOverrides();
let storyRefreshTimer = null;

function createEditorOverrides() {
  return {
    money: undefined,
    stats: new Map(),
    skills: new Map(),
    grades: new Map(),
    flags: new Map(),
    dailyFlags: new Map(),
    relationships: new Map(),
    story: undefined,
  };
}

function resetEditorOverrides() {
  editorOverrides = createEditorOverrides();
}

function clearChoiceUndo() {
  undoStack = [];
}

function applyEditorOverrides() {
  if (editorOverrides.money !== undefined) {
    game.player.adjustMoney(editorOverrides.money - game.player.money);
  }
  for (const [id, value] of editorOverrides.stats) {
    game.player.adjustStatBase(id, value - game.player.getStatBase(id));
  }
  for (const [id, value] of editorOverrides.skills) {
    game.player.setSkillValue(id, value);
  }
  for (const [id, value] of editorOverrides.grades) {
    game.player.adjustSubjectGrade(id, value - game.player.getSubjectGrade(id));
  }
  for (const [id, value] of editorOverrides.flags) game.setFlag(id, value);
  for (const [id, value] of editorOverrides.dailyFlags) game.setDailyFlag(id, value);
  for (const [id, value] of editorOverrides.relationships) {
    game.player.setRelationship({ npcId: id, ...value });
  }
  if (editorOverrides.story !== undefined) {
    game.story = JSON.parse(JSON.stringify(editorOverrides.story));
  }
}

function selectedEntry() {
  return catalogByKey.get(elements.targetSelect.value) || null;
}

function setNotice(message = "", tone = "info") {
  elements.notice.textContent = message;
  elements.notice.dataset.tone = tone;
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function frameLabel(frame) {
  if (!frame) return "world";
  if (frame.type === "sequence") {
    return `${frame.id}${frame.passageId ? ` / ${frame.passageId}` : ""}`;
  }
  return frame.id;
}

function snapshotState() {
  return {
    frame: frameLabel(game.currentStory),
    time: game.now.toISOString(),
    location: game.currentLocationId,
    place: game.currentPlaceKey,
    money: game.player.money,
    stats: Object.fromEntries(
      Object.keys(STATS).map((id) => [id, game.player.getStatBase(id)]),
    ),
    skills: Object.fromEntries(
      Object.keys(SKILLS).map((id) => [id, game.player.getSkillValue(id)]),
    ),
    grades: Object.fromEntries(
      Object.keys(SCHOOL_SUBJECTS).map((id) => [id, game.player.getSubjectGrade(id)]),
    ),
    relationships: Object.fromEntries(
      [...game.npcs.keys()].sort().map((id) => {
        const relationship = game.player.getRelationship(id);
        return [id, { met: relationship.met, score: relationship.score }];
      }),
    ),
    flags: [...game.flags].sort(),
    dailyFlags: [...game.dailyFlags].sort(),
    reminders: [...game.reminders].sort(),
    unlockedPlaces: [...game.world.locations.values()]
      .flatMap((location) => (location.places || [])
        .filter((place) => place.unlocked)
        .map((place) => `${location.id}/${place.key}`))
      .sort(),
    story: safeJson(game.story),
  };
}

function changedValues(before, after, group) {
  return Object.keys(after[group]).flatMap((id) => {
    if (before[group][id] === after[group][id]) return [];
    return [`${id} ${before[group][id]}→${after[group][id]}`];
  });
}

function stateChanges(before, after) {
  const changes = [];
  if (before.frame !== after.frame) changes.push(`${before.frame} → ${after.frame}`);
  if (before.time !== after.time) changes.push(`time ${before.time}→${after.time}`);
  if (before.location !== after.location || before.place !== after.place) {
    changes.push(
      `position ${before.location}/${before.place || "outdoors"}`
      + `→${after.location}/${after.place || "outdoors"}`,
    );
  }
  if (before.money !== after.money) changes.push(`money £${before.money}→£${after.money}`);
  changes.push(...changedValues(before, after, "stats"));
  changes.push(...changedValues(before, after, "skills"));
  changes.push(...changedValues(before, after, "grades"));
  for (const id of Object.keys(after.relationships)) {
    const previous = before.relationships[id];
    const next = after.relationships[id];
    if (previous.score !== next.score) {
      changes.push(`relationship ${id} ${previous.score}→${next.score}`);
    }
    if (previous.met !== next.met) {
      changes.push(`relationship ${id} ${next.met ? "met" : "unmet"}`);
    }
  }
  const setChanges = (beforeValues, afterValues, label) => {
    const previous = new Set(beforeValues);
    const next = new Set(afterValues);
    for (const id of next) if (!previous.has(id)) changes.push(`+${label} ${id}`);
    for (const id of previous) if (!next.has(id)) changes.push(`−${label} ${id}`);
  };
  setChanges(before.flags, after.flags, "flag");
  setChanges(before.dailyFlags, after.dailyFlags, "daily");
  setChanges(before.reminders, after.reminders, "reminder");
  setChanges(before.unlockedPlaces, after.unlockedPlaces, "place");
  if (before.story !== after.story) changes.push("story state updated");
  return changes;
}

function addTrace(label, changes = []) {
  trace.push({ label, changes: changes.length ? changes : ["no tracked state change"] });
  renderTrace();
}

function renderTrace() {
  elements.actionTrace.replaceChildren(
    ...trace.map((entry) => {
      const item = document.createElement("li");
      item.className = "inspector-trace-item";
      const label = document.createElement("strong");
      label.textContent = entry.label;
      const changes = document.createElement("small");
      changes.textContent = entry.changes.join(" · ");
      item.append(label, changes);
      return item;
    }),
  );
}

function renderCatalog(filter = elements.targetFilter.value) {
  const query = filter.trim().toLocaleLowerCase();
  const visible = catalog.filter((entry) =>
    !query || [entry.id, entry.title, entry.type, entry.detail]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query),
  );
  const previous = elements.targetSelect.value || selectedKey;
  const groups = new Map([
    ["scene", document.createElement("optgroup")],
    ["sequence", document.createElement("optgroup")],
  ]);
  groups.get("scene").label = "Scenes";
  groups.get("sequence").label = "Sequences";
  for (const entry of visible) {
    const option = document.createElement("option");
    option.value = entry.key;
    option.textContent = `${entry.id} — ${entry.title}`;
    option.title = entry.detail;
    groups.get(entry.type).append(option);
  }
  elements.targetSelect.replaceChildren(
    ...[...groups.values()].filter((group) => group.children.length),
  );
  const preferred = visible.find((entry) => entry.key === previous)
    || visible.find((entry) => entry.id === "story.rent.intro.2")
    || visible[0]
    || null;
  if (preferred) {
    elements.targetSelect.value = preferred.key;
    selectedKey = preferred.key;
  }
  elements.catalogCount.textContent = `${visible.length} / ${catalog.length}`;
  elements.startTarget.disabled = !preferred;
  renderTargetSummary();
}

function renderTargetSummary() {
  const entry = selectedEntry();
  selectedKey = entry?.key || selectedKey;
  elements.targetSummary.textContent = entry
    ? `${entry.detail}. ${entry.id}`
    : "No matching content.";
}

function findPlaceHubEntry(sceneId) {
  return Object.values(WG_BUNDLE.entries || {}).find((entry) =>
    entry.sceneId === sceneId && entry.hub?.type === "place",
  ) || null;
}

function findPlaceByKeys(keys) {
  for (const location of game.world.locations.values()) {
    const place = (location.places || []).find((candidate) =>
      keys.includes(String(candidate.key)),
    );
    if (place) return { location, place };
  }
  return null;
}

function placePlayerAtKey(placeKey) {
  game.unlockPlacesByKey(placeKey);
  const destination = findPlaceByKeys([placeKey]);
  if (!destination) {
    throw new Error(`No generated place matches '${placeKey}' in this sandbox world.`);
  }
  game.setCurrentPlace({ placeId: null });
  game.moveTo(destination.location.id);
  game.setCurrentPlace({ placeId: destination.place.id });
  return destination;
}

function preparePlaceScene(entry) {
  const hub = findPlaceHubEntry(entry.id);
  if (!hub?.placeKeys?.length) {
    throw new Error(`Place scene '${entry.id}' has no matching authored hub entry.`);
  }
  const destination = findPlaceByKeys(hub.placeKeys.map(String));
  if (!destination) {
    throw new Error(
      `No generated place matches ${hub.placeKeys.join(", ")} in this sandbox world.`,
    );
  }
  placePlayerAtKey(destination.place.key);
}

function prepareSchoolContext(subjectId) {
  const state = getSchoolDayState(game);
  const period = state.school?.periods?.find((candidate) =>
    candidate.kind === "class" && candidate.subjectId === subjectId,
  );
  if (!period || !state.school?.placeId || !state.school?.locationId) {
    throw new Error(`Could not prepare the school timetable for '${subjectId}'.`);
  }
  game.setCurrentPlace({ placeId: null });
  game.moveTo(state.school.locationId);
  game.setCurrentPlace({ placeId: state.school.placeId });
  const [hour, minute] = period.start.split(":").map(Number);
  const classStart = new Date(game.now);
  classStart.setUTCHours(hour, minute, 0, 0);
  const energy = game.player.getStatBase("energy");
  game.jumpToDate(classStart, { mode: "resync" });
  game.player.setStatBase("energy", energy);
}

function schoolSubjectFor(entry) {
  const authored = entry.definition.schoolClass?.subjectId;
  if (authored) return authored;
  if (entry.type !== "sequence" || !entry.id.startsWith("school.")) return null;
  const candidate = entry.id.split(".")[1]?.replaceAll("-", "_");
  return SCHOOL_SUBJECTS[candidate] ? candidate : null;
}

function seedInspectorReturn(entry) {
  if (entry.type !== "sequence" || entry.definition.finalTarget !== "@return") return;
  game.storyContinuations.push({
    target: "@exit",
    sequenceId: null,
    schoolClass: null,
    poolId: "scene-inspector",
    entryId: entry.id,
    sourceStoryId: entry.id,
    sourcePassageId: game.currentStory?.passageId || null,
    sourceChoiceId: "scene-inspector",
  });
}

function enterCatalogEntry(entry, { beforeEnter = null } = {}) {
  game.storyContinuations.length = 0;
  game.setCurrentPlace({ placeId: null });
  if (entry.type === "scene" && entry.definition.kind === "place") {
    preparePlaceScene(entry);
    beforeEnter?.();
    enterWGScene(game, entry.id);
    resolveActiveWGStory(game);
    return;
  }
  if (entry.type === "scene") {
    if (["transit.bus-boarding", "transit.bus-timetable"].includes(entry.id)) {
      placePlayerAtKey("bus_stop");
    }
    if (entry.id.startsWith("place.high-school.")) {
      placePlayerAtKey("high_school");
    }
    beforeEnter?.();
    enterWGScene(game, entry.id);
    resolveActiveWGStory(game);
    return;
  }
  const schoolSubject = schoolSubjectFor(entry);
  if (schoolSubject) prepareSchoolContext(schoolSubject);
  beforeEnter?.();
  enterWGSequence(game, entry.id);
  seedInspectorReturn(entry);
  resolveActiveWGStory(game);
}

function startEntry(entry, label = "Start") {
  if (!entry) return;
  const before = snapshotState();
  const rollback = detachedGameSave();
  try {
    enterCatalogEntry(entry);
    activeCatalogEntry = entry;
    entryCheckpoint = rollback;
    resetEditorOverrides();
    preludeParagraphs = [];
    clearChoiceUndo();
    setNotice(`${entry.type === "scene" ? "Scene" : "Sequence"} started.`);
    addTrace(`${label}: ${entry.id}`, stateChanges(before, snapshotState()));
    render();
  } catch (error) {
    game = Game.fromJSON(rollback);
    setNotice(error.message, "error");
    renderDiagnostics();
  }
}

function restartEntry() {
  if (!activeCatalogEntry || !entryCheckpoint) return;
  const rollback = detachedGameSave();
  try {
    game = Game.fromJSON(entryCheckpoint);
    const before = snapshotState();
    enterCatalogEntry(activeCatalogEntry, { beforeEnter: applyEditorOverrides });
    preludeParagraphs = [];
    clearChoiceUndo();
    setNotice(`${activeCatalogEntry.type === "scene" ? "Scene" : "Sequence"} restarted.`);
    addTrace(
      `Restart: ${activeCatalogEntry.id}`,
      stateChanges(before, snapshotState()),
    );
    render();
  } catch (error) {
    game = Game.fromJSON(rollback);
    setNotice(error.message, "error");
    renderDiagnostics();
  }
}

function newSandbox({ restart = true } = {}) {
  game = createGame();
  currentScene = null;
  preludeParagraphs = [];
  trace = [];
  clearChoiceUndo();
  entryCheckpoint = null;
  resetEditorOverrides();
  setNotice("Created a clean deterministic sandbox.");
  renderTrace();
  if (restart && activeCatalogEntry) startEntry(activeCatalogEntry, "New sandbox");
  else render();
}

function formatDuration(minutes) {
  if (!minutes) return "";
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} hr${remainder ? ` ${remainder} min` : ""}`;
}

function choiceMeta(choice) {
  const details = [];
  if (choice.durationMinutes) details.push(formatDuration(choice.durationMinutes));
  for (const cost of choice.costs || []) details.push(cost.label || `${cost.amount} ${cost.type}`);
  for (const effect of choice.effectsPreview || []) {
    details.push(effect.label || `${effect.amount > 0 ? "+" : ""}${effect.amount} ${effect.type}`);
  }
  if (choice.skillCheck) {
    details.push(`${choice.skillCheck.targetLabel}: ${choice.skillCheck.difficultyLabel}`);
  }
  if (choice.warning) details.push(`⚠ ${choice.warning}`);
  if (!choice.enabled && choice.disabledReason) details.push(choice.disabledReason);
  return details.join(" · ");
}

function makeChoiceButton(sceneId, choice) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice";
  button.disabled = !choice.enabled;
  button.dataset.choiceId = choice.id;

  const icon = document.createElement("span");
  icon.className = "choice-icon";
  icon.textContent = choice.icon || "";

  const label = document.createElement("span");
  label.className = "choice-label";
  const text = document.createElement("span");
  text.textContent = choice.label;
  label.append(text);
  const metaText = choiceMeta(choice);
  if (metaText) {
    const meta = document.createElement("small");
    meta.className = "inspector-choice-meta";
    meta.textContent = metaText;
    label.append(meta);
  }
  button.append(icon, label);
  button.addEventListener("click", () => choose(sceneId, choice));
  return button;
}

function renderPreview() {
  elements.scenePreview.replaceChildren();
  if (!currentScene) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent = "Start a scene or sequence to render it here.";
    elements.scenePreview.append(empty);
    return;
  }

  if (currentScene.heading !== null) {
    const heading = document.createElement("h1");
    heading.textContent = currentScene.heading;
    elements.scenePreview.append(heading);
  }
  for (const alert of currentScene.alerts || []) {
    const alertElement = document.createElement("p");
    alertElement.className = "scene-alert";
    alertElement.dataset.tone = alert.tone;
    setOutcomeText(alertElement, alert.text);
    elements.scenePreview.append(alertElement);
  }
  for (const paragraphText of preludeParagraphs) {
    const paragraph = document.createElement("p");
    paragraph.className = "scene-response";
    setOutcomeText(paragraph, paragraphText);
    elements.scenePreview.append(paragraph);
  }
  renderSceneContent(elements.scenePreview, currentScene.content);
  for (const section of currentScene.sections) {
    elements.scenePreview.append(
      createChoiceSection(document, section, (choice) =>
        makeChoiceButton(currentScene.id, choice),
      ),
    );
  }
}

function choose(sceneId, choice) {
  const before = snapshotState();
  const checkpoint = {
    game: detachedGameSave(),
    preludeParagraphs: [...preludeParagraphs],
  };
  try {
    const result = performChoice(game, { sceneId, choiceId: choice.id });
    undoStack.push(checkpoint);
    preludeParagraphs = result.paragraphs || [];
    setNotice(result.notice || "");
    addTrace(`Choice: ${choice.label}`, stateChanges(before, snapshotState()));
    render();
  } catch (error) {
    setNotice(error.message, "error");
    render();
  }
}

function makeNumberField({ id, label, value, min, max, step = 1, onChange }) {
  const fragment = elements.valueFieldTemplate.content.cloneNode(true);
  const field = fragment.querySelector("label");
  const labelElement = fragment.querySelector("span");
  const input = fragment.querySelector("input");
  field.htmlFor = id;
  labelElement.textContent = label;
  input.id = id;
  input.value = value;
  input.min = min;
  input.max = max;
  input.step = step;
  const commit = () => {
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) {
      input.value = value;
      return;
    }
    try {
      const before = snapshotState();
      const next = Math.max(min, Math.min(max, parsed));
      onChange(next);
      input.value = next;
      clearChoiceUndo();
      addTrace(`Edit ${label}`, stateChanges(before, snapshotState()));
      setNotice(`${label} updated.`);
      scheduleStorySurfaceRender();
    } catch (error) {
      setNotice(error.message, "error");
      input.value = value;
      renderDiagnostics();
    }
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit();
  });
  return fragment;
}

function valueGroup(title) {
  const group = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const fields = document.createElement("div");
  fields.className = "inspector-field-grid";
  group.append(heading, fields);
  return { group, fields };
}

function renderPlayerFields() {
  const overview = valueGroup("Resources");
  overview.fields.append(
    makeNumberField({
      id: "state-money",
      label: "Money (£)",
      value: game.player.money,
      min: -1_000_000,
      max: 1_000_000,
      step: 1,
      onChange: (value) => {
        game.player.adjustMoney(value - game.player.money);
        editorOverrides.money = value;
      },
    }),
  );

  const stats = valueGroup("Stats");
  for (const [id, definition] of Object.entries(STATS)) {
    stats.fields.append(
      makeNumberField({
        id: `state-stat-${id}`,
        label: definition.label,
        value: game.player.getStatBase(id),
        min: definition.min,
        max: definition.max,
        step: 1,
        onChange: (value) => {
          game.player.adjustStatBase(id, value - game.player.getStatBase(id));
          editorOverrides.stats.set(id, value);
        },
      }),
    );
  }

  const skills = valueGroup("Skills");
  for (const [id, definition] of Object.entries(SKILLS)) {
    skills.fields.append(
      makeNumberField({
        id: `state-skill-${id}`,
        label: definition.label,
        value: game.player.getSkillValue(id),
        min: definition.min,
        max: definition.max,
        step: 0.1,
        onChange: (value) => {
          game.player.setSkillValue(id, value);
          editorOverrides.skills.set(id, value);
        },
      }),
    );
  }

  const grades = valueGroup("School grades");
  for (const [id, definition] of Object.entries(SCHOOL_SUBJECTS)) {
    grades.fields.append(
      makeNumberField({
        id: `state-grade-${id}`,
        label: definition.label,
        value: game.player.getSubjectGrade(id),
        min: SUBJECT_GRADE_MIN,
        max: SUBJECT_GRADE_MAX,
        step: 1,
        onChange: (value) => {
          game.player.adjustSubjectGrade(id, value - game.player.getSubjectGrade(id));
          editorOverrides.grades.set(id, value);
        },
      }),
    );
  }
  elements.playerFields.replaceChildren(
    overview.group,
    stats.group,
    skills.group,
    grades.group,
  );
}

function walkDefinition(value, visit, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walkDefinition(item, visit, seen);
    return;
  }
  for (const item of Object.values(value)) walkDefinition(item, visit, seen);
}

function referencedFlagIds(entry) {
  const found = { flag: new Set(), daily: new Set() };
  if (!entry) return found;
  const definitions = [
    entry.definition,
    ...Object.values(WG_BUNDLE.entries || {}).filter((candidate) =>
      candidate.sceneId === entry.id,
    ),
  ];
  for (const definition of definitions) {
    walkDefinition(definition, (node) => {
      if (node.type === "path" && Array.isArray(node.value)) {
        const [root, ...segments] = node.value;
        if (root === "flags" && segments.length) found.flag.add(segments.join("."));
        if (root === "daily" && segments.length) found.daily.add(segments.join("."));
      }
      const effect = node.effect && typeof node.effect === "object" ? node.effect : node;
      if (effect.op === "flag" && effect.flag) found.flag.add(effect.flag);
      if (effect.op === "daily-flag" && effect.flag) found.daily.add(effect.flag);
    });
  }
  return found;
}

function flagToggle(kind, id) {
  const label = document.createElement("label");
  label.className = "inspector-flag-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = kind === "flag" ? game.hasFlag(id) : game.hasDailyFlag(id);
  input.addEventListener("change", () => {
    const before = snapshotState();
    if (kind === "flag") game.setFlag(id, input.checked);
    else game.setDailyFlag(id, input.checked);
    const overrides = kind === "flag" ? editorOverrides.flags : editorOverrides.dailyFlags;
    overrides.set(id, input.checked);
    clearChoiceUndo();
    setNotice(`${id} ${input.checked ? "enabled" : "disabled"}.`);
    addTrace(
      `${input.checked ? "Set" : "Clear"} ${kind}: ${id}`,
      stateChanges(before, snapshotState()),
    );
    render();
  });
  const text = document.createElement("span");
  text.textContent = `${kind === "daily" ? "daily." : "flags."}${id}`;
  label.append(input, text);
  return label;
}

function renderFlags() {
  const referenced = referencedFlagIds(selectedEntry() || activeCatalogEntry);
  const groups = [];
  for (const [kind, ids] of Object.entries(referenced)) {
    if (!ids.size) continue;
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = kind === "flag" ? "Referenced game flags" : "Referenced daily flags";
    const list = document.createElement("div");
    list.className = "inspector-flag-list";
    list.append(...[...ids].sort().map((id) => flagToggle(kind, id)));
    section.append(heading, list);
    groups.push(section);
  }
  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "inspector-help";
    empty.textContent = "The selected target has no directly referenced flags.";
    groups.push(empty);
  }
  elements.referencedFlags.replaceChildren(...groups);

  const chips = [];
  for (const [kind, values] of [["flag", game.flags], ["daily", game.dailyFlags]]) {
    for (const id of [...values].sort()) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "inspector-chip";
      chip.textContent = kind === "daily" ? `daily.${id}` : id;
      chip.title = `Remove ${kind}`;
      chip.setAttribute(
        "aria-label",
        `Remove ${kind === "daily" ? "daily" : "game"} flag ${id}`,
      );
      chip.addEventListener("click", () => {
        const before = snapshotState();
        if (kind === "flag") game.clearFlag(id);
        else game.clearDailyFlag(id);
        const overrides = kind === "flag" ? editorOverrides.flags : editorOverrides.dailyFlags;
        overrides.set(id, false);
        clearChoiceUndo();
        addTrace(`Clear ${kind}: ${id}`, stateChanges(before, snapshotState()));
        render();
      });
      chips.push(chip);
    }
  }
  if (!chips.length) {
    const empty = document.createElement("span");
    empty.className = "inspector-help";
    empty.textContent = "No active flags.";
    chips.push(empty);
  }
  elements.activeFlags.replaceChildren(...chips);
}

function renderRelationships() {
  const fields = [];
  for (const npc of [...game.npcs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const relationship = game.player.getRelationship(npc.id);
    fields.push(
      makeNumberField({
        id: `state-relationship-${npc.id}`,
        label: npc.meta?.shortName || npc.name,
        value: relationship.score,
        min: -1,
        max: 1,
        step: 0.01,
        onChange: (value) => {
          game.player.setRelationship({ npcId: npc.id, met: true, score: value });
          editorOverrides.relationships.set(npc.id, { met: true, score: value });
        },
      }),
    );
  }
  elements.relationshipFields.replaceChildren(...fields);
}

function renderRuntimeSummary() {
  const frame = game.currentStory;
  const rows = [
    ["Frame", frame?.type || "none"],
    ["ID", frame?.id || "—"],
    ["Passage", frame?.passageId || "—"],
    ["Location", game.currentLocationId || "—"],
    ["Place", game.currentPlaceKey || "outdoors"],
    ["Story revision", game.storyRevision],
    ["Action revision", game.actionRevision],
    ["Game time", game.now.toISOString()],
  ];
  elements.runtimeSummary.replaceChildren(
    ...rows.flatMap(([name, value]) => {
      const term = document.createElement("dt");
      term.textContent = name;
      const description = document.createElement("dd");
      description.textContent = String(value);
      return [term, description];
    }),
  );
}

function renderDiagnostics() {
  const frame = game.currentStory;
  elements.currentFrame.textContent = safeJson(frame);
  elements.runtimeContext.textContent = safeJson(createWGRuntimeContext(game));
  elements.sceneContract.textContent = currentScene ? safeJson(currentScene) : "null";
  renderRuntimeSummary();
  elements.restartTarget.disabled = !activeCatalogEntry;
  elements.undoChoice.disabled = undoStack.length === 0;
  if (frame) {
    elements.activeKind.textContent = frame.type;
    elements.activeTarget.textContent = frameLabel(frame);
  } else {
    elements.activeKind.textContent = activeCatalogEntry ? "Target finished" : "No target running";
    elements.activeTarget.textContent = activeCatalogEntry?.id || "Select content to begin";
  }
}

function renderStorySurface({ syncStoryEditor = true } = {}) {
  try {
    currentScene = game.currentStory ? buildScene(game) : null;
    if (currentScene?.status) {
      const date = new Date(currentScene.status.now);
      elements.sceneStatus.textContent =
        `${date.toISOString().slice(0, 16).replace("T", " ")} UTC · ` +
        `${currentScene.status.weather} · ${Math.round(currentScene.status.temperatureC)}°C`;
    } else {
      elements.sceneStatus.textContent = "";
    }
  } catch (error) {
    currentScene = null;
    setNotice(error.message, "error");
  }
  renderPreview();
  if (syncStoryEditor) elements.storyJson.value = safeJson(game.story);
  renderDiagnostics();
}

function scheduleStorySurfaceRender() {
  if (storyRefreshTimer !== null) window.clearTimeout(storyRefreshTimer);
  storyRefreshTimer = window.setTimeout(() => {
    storyRefreshTimer = null;
    renderStorySurface({ syncStoryEditor: false });
  }, 0);
}

function render() {
  if (storyRefreshTimer !== null) {
    window.clearTimeout(storyRefreshTimer);
    storyRefreshTimer = null;
  }
  renderStorySurface();
  renderPlayerFields();
  renderFlags();
  renderRelationships();
}

elements.targetFilter.addEventListener("input", () => renderCatalog());
elements.targetSelect.addEventListener("change", () => {
  selectedKey = elements.targetSelect.value;
  renderTargetSummary();
  renderFlags();
});
elements.targetSelect.addEventListener("dblclick", () => startEntry(selectedEntry()));
elements.startTarget.addEventListener("click", () => startEntry(selectedEntry()));
elements.restartTarget.addEventListener("click", () => restartEntry());
elements.newSandbox.addEventListener("click", () => newSandbox());
elements.undoChoice.addEventListener("click", () => {
  const checkpoint = undoStack.pop();
  if (!checkpoint) return;
  try {
    game = Game.fromJSON(checkpoint.game);
    preludeParagraphs = checkpoint.preludeParagraphs;
    addTrace("Undo last choice", [frameLabel(game.currentStory)]);
    setNotice("Restored the state before the last choice.");
    render();
  } catch (error) {
    undoStack.push(checkpoint);
    setNotice(error.message, "error");
    renderDiagnostics();
  }
});
elements.clearTrace.addEventListener("click", () => {
  trace = [];
  renderTrace();
});
elements.addFlagForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = elements.flagName.value.trim();
  if (!id) return;
  const before = snapshotState();
  if (elements.flagKind.value === "daily") game.setDailyFlag(id, true);
  else game.setFlag(id, true);
  const overrides = elements.flagKind.value === "daily"
    ? editorOverrides.dailyFlags
    : editorOverrides.flags;
  overrides.set(id, true);
  clearChoiceUndo();
  addTrace(
    `Set ${elements.flagKind.value}: ${id}`,
    stateChanges(before, snapshotState()),
  );
  elements.flagName.value = "";
  render();
});
elements.applyStoryJson.addEventListener("click", () => {
  try {
    const parsed = JSON.parse(elements.storyJson.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("Story state must be a JSON object.");
    }
    const before = snapshotState();
    game.story = parsed;
    editorOverrides.story = JSON.parse(JSON.stringify(parsed));
    clearChoiceUndo();
    addTrace("Apply story state JSON", stateChanges(before, snapshotState()));
    setNotice("Story state applied.");
    render();
  } catch (error) {
    setNotice(error.message, "error");
  }
});

renderCatalog("");
renderTrace();
render();
