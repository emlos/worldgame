import { Game } from "../src/game/game.js";
import {
  buildJournalReadView,
  buildJournalWritingView,
} from "../src/game/journal/view.js";
import { WG_BUNDLE } from "../src/story/wg/generated/scenes.js";
import { evaluateWGExpression } from "../src/story/wg/runtime/expressionEvaluator.js";
import { createWGRuntimeContext } from "../src/story/wg/runtime/runtimeContext.js";
import { renderWGText } from "../src/story/wg/runtime/textRuntime.js";

const SANDBOX_SEED = 8128;
const SANDBOX_DATE = "2026-09-04T12:00:00.000Z";

const elements = {
  count: document.querySelector("#journal-count"),
  select: document.querySelector("#journal-select"),
  status: document.querySelector("#journal-status"),
  start: document.querySelector("#start-journal"),
  reset: document.querySelector("#reset-journal"),
  newSandbox: document.querySelector("#new-journal-sandbox"),
  pathControls: document.querySelector("#path-controls"),
  activeState: document.querySelector("#active-journal-state"),
  activeTitle: document.querySelector("#active-journal-title"),
  notice: document.querySelector("#journal-notice"),
  choiceIntro: document.querySelector("#journal-choice-intro"),
  choices: document.querySelector("#journal-choices"),
  prose: document.querySelector("#journal-prose"),
  summary: document.querySelector("#journal-summary"),
  completed: document.querySelector("#completed-journal"),
  stateJson: document.querySelector("#journal-state-json"),
  definitionJson: document.querySelector("#journal-definition-json"),
};

const definitions = Object.values(WG_BUNDLE.journals || {}).sort((left, right) =>
  left.id.localeCompare(right.id, undefined, { numeric: true }));

function createGame() {
  const next = new Game({
    seed: SANDBOX_SEED,
    startDate: new Date(SANDBOX_DATE),
  });
  next.story.home = { unpack: 5 };
  return next;
}

let game = createGame();

function selectedDefinition() {
  return WG_BUNDLE.journals?.[elements.select.value] || definitions[0] || null;
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function setNotice(message = "", tone = "info") {
  elements.notice.textContent = message;
  elements.notice.dataset.tone = tone;
}

function topicLabel(definition) {
  try {
    return renderWGText(
      definition.prompt,
      createWGRuntimeContext(game),
      definition.source,
    );
  } catch {
    return definition.id;
  }
}

function inspectDefinition(definition) {
  const references = new Set();
  const effectTargets = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.type === "path" && Array.isArray(value.value)) {
      references.add(value.value.join("."));
    }
    if (typeof value.op === "string" && Array.isArray(value.path)) {
      effectTargets.add(value.path.join("."));
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(definition);

  const all = [...references].sort();
  return {
    flags: all.filter((path) => path.startsWith("flags.") && !path.startsWith("flags.journal.")),
    story: all.filter((path) => path.startsWith("story.")),
    relationships: all.filter((path) => /^npc\.[^.]+\.relationship\.[^.]+$/.test(path)),
    journalFlags: [...new Set([
      ...all.filter((path) => path.startsWith("flags.journal.")),
      ...[...effectTargets].filter((path) => path.startsWith("flags.journal.")),
    ])].sort(),
    other: all.filter((path) =>
      !path.startsWith("flags.") &&
      !path.startsWith("story.") &&
      !/^npc\.[^.]+\.relationship\.[^.]+$/.test(path)),
  };
}

function definitionAvailable(definition) {
  const context = createWGRuntimeContext(game);
  return (definition.conditions || []).every((condition) =>
    Boolean(evaluateWGExpression(condition, context)));
}

function recordState(id) {
  if (game.journal.draft?.definitionId === id) return "draft";
  if (game.journal.entries.some((record) => record.definitionId === id)) return "completed";
  if (game.journal.dismissed.includes(id)) return "dismissed";
  if (game.journal.pending.some((record) => record.definitionId === id)) return "pending";
  return "locked";
}

function flagId(path) {
  return path.slice("flags.".length);
}

function storyValue(path) {
  let value = game.story;
  for (const segment of path.split(".").slice(1)) value = value?.[segment];
  return value;
}

function setStoryValue(path, value, remove = false) {
  const segments = path.split(".").slice(1);
  let target = game.story;
  for (const segment of segments.slice(0, -1)) {
    if (!target[segment] || typeof target[segment] !== "object" || Array.isArray(target[segment])) {
      target[segment] = {};
    }
    target = target[segment];
  }
  if (remove) delete target[segments.at(-1)];
  else target[segments.at(-1)] = value;
}

function refreshAvailability() {
  game.refreshJournalAvailability();
}

function makeGroup(title) {
  const group = document.createElement("section");
  group.className = "journal-path-group";
  const heading = document.createElement("h3");
  heading.textContent = title;
  group.append(heading);
  return group;
}

function makeFlagControl(path) {
  const label = document.createElement("label");
  label.className = "journal-path-row";
  const code = document.createElement("code");
  code.textContent = path;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = game.flags.has(flagId(path));
  input.addEventListener("change", () => {
    if (input.checked) game.flags.add(flagId(path));
    else game.flags.delete(flagId(path));
    refreshAvailability();
    setNotice(`${path} set to ${input.checked}.`);
    render();
  });
  label.append(code, input);
  return label;
}

function parseEditorValue(raw) {
  const text = raw.trim();
  if (!text) return { remove: true, value: undefined };
  try {
    return { remove: false, value: JSON.parse(text) };
  } catch {
    return { remove: false, value: text };
  }
}

function makeStoryControl(path) {
  const form = document.createElement("form");
  form.className = "journal-path-row journal-story-row";
  const code = document.createElement("code");
  code.textContent = path;
  const input = document.createElement("input");
  const current = storyValue(path);
  input.value = current === undefined ? "" : JSON.stringify(current);
  input.placeholder = "undefined";
  input.setAttribute("aria-label", path);
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.className = "inspector-button";
  apply.textContent = "Set";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const parsed = parseEditorValue(input.value);
    setStoryValue(path, parsed.value, parsed.remove);
    refreshAvailability();
    setNotice(parsed.remove ? `${path} removed.` : `${path} updated.`);
    render();
  });
  form.append(code, input, apply);
  return form;
}

function makeRelationshipControl(path) {
  const [, npcId, meterId] = /^npc\.([^.]+)\.relationship\.([^.]+)$/.exec(path);
  const npc = game.npcs.get(npcId);
  const form = document.createElement("form");
  form.className = "journal-path-row journal-story-row";
  const code = document.createElement("code");
  code.textContent = path;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.value = String(
    game.player.getRelationshipMeter(npcId, meterId, npc.relationshipProfile).value,
  );
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.className = "inspector-button";
  apply.textContent = "Set";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    game.player.setRelationshipMeter({
      npcId,
      meterId,
      value: Number(input.value),
      met: true,
    }, npc.relationshipProfile);
    refreshAvailability();
    setNotice(`${path} updated.`);
    render();
  });
  form.append(code, input, apply);
  return form;
}

function renderPathControls() {
  const definition = selectedDefinition();
  elements.pathControls.replaceChildren();
  if (!definition) return;
  const paths = inspectDefinition(definition);

  const appendControls = (title, values, factory) => {
    const group = makeGroup(title);
    if (!values.length) {
      const empty = document.createElement("p");
      empty.className = "inspector-help";
      empty.textContent = "None referenced.";
      group.append(empty);
    } else {
      group.append(...values.map(factory));
    }
    elements.pathControls.append(group);
  };

  appendControls("flags.*", paths.flags, makeFlagControl);
  appendControls("story.*", paths.story, makeStoryControl);
  appendControls("flags.journal.*", paths.journalFlags, makeFlagControl);
  appendControls("npc.*.relationship.*", paths.relationships, makeRelationshipControl);

  const otherGroup = makeGroup("Other read-only references");
  const list = document.createElement("ul");
  list.className = "journal-other-paths";
  if (!paths.other.length) {
    const item = document.createElement("li");
    item.textContent = "None referenced.";
    list.append(item);
  } else {
    for (const path of paths.other) {
      const item = document.createElement("li");
      item.textContent = path;
      list.append(item);
    }
  }
  otherGroup.append(list);
  elements.pathControls.append(otherGroup);
}

function makeChoiceButton(label, onClick, disabledReason = null) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "journal-write-choice";
  button.textContent = label;
  button.disabled = Boolean(disabledReason);
  if (disabledReason) button.title = disabledReason;
  button.addEventListener("click", onClick);
  return button;
}

function renderProse(record, emptyText) {
  elements.prose.replaceChildren();
  if (!record?.paragraphs?.length) {
    const empty = document.createElement("p");
    empty.className = "journal-empty-page";
    empty.textContent = emptyText;
    elements.prose.append(empty);
    return;
  }
  const entry = document.createElement("article");
  entry.className = "journal-entry";
  for (const text of record.paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    entry.append(paragraph);
  }
  elements.prose.append(entry);
}

function selectedCompletedRecord() {
  const id = selectedDefinition()?.id;
  return buildJournalReadView(game).pages
    .flatMap((page) => page.entries)
    .find((entry) => entry.definitionId === id) || null;
}

function startSelected() {
  const definition = selectedDefinition();
  if (!definition) return;
  if (game.journal.draft && game.journal.draft.definitionId !== definition.id) {
    setNotice("Finish the active draft before starting another topic.", "error");
    return;
  }
  if (["completed", "dismissed"].includes(recordState(definition.id))) {
    setNotice("Reset this topic before replaying it.", "error");
    return;
  }
  if (recordState(definition.id) === "locked") {
    game.journal.pending.push({
      definitionId: definition.id,
      availableAt: game.now.toISOString(),
    });
  }
  try {
    game.startJournalDraft(definition.id);
    setNotice(`Started ${definition.id}.`);
    render();
  } catch (error) {
    setNotice(error.message, "error");
  }
}

function resetSelected() {
  const definition = selectedDefinition();
  if (!definition) return;
  if (game.journal.draft?.definitionId === definition.id) game.journal.draft = null;
  game.journal.pending = game.journal.pending.filter(
    (record) => record.definitionId !== definition.id,
  );
  game.journal.entries = game.journal.entries.filter(
    (record) => record.definitionId !== definition.id,
  );
  game.journal.dismissed = game.journal.dismissed.filter(
    (definitionId) => definitionId !== definition.id,
  );
  for (const path of inspectDefinition(definition).journalFlags) {
    game.flags.delete(flagId(path));
  }
  refreshAvailability();
  setNotice(`Reset ${definition.id}.`);
  render();
}

function renderWritingSurface() {
  const definition = selectedDefinition();
  const draftView = game.journal.draft ? buildJournalWritingView(game) : null;
  elements.choices.replaceChildren();

  if (draftView?.mode === "draft") {
    const activeDefinition = WG_BUNDLE.journals[draftView.token.definitionId];
    elements.activeState.textContent = "Draft active";
    elements.activeTitle.textContent = topicLabel(activeDefinition);
    elements.choiceIntro.textContent = "Choose the next line";
    for (const choice of draftView.choices) {
      elements.choices.append(makeChoiceButton(choice.label, () => {
        try {
          game.chooseJournalOption({ ...draftView.token, choiceId: choice.id });
          setNotice(`Selected: ${choice.label}`);
          render();
        } catch (error) {
          setNotice(error.message, "error");
        }
      }, choice.disabledReason));
    }
    if (!draftView.choices.length) {
      const empty = document.createElement("p");
      empty.className = "inspector-help";
      empty.textContent = "No choices are currently available in this passage.";
      elements.choices.append(empty);
    }
    renderProse(draftView.draft, "The entry has not produced prose yet.");
    return;
  }

  elements.activeState.textContent = definition ? recordState(definition.id) : "No topic";
  elements.activeTitle.textContent = definition ? topicLabel(definition) : "No journals compiled";
  elements.choiceIntro.textContent = definitionAvailable(definition)
    ? "The authored availability conditions currently pass."
    : "The authored conditions are currently false; Start selected will force the topic.";
  if (definition) {
    elements.choices.append(makeChoiceButton("Start selected topic", startSelected));
  }
  renderProse(
    selectedCompletedRecord(),
    "Start the selected topic to preview its prose here.",
  );
}

function renderCompletedJournal() {
  const view = buildJournalReadView(game);
  elements.completed.replaceChildren();
  if (!view.pages.length) {
    const empty = document.createElement("p");
    empty.className = "inspector-help";
    empty.textContent = "No completed entries.";
    elements.completed.append(empty);
    return;
  }
  for (const page of view.pages) {
    const section = document.createElement("section");
    section.className = "journal-completed-page";
    const heading = document.createElement("h3");
    heading.textContent = page.date;
    section.append(heading);
    for (const entry of page.entries) {
      for (const text of entry.paragraphs) {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        section.append(paragraph);
      }
    }
    elements.completed.append(section);
  }
}

function renderSummary() {
  const definition = selectedDefinition();
  const rows = [
    ["Selected", definition?.id || "none"],
    ["Conditions", definition ? (definitionAvailable(definition) ? "pass" : "fail") : "n/a"],
    ["State", definition ? recordState(definition.id) : "n/a"],
    ["Pending", game.journal.pending.length],
    ["Completed", game.journal.entries.length],
    ["Dismissed", game.journal.dismissed.length],
    ["Active choices", game.journal.draft?.choices.length || 0],
  ];
  elements.summary.replaceChildren(...rows.flatMap(([term, description]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = String(description);
    return [dt, dd];
  }));
}

function renderSelectedStatus() {
  const definition = selectedDefinition();
  if (!definition) {
    elements.status.textContent = "No journal definitions were compiled.";
    return;
  }
  elements.status.textContent =
    `${definition.id} · ${recordState(definition.id)} · authored conditions ` +
    `${definitionAvailable(definition) ? "pass" : "fail"}`;
  elements.start.disabled = Boolean(
    game.journal.draft && game.journal.draft.definitionId !== definition.id,
  );
}

function renderDiagnostics() {
  const definition = selectedDefinition();
  elements.stateJson.textContent = safeJson(game.journal);
  elements.definitionJson.textContent = safeJson(definition);
  renderSummary();
  renderCompletedJournal();
}

function render() {
  renderSelectedStatus();
  renderPathControls();
  renderWritingSurface();
  renderDiagnostics();
}

function initializeCatalog() {
  elements.count.textContent = `${definitions.length} topic${definitions.length === 1 ? "" : "s"}`;
  for (const definition of definitions) {
    const option = document.createElement("option");
    option.value = definition.id;
    option.textContent = `${definition.id} — ${topicLabel(definition)}`;
    elements.select.append(option);
  }
  if (definitions.length) elements.select.value = definitions[0].id;
}

elements.select.addEventListener("change", () => {
  setNotice();
  render();
});
elements.start.addEventListener("click", startSelected);
elements.reset.addEventListener("click", resetSelected);
elements.newSandbox.addEventListener("click", () => {
  game = createGame();
  setNotice("Created a clean journal sandbox.");
  render();
});

initializeCatalog();
render();
