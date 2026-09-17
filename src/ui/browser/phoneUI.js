import { searchNavigationDestinations } from "../../game/navigation.js";
import {
  buildPhoneGpsView,
  buildPhonePlayerStatsView,
  buildPhoneRelationshipsView,
  buildPhoneRemindersView,
} from "../../game/scene/phoneView.js";
import { STATS } from "../../characters/player/stats.js";
import { createPhoneChats } from "./phoneChats.js";
import { MENU_HOTKEYS } from "./keyboard.js";
import {
  OUTCOME,
  outcomeForRange,
  outcomeForRelationship,
  setOutcomeText,
} from "./outcomes.js";
import {
  diaryDateFormatter,
  formatDuration,
  formatPainValue,
  formatStatValue,
  moneyFormatter,
} from "./formatters.js";

function formatRelationshipScore(score) {
  const value = Number(score);
  return Number.isFinite(value) ? String(Math.round(value)) : "0";
}

function formatPhoneLabel(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function meterPercentage(value, min, max) {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min))) * 100;
}

function overviewValue(value) {
  return value || "Not set";
}

export function createPhoneUI({
  getGame,
  onGameChange,
  setNotice,
  isMenuActionAvailable,
}) {
  const dialog = document.querySelector("#player-phone-dialog");
  const heading = document.querySelector("#player-phone-dialog-heading");
  const date = document.querySelector("#player-phone-date");
  const backButton = document.querySelector("#phone-back");
  const closeButton = document.querySelector("#close-phone");
  const homeScreen = document.querySelector("#phone-home-screen");
  const remindersButton = document.querySelector("#phone-reminders-btn");
  const remindersScreen = document.querySelector("#phone-reminders-screen");
  const remindersContent = document.querySelector("#phone-reminders-content");
  const relationshipsButton = document.querySelector("#phone-relationships-btn");
  const relationshipsScreen = document.querySelector(
    "#phone-relationships-screen",
  );
  const relationshipsList = document.querySelector("#phone-relationships-list");
  const gpsButton = document.querySelector("#phone-gps-btn");
  const gpsScreen = document.querySelector("#phone-gps-screen");
  const gpsSearch = document.querySelector("#phone-gps-search");
  const gpsStatus = document.querySelector("#phone-gps-status");
  const gpsStopButton = document.querySelector("#phone-gps-stop");
  const gpsDestinations = document.querySelector("#phone-gps-destinations");
  const statsButton = document.querySelector("#phone-stats-btn");
  const statsScreen = document.querySelector("#phone-stats-screen");
  const statsContent = document.querySelector("#phone-stats-content");
  const settingsButton = document.querySelector("#phone-settings-btn");
  const settingsScreen = document.querySelector("#phone-settings-screen");
  const hotkeysContent = document.querySelector("#phone-hotkeys-content");
  const chatsButton = document.querySelector("#phone-chats-btn");
  const chatsScreen = document.querySelector("#phone-chats-screen");
  const chatThreadScreen = document.querySelector("#phone-chat-thread-screen");
  const playerPhoneButton = document.querySelector("#player-phone-btn");

  const screens = [
    chatsScreen,
    chatThreadScreen,
    homeScreen,
    remindersScreen,
    relationshipsScreen,
    gpsScreen,
    statsScreen,
    settingsScreen,
  ];

  let chatsUI;

  function makeRelationshipEntry(entry) {
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

  function makeStatsSection(title) {
    const section = document.createElement("section");
    section.className = "phone-stats-section";
    const sectionHeading = document.createElement("h3");
    sectionHeading.textContent = title;
    section.append(sectionHeading);
    return section;
  }

  function makeValueList(entries) {
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

  function makeMeterEntry(entry, kind) {
    const item = document.createElement("article");
    item.className = "phone-meter-entry";
    item.dataset.valueId = entry.id;
    item.dataset.kind = kind;
    item.dataset.outcome = outcomeForRange(entry.value, entry.min, entry.max, {
      lowerIsBetter: kind === "stat" && STATS[entry.id]?.higherIsBetter === false,
    });

    const header = document.createElement("div");
    header.className = "phone-meter-header";
    const label = document.createElement("h4");
    label.textContent = entry.label;
    const value = document.createElement("output");
    value.textContent =
      entry.valueLabel ??
      (Number.isInteger(entry.rank)
        ? `Rank ${entry.rank} · ${formatStatValue(entry.value)} / ${formatStatValue(entry.max)}`
        : kind === "skill"
          ? `${formatStatValue(entry.value)} / ${formatStatValue(entry.max)}`
          : formatStatValue(entry.value));
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
    const fraction = part.maxIntegrity ? part.integrity / part.maxIntegrity : 0;
    const integrityOutcome = outcomeForRange(fraction, 0, 1);
    if (
      (part.pain > 0 || part.conditions.length) &&
      [OUTCOME.VERY_GOOD, OUTCOME.OK].includes(integrityOutcome)
    ) {
      return OUTCOME.WARNING;
    }
    return integrityOutcome;
  }

  function makeBodyPart(part) {
    const item = document.createElement("article");
    item.className = "phone-body-part";
    item.dataset.partId = part.id;
    item.dataset.outcome = bodyPartOutcome(part);
    const header = document.createElement("div");
    header.className = "phone-body-part-header";
    const label = document.createElement("h4");
    label.textContent = part.label;
    const value = document.createElement("output");
    value.textContent = `${formatStatValue(part.integrity)} / ${formatStatValue(part.maxIntegrity)}`;
    value.setAttribute("aria-label", `${part.label} integrity`);
    header.append(label, value);
    const meter = document.createElement("div");
    meter.className = "phone-meter phone-body-part-meter";
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", `${part.label} integrity`);
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", String(part.maxIntegrity));
    meter.setAttribute("aria-valuenow", String(part.integrity));
    const fill = document.createElement("span");
    fill.className = "phone-meter-fill";
    fill.style.width = `${meterPercentage(part.integrity, 0, part.maxIntegrity)}%`;
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
    ]
      .filter(Boolean)
      .join(" | ");
    item.append(header, meter, detail);
    return item;
  }

  function renderStats() {
    const view = buildPhonePlayerStatsView(getGame());
    const { overview } = view;
    const overviewSection = makeStatsSection("Overview");
    overviewSection.append(
      makeValueList([
        { label: "Money", value: moneyFormatter.format(overview.money) },
        { label: "Temperature", value: formatPhoneLabel(overview.temperature) },
      ]),
    );
    const identitySection = makeStatsSection("Identity");
    identitySection.append(
      makeValueList([
        { label: "Age", value: overview.age },
        { label: "Gender", value: formatPhoneLabel(overview.gender) },
        {
          label: "Perceived gender",
          value: formatPhoneLabel(overview.perceivedGender),
        },
      ]),
    );
    const statsSection = makeStatsSection("Stats");
    statsSection.append(...view.stats.map((entry) => makeMeterEntry(entry, "stat")));
    const skillsSection = makeStatsSection("Skills");
    skillsSection.classList.add("phone-skills-section");
    skillsSection.append(
      ...view.skills.map((entry) => makeMeterEntry(entry, "skill")),
    );
    const featureSections = view.featureSections.map((featureSection) => {
      const section = makeStatsSection(featureSection.label);
      section.append(
        ...featureSection.entries.map((entry) =>
          makeMeterEntry(entry, entry.kind || featureSection.id),
        ),
      );
      return section;
    });
    const bodySection = makeStatsSection("Body status");
    const bodyStatusEntries = [
      { label: "Condition", value: view.body.conditionLabel },
      {
        label: "Physical performance",
        value: `${Math.round(view.body.performanceMultiplier * 100)}%`,
      },
      { label: "Incapacitated", value: view.body.incapacitated ? "Yes" : "No" },
    ];
    if (view.body.pain > 0) {
      bodyStatusEntries.splice(
        1,
        0,
        {
          label: "Pain description",
          value: formatPhoneLabel(view.body.painLabel),
        },
        { label: "Pain", value: `${formatPainValue(view.body.pain)} / 100` },
        { label: "Pain stage", value: `${view.body.painStage} / 3` },
      );
    }
    bodySection.append(makeValueList(bodyStatusEntries));
    const bodyPartsSection = makeStatsSection("Body parts");
    bodyPartsSection.append(...view.body.parts.map(makeBodyPart));
    const appearanceSection = makeStatsSection("Appearance");
    appearanceSection.append(
      makeValueList([
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
    const clothingSection = makeStatsSection("Clothing");
    clothingSection.append(
      makeValueList(
        view.clothing.map(({ slot, item }) => ({
          label: formatPhoneLabel(slot),
          value: item
            ? `${formatPhoneLabel(item.id)} | ${Math.round(item.durability * 100)}% durability | ${Math.round(item.wetness * 100)}% wet`
            : "Not equipped",
          color: item?.color,
        })),
      ),
    );
    statsContent.replaceChildren(
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

  function makeGpsDestination(entry) {
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
        getGame().setGpsTarget(entry.placeId);
        setNotice("");
      } catch (error) {
        setNotice(error.message, true);
      }
      renderGps();
      onGameChange();
    });
    item.append(button);
    return item;
  }

  function renderGps() {
    const view = buildPhoneGpsView(getGame());
    const destinations = searchNavigationDestinations(
      view.destinations,
      gpsSearch.value,
    );
    if (view.activeRoute) {
      gpsStatus.textContent =
        `Navigating to ${view.activeRoute.destination.name} in ` +
        `${view.activeRoute.destination.districtName} | ` +
        `${formatDuration(view.activeRoute.totalMinutes)} remaining`;
      gpsStopButton.hidden = false;
    } else {
      gpsStatus.textContent = "No active route.";
      gpsStopButton.hidden = true;
    }
    if (destinations.length) {
      gpsDestinations.replaceChildren(...destinations.map(makeGpsDestination));
    } else {
      const empty = document.createElement("li");
      empty.className = "phone-gps-empty";
      empty.textContent = "No destinations match your search.";
      gpsDestinations.replaceChildren(empty);
    }
  }

  function showOnlyScreen(screen) {
    if (screen !== chatThreadScreen) chatsUI?.leaveThread();
    backButton.setAttribute(
      "aria-label",
      screen === chatThreadScreen ? "Back to chats" : "Back to phone menu",
    );
    for (const candidate of screens) candidate.hidden = candidate !== screen;
  }

  function showHome() {
    const previousScreen = screens.find((screen) => !screen.hidden);
    heading.textContent = "Phone";
    backButton.hidden = true;
    showOnlyScreen(homeScreen);
    if (dialog.open) {
      const homeButton = new Map([
        [relationshipsScreen, relationshipsButton],
        [chatsScreen, chatsButton],
        [chatThreadScreen, chatsButton],
        [remindersScreen, remindersButton],
        [gpsScreen, gpsButton],
        [statsScreen, statsButton],
        [settingsScreen, settingsButton],
      ]).get(previousScreen);
      (homeButton || relationshipsButton).focus();
    }
  }

  function showRelationships() {
    heading.textContent = "Relationships";
    backButton.hidden = false;
    showOnlyScreen(relationshipsScreen);
    const relationships = buildPhoneRelationshipsView(getGame());
    if (relationships.length) {
      relationshipsList.replaceChildren(...relationships.map(makeRelationshipEntry));
    } else {
      const empty = document.createElement("li");
      empty.className = "phone-relationships-empty";
      empty.textContent = "You haven't met anyone yet.";
      relationshipsList.replaceChildren(empty);
    }
    relationshipsScreen.scrollTop = 0;
    relationshipsScreen.focus();
  }

  function showReminders() {
    heading.textContent = "Reminders";
    backButton.hidden = false;
    showOnlyScreen(remindersScreen);
    const view = buildPhoneRemindersView(getGame());
    const groups = view.groups.map((group) => {
      const section = document.createElement("section");
      section.className = "phone-reminder-group";
      const sectionHeading = document.createElement("h3");
      sectionHeading.textContent = group.label;
      const list = document.createElement("ul");
      list.className = "phone-reminder-list";
      for (const reminder of group.items) {
        const item = document.createElement("li");
        item.className = "phone-reminder-item";
        item.dataset.tone = reminder.tone;
        setOutcomeText(item, reminder.text);
        list.append(item);
      }
      section.append(sectionHeading, list);
      return section;
    });
    if (view.count === 0) {
      const empty = document.createElement("p");
      empty.className = "phone-reminders-empty";
      empty.textContent = "No active reminders.";
      groups.push(empty);
    }
    remindersContent.replaceChildren(...groups);
    remindersScreen.scrollTop = 0;
    remindersScreen.focus();
  }

  function showGps() {
    heading.textContent = "GPS";
    backButton.hidden = false;
    showOnlyScreen(gpsScreen);
    gpsSearch.value = "";
    renderGps();
    gpsScreen.scrollTop = 0;
    gpsSearch.focus();
  }

  function showStats() {
    heading.textContent = "Player stats";
    backButton.hidden = false;
    showOnlyScreen(statsScreen);
    renderStats();
    statsScreen.scrollTop = 0;
    statsScreen.focus();
  }

  function renderHotkeys() {
    const sections = new Map();
    for (const hotkey of MENU_HOTKEYS) {
      if (!isMenuActionAvailable(hotkey.id)) continue;
      if (!sections.has(hotkey.group)) {
        const section = document.createElement("section");
        section.className = "phone-hotkey-section";
        const sectionHeading = document.createElement("h4");
        sectionHeading.textContent = hotkey.group;
        const list = document.createElement("dl");
        list.className = "phone-hotkey-list";
        section.append(sectionHeading, list);
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
    hotkeysContent.replaceChildren(
      ...[...sections.values()].map(({ section }) => section),
    );
  }

  function showSettings() {
    heading.textContent = "Settings";
    backButton.hidden = false;
    showOnlyScreen(settingsScreen);
    renderHotkeys();
    settingsScreen.scrollTop = 0;
    settingsScreen.focus();
  }

  const appScreens = {
    home: showHome,
    relationships: showRelationships,
    reminders: showReminders,
    gps: showGps,
    stats: showStats,
    settings: showSettings,
    chats: () => chatsUI.openList(),
  };

  function open(app = "home") {
    date.textContent = diaryDateFormatter.format(getGame().now);
    if (!dialog.open) dialog.showModal();
    const show = appScreens[app];
    if (!show) throw new Error(`Unknown phone screen '${app}'`);
    show();
  }

  function back() {
    if (!chatsUI.back()) showHome();
  }

  chatsUI = createPhoneChats({
    getGame,
    onChange: onGameChange,
    openScreen: (screen, screenHeading) => {
      heading.textContent = screenHeading;
      backButton.hidden = false;
      showOnlyScreen(screen);
    },
  });

  playerPhoneButton.addEventListener("click", () => open());
  relationshipsButton.addEventListener("click", showRelationships);
  gpsButton.addEventListener("click", showGps);
  remindersButton.addEventListener("click", showReminders);
  gpsSearch.addEventListener("input", renderGps);
  gpsStopButton.addEventListener("click", () => {
    getGame().clearGpsTarget();
    setNotice("");
    renderGps();
    onGameChange();
  });
  statsButton.addEventListener("click", showStats);
  settingsButton.addEventListener("click", showSettings);
  chatsButton.addEventListener("click", () => chatsUI.openList());
  backButton.addEventListener("click", back);
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  return {
    dialog,
    buttons: {
      phone: playerPhoneButton,
      relationships: relationshipsButton,
      chats: chatsButton,
      gps: gpsButton,
      stats: statsButton,
      settings: settingsButton,
    },
    open,
    toggle() {
      if (dialog.open) dialog.close();
      else open();
    },
    back,
    isHome() {
      return !homeScreen.hidden;
    },
    refresh() {
      chatsUI.refresh();
    },
    reset() {
      chatsUI.leaveThread();
      if (dialog.open) open("home");
    },
  };
}
