import { parseTimeToMinutes } from "../../shared/util/date.js";
import { BUS_SERVICE, BUS_STOP_KEY } from "./config.js";

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 24 * 60;

function requireDate(value, label = "Bus schedule date") {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`${label} must be a valid date`);
  }
  return date;
}

function requireFiniteNumber(value, label, { min = -Infinity, exclusiveMin = false } = {}) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    (exclusiveMin ? number <= min : number < min)
  ) {
    const comparison = exclusiveMin ? "greater than" : "at least";
    throw new TypeError(`${label} must be ${comparison} ${min}`);
  }
  return number;
}

function utcDayStart(date, dayOffset = 0) {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + dayOffset,
  );
}

export function getBusSchedulePeriods(place) {
  if (place?.key !== BUS_STOP_KEY) {
    throw new TypeError("Bus schedule access requires a bus stop");
  }
  return BUS_SERVICE.periods.map((period, index) => {
    const path = `Bus schedule period ${index + 1}`;
    const from = String(period?.from ?? "");
    const to = String(period?.to ?? "");
    const fromMinutes = parseTimeToMinutes(from);
    let toMinutes = parseTimeToMinutes(to);
    if (fromMinutes == null || toMinutes == null) {
      throw new TypeError(`${path} requires from and to times`);
    }
    if (toMinutes <= fromMinutes) toMinutes += MINUTES_PER_DAY;
    const everyMinutes = requireFiniteNumber(
      period?.everyMinutes,
      `${path} frequency`,
      { min: 0, exclusiveMin: true },
    );
    if (!Number.isInteger(everyMinutes)) {
      throw new TypeError(`${path} frequency must be a whole number of minutes`);
    }
    const label = String(period?.label || `period ${index + 1}`);
    return { label, from, to, fromMinutes, toMinutes, everyMinutes };
  });
}

/** Return upcoming shared bus departures, including one happening right now. */
export function getUpcomingBusDepartures(place, at, { count = 1 } = {}) {
  const date = requireDate(at);
  if (!Number.isInteger(count) || count <= 0) {
    throw new TypeError("Bus departure count must be a positive integer");
  }

  const periods = getBusSchedulePeriods(place);
  const candidates = new Map();
  const finalDayOffset = Math.max(2, count + 1);
  for (let dayOffset = -1; dayOffset <= finalDayOffset; dayOffset += 1) {
    const dayStart = utcDayStart(date, dayOffset);
    for (const period of periods) {
      for (
        let minute = period.fromMinutes;
        minute < period.toMinutes;
        minute += period.everyMinutes
      ) {
        const timestamp = dayStart + minute * MS_PER_MINUTE;
        if (timestamp < date.getTime()) continue;
        if (!candidates.has(timestamp)) {
          candidates.set(timestamp, {
            at: new Date(timestamp),
            periodLabel: period.label,
          });
        }
      }
    }
  }

  const departures = [...candidates.values()]
    .sort((left, right) => left.at - right.at)
    .slice(0, count)
    .map((departure) => ({
      ...departure,
      waitMinutes: (departure.at.getTime() - date.getTime()) / MS_PER_MINUTE,
    }));
  if (departures.length < count) {
    throw new Error("Bus schedule did not produce enough upcoming departures");
  }
  return departures;
}

export function getNextBusDeparture(place, at) {
  return getUpcomingBusDepartures(place, at, { count: 1 })[0];
}

export function getCurrentBusStop(game) {
  const place = game?.currentPlace;
  return place?.key === BUS_STOP_KEY ? place : null;
}

export function getBusFare(place) {
  if (place?.key !== BUS_STOP_KEY) {
    throw new TypeError("Bus fare access requires a bus stop");
  }
  return requireFiniteNumber(BUS_SERVICE.fare, "Bus fare", { min: 0 });
}

export function getBusTravelTimeMultiplier(place) {
  if (place?.key !== BUS_STOP_KEY) {
    throw new TypeError("Bus travel-time access requires a bus stop");
  }
  return requireFiniteNumber(
    BUS_SERVICE.travelTimeMultiplier,
    "Bus travel-time multiplier",
    { min: 0, exclusiveMin: true },
  );
}

export function listBusStops(game) {
  if (!game?.world?.locations) {
    throw new TypeError("Listing bus stops requires a generated game world");
  }
  const stops = [];
  for (const location of game.world.locations.values()) {
    for (const place of location.places || []) {
      if (place?.unlocked === true && place.key === BUS_STOP_KEY) {
        stops.push({ place, location });
      }
    }
  }
  return stops;
}

export function listBusTravelOptions(game, sourcePlace = getCurrentBusStop(game)) {
  if (!sourcePlace || sourcePlace.key !== BUS_STOP_KEY) {
    throw new TypeError("Bus travel requires the player to be at a bus stop");
  }
  const multiplier = getBusTravelTimeMultiplier(sourcePlace);
  const options = [];

  for (const destination of listBusStops(game)) {
    if (String(destination.place.id) === String(sourcePlace.id)) continue;
    const walking = game.world.map.getTravelTotal(
      sourcePlace.locationId,
      destination.location.id,
    );
    if (!walking) continue;
    options.push({
      ...destination,
      walkingMinutes: walking.minutes,
      travelMinutes: Math.max(1, Math.ceil(walking.minutes * multiplier)),
    });
  }

  return options.sort(
    (left, right) =>
      left.travelMinutes - right.travelMinutes ||
      left.location.name.localeCompare(right.location.name) ||
      left.place.name.localeCompare(right.place.name) ||
      String(left.place.id).localeCompare(String(right.place.id)),
  );
}

export function resolveBusTravelOption(game, targetPlaceId) {
  const id = String(targetPlaceId ?? "");
  if (!id) return null;
  return listBusTravelOptions(game).find(
    (option) => String(option.place.id) === id,
  ) ?? null;
}
