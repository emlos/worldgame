import { PronounSets, Gender } from "../src/characters/core/pronouns.js";
import {
  ACTOR_PROFILES,
  generateSceneActors,
} from "../src/characters/npc/temporaryActors.js";
import { getEncounterDebugSnapshot } from "../src/features/encounter/debug.js";
import { ENCOUNTER_PHYSICAL_SYSTEM_ID } from "../src/features/encounter/system.js";
import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { WG_BUNDLE } from "../src/story/wg/generated/scenes.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../src/story/wg/runtime/storyRuntime.js";
import { createChoiceSection, renderSceneContent } from "../src/ui/browser/sceneContent.js";

const START_DATE = new Date("2026-09-11T20:00:00.000Z");
const PLAYER_STATS = Object.freeze(["strength", "endurance", "resolve", "fitness"]);
const ATTACKER_STATS = Object.freeze(["strength", "endurance", "resolve", "fitness"]);
const DEFAULT_STAT = 5;

const identities = Object.freeze([
  Object.freeze({
    id: "man",
    label: "man · he/him",
    category: "man",
    noun: "man",
    gender: Gender.M,
    pronouns: PronounSets.HE_HIM,
  }),
  Object.freeze({
    id: "woman",
    label: "woman · she/her",
    category: "woman",
    noun: "woman",
    gender: Gender.F,
    pronouns: PronounSets.SHE_HER,
  }),
  Object.freeze({
    id: "person",
    label: "person · they/them",
    category: "person",
    noun: "person",
    gender: Gender.NB,
    pronouns: PronounSets.THEY_THEM,
  }),
]);

const scenarios = Object.values(WG_BUNDLE.scenes)
  .filter(({ system }) => system?.id === ENCOUNTER_PHYSICAL_SYSTEM_ID)
  .map((definition) => ({
    sceneId: definition.id,
    scenarioId: definition.system.config.scenario,
    aggressorAlias: definition.system.config.aggressor,
    definition,
  }))
  .sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));

const attackerPresets = Object.values(ACTOR_PROFILES).flatMap((profile) =>
  identities.map((identity) => ({
    id: `${profile.id}:${identity.id}`,
    label: `${profile.id} · ${identity.label}`,
    profile,
    identity,
  }))
);

const elements = {
  scenarioSelect: document.querySelector("#scenario-select"),
  attackerSelect: document.querySelector("#attacker-select"),
  seedInput: document.querySelector("#seed-input"),
  playerSliders: document.querySelector("#player-sliders"),
  attackerSliders: document.querySelector("#attacker-sliders"),
  startCombat: document.querySelector("#start-combat"),
  resetSetup: document.querySelector("#reset-setup"),
  setupNotice: document.querySelector("#setup-notice"),
  encounterStatus: document.querySelector("#encounter-status"),
  encounterTitle: document.querySelector("#encounter-title"),
  invariantBadge: document.querySelector("#invariant-badge"),
  combatNotice: document.querySelector("#combat-notice"),
  combatScene: document.querySelector("#combat-scene"),
  combatantOverview: document.querySelector("#combatant-overview"),
  stateJson: document.querySelector("#state-json"),
  combatantsJson: document.querySelector("#combatants-json"),
  decisionJson: document.querySelector("#decision-json"),
  availabilityJson: document.querySelector("#availability-json"),
  rollsJson: document.querySelector("#rolls-json"),
  invariantsJson: document.querySelector("#invariants-json"),
  snapshotJson: document.querySelector("#snapshot-json"),
  sceneJson: document.querySelector("#scene-json"),
};

let game = null;
let currentScene = null;
const sliderInputs = { player: new Map(), attacker: new Map() };

function titleCase(value) {
  return String(value).replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setNotice(element, message, { error = false } = {}) {
  element.textContent = message;
  element.dataset.error = String(error);
}

function writeJson(element, value) {
  element.textContent = value === null || value === undefined
    ? "Not available."
    : JSON.stringify(value, null, 2);
}

function selectedScenario() {
  return scenarios.find(({ sceneId }) => sceneId === elements.scenarioSelect.value) || null;
}

function selectedAttacker() {
  return attackerPresets.find(({ id }) => id === elements.attackerSelect.value) || null;
}

function createSlider(container, owner, statName) {
  const label = document.createElement("label");
  label.className = "combat-lab-slider";
  const heading = document.createElement("span");
  heading.className = "combat-lab-slider-heading";
  const name = document.createElement("span");
  name.textContent = titleCase(statName);
  const output = document.createElement("output");
  output.value = String(DEFAULT_STAT);
  heading.append(name, output);

  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "10";
  input.step = "0.5";
  input.value = String(DEFAULT_STAT);
  input.setAttribute("aria-label", `${titleCase(owner)} ${titleCase(statName)}`);
  input.addEventListener("input", () => {
    output.value = Number(input.value).toFixed(1);
    if (game) setNotice(elements.setupNotice, "Setup changed. Restart combat to apply it.");
  });
  label.append(heading, input);
  container.append(label);
  sliderInputs[owner].set(statName, input);
}

function populateSetup() {
  for (const scenario of scenarios) {
    const option = document.createElement("option");
    option.value = scenario.sceneId;
    option.textContent = `${scenario.scenarioId} (${scenario.sceneId})`;
    elements.scenarioSelect.append(option);
  }
  for (const preset of attackerPresets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    elements.attackerSelect.append(option);
  }
  PLAYER_STATS.forEach((name) => createSlider(elements.playerSliders, "player", name));
  ATTACKER_STATS.forEach((name) => createSlider(elements.attackerSliders, "attacker", name));
  elements.startCombat.disabled = scenarios.length === 0 || attackerPresets.length === 0;
  if (!scenarios.length) {
    setNotice(elements.setupNotice, "No authored physical-encounter scenarios were found.", { error: true });
  }
}

function configuredValue(owner, statName) {
  return Number(sliderInputs[owner].get(statName).value);
}

function createConfiguredGame(scenario, preset) {
  const seed = Number(elements.seedInput.value);
  if (!Number.isFinite(seed)) throw new TypeError("Seed must be a finite number.");
  const nextGame = new Game({
    seed,
    startDate: START_DATE,
    playerOptions: { startPlaceId: null, money: 50 },
  });
  for (const statName of PLAYER_STATS) {
    nextGame.player.setSkillValue(statName, configuredValue("player", statName));
  }

  enterWGScene(nextGame, scenario.sceneId, { runOnEnter: false });
  const generated = generateSceneActors(
    nextGame.seed,
    [{ alias: scenario.aggressorAlias, profileId: preset.profile.id }],
    nextGame.currentStory.instanceKey,
  )[scenario.aggressorAlias];
  const profileName = titleCase(preset.profile.id);
  generated.category = preset.identity.category;
  generated.noun = preset.identity.noun;
  generated.gender = preset.identity.gender;
  generated.pronouns = { ...preset.identity.pronouns };
  generated.title = `${profileName} ${preset.identity.category}`;
  generated.name = generated.title;
  for (const statName of ATTACKER_STATS) {
    generated.stats[statName] = configuredValue("attacker", statName);
  }
  nextGame.currentStory.actors[scenario.aggressorAlias] = generated;
  resolveActiveWGStory(nextGame);
  return nextGame;
}

function formatSeconds(choice) {
  const seconds = Math.round((choice.durationMinutes || 0) * 60);
  return seconds ? `${seconds} sec exchange` : "Immediate";
}

function makeChoiceButton(choice) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "combat-lab-choice";
  button.disabled = !choice.enabled;
  const label = document.createElement("span");
  label.textContent = choice.label;
  const detailText = choice.disabledReason
    || choice.warning
    || (choice.showDuration === false ? "" : formatSeconds(choice));
  button.append(label);
  if (detailText) {
    const detail = document.createElement("small");
    detail.textContent = detailText;
    button.append(detail);
  }
  button.addEventListener("click", () => {
    try {
      performChoice(game, { sceneId: currentScene.id, choiceId: choice.id });
      setNotice(elements.combatNotice, "");
      refresh();
    } catch (error) {
      setNotice(elements.combatNotice, error.message, { error: true });
    }
  });
  return button;
}

function appendMetric(list, label, value) {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = String(value);
  list.append(term, description);
}

function renderCombatantCard(actorId, combatant) {
  const card = document.createElement("section");
  card.className = "combatant-card";
  const heading = document.createElement("h3");
  heading.textContent = actorId === "player" ? "Player" : combatant.identity.title;
  const list = document.createElement("dl");
  for (const [name, value] of Object.entries(combatant.stats)) {
    appendMetric(list, titleCase(name), value);
  }
  appendMetric(list, "Pose", combatant.participant.pose);
  appendMetric(list, "Support", combatant.participant.support);
  appendMetric(list, "Exertion", combatant.participant.exertion);
  appendMetric(list, "Pain", combatant.derived.pain);
  appendMetric(list, "Readiness", combatant.derived.physicalReadiness);
  appendMetric(list, "Body performance", combatant.derived.bodyPerformance);
  appendMetric(list, "Balance", combatant.derived.balanceCapacity);
  appendMetric(list, "Movement", combatant.derived.movementCapacity);
  card.append(heading, list);
  return card;
}

function renderDiagnostics(snapshot) {
  elements.combatantOverview.replaceChildren();
  if (!snapshot) {
    for (const element of [
      elements.stateJson,
      elements.combatantsJson,
      elements.decisionJson,
      elements.availabilityJson,
      elements.rollsJson,
      elements.invariantsJson,
      elements.snapshotJson,
    ]) writeJson(element, null);
    elements.invariantBadge.textContent = "Not started";
    delete elements.invariantBadge.dataset.valid;
    return;
  }

  elements.combatantOverview.append(
    renderCombatantCard("player", snapshot.combatants.player),
    renderCombatantCard("mugger", snapshot.combatants.mugger),
  );
  writeJson(elements.stateJson, snapshot.state);
  writeJson(elements.combatantsJson, snapshot.combatants);
  writeJson(elements.decisionJson, snapshot.decision);
  writeJson(elements.availabilityJson, snapshot.availability);
  writeJson(elements.rollsJson, snapshot.rolls);
  writeJson(elements.invariantsJson, snapshot.invariants);
  writeJson(elements.snapshotJson, snapshot);
  elements.invariantBadge.textContent = snapshot.invariants.valid ? "Invariants OK" : "Invariant failure";
  elements.invariantBadge.dataset.valid = String(snapshot.invariants.valid);
}

function renderEncounter() {
  elements.combatScene.replaceChildren();
  if (!game?.currentStory) {
    currentScene = null;
    elements.encounterStatus.textContent = "Encounter finished";
    elements.encounterTitle.textContent = "Start again with the same or adjusted setup";
    writeJson(elements.sceneJson, null);
    renderDiagnostics(null);
    return;
  }

  currentScene = buildScene(game);
  const snapshot = getEncounterDebugSnapshot(game);
  const scenario = selectedScenario();
  elements.encounterStatus.textContent = `${snapshot.state.phase} · exchange ${snapshot.state.exchange}`;
  elements.encounterTitle.textContent = scenario?.scenarioId || currentScene.id;
  renderSceneContent(elements.combatScene, currentScene.content, {
    makeTableAction: makeChoiceButton,
  });
  elements.combatScene.append(
    ...currentScene.sections.map((section) =>
      createChoiceSection(document, section, makeChoiceButton)),
  );
  writeJson(elements.sceneJson, currentScene);
  renderDiagnostics(snapshot);
}

function refresh() {
  try {
    renderEncounter();
  } catch (error) {
    setNotice(elements.combatNotice, error.message, { error: true });
  }
}

function startCombat() {
  try {
    const scenario = selectedScenario();
    const preset = selectedAttacker();
    if (!scenario || !preset) throw new Error("Choose a scenario and attacker.");
    game = createConfiguredGame(scenario, preset);
    setNotice(elements.setupNotice, `Started ${scenario.scenarioId} with ${preset.label}.`);
    setNotice(elements.combatNotice, "");
    refresh();
  } catch (error) {
    setNotice(elements.setupNotice, error.message, { error: true });
  }
}

function resetSetup() {
  for (const inputs of Object.values(sliderInputs)) {
    for (const input of inputs.values()) {
      input.value = String(DEFAULT_STAT);
      input.dispatchEvent(new Event("input"));
    }
  }
  elements.seedInput.value = "117";
  setNotice(elements.setupNotice, game
    ? "Defaults restored. Restart combat to apply them."
    : "Defaults restored.");
}

elements.startCombat.addEventListener("click", startCombat);
elements.resetSetup.addEventListener("click", resetSetup);
elements.scenarioSelect.addEventListener("change", () => {
  if (game) setNotice(elements.setupNotice, "Scenario changed. Restart combat to apply it.");
});
elements.attackerSelect.addEventListener("change", () => {
  if (game) setNotice(elements.setupNotice, "Attacker changed. Restart combat to apply it.");
});
elements.seedInput.addEventListener("input", () => {
  if (game) setNotice(elements.setupNotice, "Seed changed. Restart combat to apply it.");
});

populateSetup();
renderDiagnostics(null);
