import { createChoice } from "../../game/scene/choiceContract.js";
import {
  BUS_BOARDING_SCENE_ID,
  BUS_STOP_KEY,
  BUS_TIMETABLE_SCENE_ID,
} from "./config.js";
import {
  getBusFare,
  getBusSchedulePeriods,
  getCurrentBusStop,
  getNextBusDeparture,
  getUpcomingBusDepartures,
  listBusTravelOptions,
} from "./transit.js";

export const BUS_ACTION_TYPE = Object.freeze({ travel: "bus.travel" });

function formatBusFare(fare) {
  return `£${fare.toFixed(2)}`;
}

function formatClockTime(date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function paragraph(text) {
  return { type: "paragraph", text };
}

function decorateBusStopHub({ game, scene }) {
  const place = getCurrentBusStop(game);
  if (!place) throw new Error("Bus-stop hub requires the player to be at a bus stop");

  const fare = getBusFare(place);
  const nextDeparture = getNextBusDeparture(place, game.now);
  const canAfford = game.player.money >= fare;
  let foundWaitChoice = false;
  const sections = scene.sections.map((section) => ({
    ...section,
    choices: section.choices.map((choice) => {
      if (choice.id !== "wait") return choice;
      foundWaitChoice = true;
      return createChoice({
        ...choice,
        durationMinutes: nextDeparture.waitMinutes,
        enabled: choice.enabled && canAfford,
        disabledReason: !choice.enabled
          ? choice.disabledReason
          : canAfford
            ? null
            : `You need ${formatBusFare(fare)} for a bus ticket.`,
      });
    }),
  }));
  if (!foundWaitChoice) throw new Error("Authored bus-stop hub requires a 'wait' choice");

  return {
    ...scene,
    content: [...scene.content, paragraph(`A single bus ticket costs ${formatBusFare(fare)}.`)],
    sections,
  };
}

function decorateBusTimetable({ game, scene }) {
  const place = getCurrentBusStop(game);
  if (!place) throw new Error("Bus timetable requires the player to be at a bus stop");
  const periods = getBusSchedulePeriods(place).map(
    (period) => paragraph(
      `${capitalize(period.label)} service runs ${period.from}–${period.to}, ` +
      `with a bus every ${period.everyMinutes} minutes.`,
    ),
  );
  const departures = getUpcomingBusDepartures(place, game.now, { count: 4 })
    .map((entry) => formatClockTime(entry.at))
    .join(", ");
  return {
    ...scene,
    content: [...scene.content, ...periods, paragraph(`The next departures are ${departures}.`)],
  };
}

function decorateBusBoarding({ game, scene }) {
  const place = getCurrentBusStop(game);
  if (!place) throw new Error("Bus boarding requires the player to be at a bus stop");
  const fare = getBusFare(place);
  const canAfford = game.player.money >= fare;
  const destinations = listBusTravelOptions(game, place).map((destination) => createChoice({
    id: `bus-travel:${destination.place.id}`,
    icon: destination.place.props?.icon || "🚌",
    label: `${destination.location.name} — ${destination.place.name}`,
    durationMinutes: destination.travelMinutes,
    costs: [{ type: "money", amount: fare, label: formatBusFare(fare), currency: "GBP" }],
    enabled: canAfford,
    disabledReason: canAfford ? null : `You need ${formatBusFare(fare)} for a bus ticket.`,
    action: {
      type: BUS_ACTION_TYPE.travel,
      targetPlaceId: String(destination.place.id),
    },
  }));
  const sections = scene.sections.length
    ? scene.sections.map((section, index) =>
        index === 0 ? { ...section, choices: [...destinations, ...section.choices] } : section)
    : [{ id: "choices", heading: "Destinations", choices: destinations }];
  return { ...scene, sections };
}

export const BUS_SCENE_DECORATORS = Object.freeze([
  Object.freeze({
    id: "stop-hub",
    applies: ({ game, scene }) => scene.kind === "place" && game.currentPlace?.key === BUS_STOP_KEY,
    decorate: decorateBusStopHub,
  }),
  Object.freeze({
    id: "timetable",
    applies: ({ definition }) => definition?.id === BUS_TIMETABLE_SCENE_ID,
    decorate: decorateBusTimetable,
  }),
  Object.freeze({
    id: "boarding",
    applies: ({ definition }) => definition?.id === BUS_BOARDING_SCENE_ID,
    decorate: decorateBusBoarding,
  }),
]);
