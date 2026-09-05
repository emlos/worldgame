import {
  failSave,
  requiredSaveField,
  requireSameSaveValue,
  saveArray,
  saveBoolean,
  saveClockMinutes,
  saveDateMilliseconds,
  saveFiniteNumber,
  saveInteger,
  saveNullableString,
  saveRecord,
  saveString,
  saveUint32,
  saveUniqueStrings,
} from "../shared/util/saveValidation.js";
import { validateRandomStreamsSave } from "../shared/util/random.js";
import { MONTH_DAYS, RANDOM_HOLIDAYS } from "./data/calendar.js";
import { DAY_KEYS } from "./data/time.js";
import {
  getPlaceInstanceTarget,
  PLACE_DISTRIBUTION_KIND,
  PLACE_REGISTRY,
} from "./data/place.js";
import { WeatherType } from "./data/weather.js";
import { Weather } from "./model/weather.js";

const WEATHER_SAVE_VERSION = 2;
const WEATHER_ALGORITHM_VERSION = 1;
const WEATHER_TYPES = new Set(Object.values(WeatherType));

function validateScheduleSave(scheduleData, path) {
  const schedule = saveRecord(scheduleData, path);
  for (const day of DAY_KEYS) {
    saveArray(requiredSaveField(schedule, day, path), `${path}.${day}`).forEach(
      (slotData, index) => {
        const slotPath = `${path}.${day}[${index}]`;
        const slot = saveRecord(slotData, slotPath);
        const from = saveClockMinutes(
          requiredSaveField(slot, "from", slotPath),
          `${slotPath}.from`,
        );
        const to = saveClockMinutes(
          requiredSaveField(slot, "to", slotPath),
          `${slotPath}.to`,
        );
        if (from === to) {
          failSave(slotPath, "must not have identical opening and closing times");
        }
      },
    );
  }
}

export function validateWorldMapSave(data, path = "save.world.map") {
  const map = saveRecord(data, path);
  const locations = new Map();
  const places = new Map();
  const registeredPlaceDefinitions = new Map(
    PLACE_REGISTRY.map((definition) => [String(definition.key), definition]),
  );
  const registeredPlaceCounts = new Map(
    PLACE_REGISTRY.map((definition) => [String(definition.key), 0]),
  );

  saveArray(requiredSaveField(map, "locations", path), `${path}.locations`).forEach(
    (locationData, index) => {
      const locationPath = `${path}.locations[${index}]`;
      const location = saveRecord(locationData, locationPath);
      const id = saveString(
        requiredSaveField(location, "id", locationPath),
        `${locationPath}.id`,
        { nonEmpty: true },
      );
      if (locations.has(id)) failSave(`${locationPath}.id`, `duplicates location '${id}'`);
      saveString(requiredSaveField(location, "name", locationPath), `${locationPath}.name`, {
        nonEmpty: true,
      });
      saveFiniteNumber(requiredSaveField(location, "x", locationPath), `${locationPath}.x`);
      saveFiniteNumber(requiredSaveField(location, "y", locationPath), `${locationPath}.y`);
      saveNullableString(
        requiredSaveField(location, "districtKey", locationPath),
        `${locationPath}.districtKey`,
      );
      saveUniqueStrings(requiredSaveField(location, "tags", locationPath), `${locationPath}.tags`, {
        nonEmpty: true,
      });
      saveRecord(requiredSaveField(location, "meta", locationPath), `${locationPath}.meta`);

      const localPlaces = new Map();
      saveArray(requiredSaveField(location, "places", locationPath), `${locationPath}.places`).forEach(
        (placeData, placeIndex) => {
          const placePath = `${locationPath}.places[${placeIndex}]`;
          const place = saveRecord(placeData, placePath);
          const placeId = saveString(
            requiredSaveField(place, "id", placePath),
            `${placePath}.id`,
            { nonEmpty: true },
          );
          if (places.has(placeId)) {
            failSave(`${placePath}.id`, `duplicates world place '${placeId}'`);
          }
          requireSameSaveValue(
            saveString(
              requiredSaveField(place, "locationId", placePath),
              `${placePath}.locationId`,
              { nonEmpty: true },
            ),
            id,
            `${placePath}.locationId`,
            "its containing location",
          );
          const placeKey = saveString(
            requiredSaveField(place, "key", placePath),
            `${placePath}.key`,
            { nonEmpty: true },
          );
          if (registeredPlaceCounts.has(placeKey)) {
            registeredPlaceCounts.set(placeKey, registeredPlaceCounts.get(placeKey) + 1);
          }
          saveString(requiredSaveField(place, "name", placePath), `${placePath}.name`, {
            nonEmpty: true,
          });
          const unlocked = saveBoolean(
            requiredSaveField(place, "unlocked", placePath),
            `${placePath}.unlocked`,
          );
          if (registeredPlaceDefinitions.get(placeKey)?.unlocked === true && !unlocked) {
            failSave(`${placePath}.unlocked`, "cannot relock a place that starts unlocked");
          }
          const props = saveRecord(requiredSaveField(place, "props", placePath), `${placePath}.props`);
          validateScheduleSave(
            requiredSaveField(props, "openingHours", `${placePath}.props`),
            `${placePath}.props.openingHours`,
          );
          if (Object.prototype.hasOwnProperty.call(props, "category")) {
            saveUniqueStrings(props.category, `${placePath}.props.category`, { nonEmpty: true });
          }
          if (Object.prototype.hasOwnProperty.call(props, "ages")) {
            const ages = saveRecord(props.ages, `${placePath}.props.ages`);
            const min = Object.prototype.hasOwnProperty.call(ages, "min")
              ? saveFiniteNumber(ages.min, `${placePath}.props.ages.min`, { min: 0 })
              : null;
            const max = Object.prototype.hasOwnProperty.call(ages, "max")
              ? saveFiniteNumber(ages.max, `${placePath}.props.ages.max`, { min: 0 })
              : null;
            if (min != null && max != null && min > max) {
              failSave(`${placePath}.props.ages`, "has a minimum age greater than its maximum age");
            }
          }
          localPlaces.set(placeId, place);
          places.set(placeId, { locationId: id, data: place, path: placePath });
        },
      );
      locations.set(id, { data: location, path: locationPath, places: localPlaces });
    },
  );

  if (locations.size === 0) failSave(`${path}.locations`, "must contain at least one location");
  for (const definition of PLACE_REGISTRY) {
    const placeKey = String(definition.key);
    const count = registeredPlaceCounts.get(placeKey) || 0;
    const expected = getPlaceInstanceTarget(definition, locations.size);
    if (count !== expected) {
      failSave(
        `${path}.locations`,
        `must contain ${expected} registered place instance(s) with key '${placeKey}' (found ${count})`,
      );
    }
  }

  const adjacency = new Map([...locations.keys()].map((id) => [id, new Map()]));
  const edgePairs = new Set();
  saveArray(requiredSaveField(map, "edges", path), `${path}.edges`).forEach((edgeData, index) => {
    const edgePath = `${path}.edges[${index}]`;
    const edge = saveRecord(edgeData, edgePath);
    const a = saveString(requiredSaveField(edge, "a", edgePath), `${edgePath}.a`, {
      nonEmpty: true,
    });
    const b = saveString(requiredSaveField(edge, "b", edgePath), `${edgePath}.b`, {
      nonEmpty: true,
    });
    if (!locations.has(a)) failSave(`${edgePath}.a`, `references unknown location '${a}'`);
    if (!locations.has(b)) failSave(`${edgePath}.b`, `references unknown location '${b}'`);
    if (a === b) failSave(edgePath, "must connect two different locations");
    const pair = [a, b].sort().join("\u0000");
    if (edgePairs.has(pair)) failSave(edgePath, `duplicates edge '${a}' <-> '${b}'`);
    edgePairs.add(pair);
    const minutes = saveFiniteNumber(
      requiredSaveField(edge, "minutes", edgePath),
      `${edgePath}.minutes`,
      { min: 1, max: 5 },
    );
    saveString(requiredSaveField(edge, "streetName", edgePath), `${edgePath}.streetName`, {
      nonEmpty: true,
    });
    adjacency.get(a).set(b, minutes);
    adjacency.get(b).set(a, minutes);
  });

  const firstLocation = locations.keys().next().value;
  const reached = new Set([firstLocation]);
  const queue = [firstLocation];
  while (queue.length) {
    const current = queue.shift();
    for (const neighbor of adjacency.get(current).keys()) {
      if (reached.has(neighbor)) continue;
      reached.add(neighbor);
      queue.push(neighbor);
    }
  }
  if (reached.size !== locations.size) {
    failSave(`${path}.edges`, "must connect every location in one graph");
  }

  for (const definition of PLACE_REGISTRY) {
    if (definition.distribution?.kind !== PLACE_DISTRIBUTION_KIND.graphCoverage) continue;
    const maximumDistance = Number(definition.distribution.maxGraphDistance);
    if (!Number.isFinite(maximumDistance)) continue;

    const targetLocations = new Set(
      [...locations]
        .filter(([, location]) =>
          [...location.places.values()].some(
            (place) => String(place.key) === String(definition.key),
          ),
        )
        .map(([locationId]) => locationId),
    );
    for (const locationId of locations.keys()) {
      const coverageQueue = [[locationId, 0]];
      const coverageSeen = new Set([locationId]);
      let covered = false;
      while (coverageQueue.length) {
        const [currentId, distance] = coverageQueue.shift();
        if (targetLocations.has(currentId)) {
          covered = distance <= maximumDistance;
          break;
        }
        if (distance >= maximumDistance) continue;
        for (const neighborId of adjacency.get(currentId).keys()) {
          if (coverageSeen.has(neighborId)) continue;
          coverageSeen.add(neighborId);
          coverageQueue.push([neighborId, distance + 1]);
        }
      }
      if (!covered) {
        failSave(
          `${path}.locations`,
          `must place '${definition.key}' within ${maximumDistance} graph hop(s) of every location`,
        );
      }
    }
  }

  const index = { locations, places, adjacency };
  index.placeAt = (locationId, placeId, placePath) =>
    savedPlaceAt(index, locationId, placeId, placePath);
  return index;
}

function validateCalendarSave(data, path, worldYear) {
  const calendar = saveRecord(data, path);
  const year = saveInteger(requiredSaveField(calendar, "year", path), `${path}.year`, {
    min: 1,
    max: 9999,
  });
  requireSameSaveValue(year, worldYear, `${path}.year`, "the world clock year");

  const expectedNames = new Set(RANDOM_HOLIDAYS.map((definition) => definition.name));
  const seenNames = new Set();
  const seenDates = new Set();
  saveArray(
    requiredSaveField(calendar, "randomHolidayAssignments", path),
    `${path}.randomHolidayAssignments`,
  ).forEach((entry, index) => {
    const entryPath = `${path}.randomHolidayAssignments[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 2) {
      failSave(entryPath, "must be a [name, date] pair");
    }
    const name = saveString(entry[0], `${entryPath}[0]`, { nonEmpty: true });
    if (!expectedNames.has(name)) failSave(`${entryPath}[0]`, "is not a registered random holiday");
    if (seenNames.has(name)) failSave(`${entryPath}[0]`, `duplicates holiday '${name}'`);
    seenNames.add(name);
    const assignment = saveRecord(entry[1], `${entryPath}[1]`);
    const month = saveInteger(
      requiredSaveField(assignment, "month", `${entryPath}[1]`),
      `${entryPath}[1].month`,
      { min: 1, max: 12 },
    );
    const day = saveInteger(
      requiredSaveField(assignment, "day", `${entryPath}[1]`),
      `${entryPath}[1].day`,
      { min: 1, max: MONTH_DAYS[month - 1] },
    );
    const dateKey = `${month}-${day}`;
    if (seenDates.has(dateKey)) {
      failSave(`${entryPath}[1]`, `duplicates random holiday date '${dateKey}'`);
    }
    seenDates.add(dateKey);
  });
  if (seenNames.size !== expectedNames.size) {
    failSave(
      `${path}.randomHolidayAssignments`,
      "must assign every registered random holiday exactly once",
    );
  }
}

function validateWeatherSave(data, path, expectedSeed, worldTime) {
  const weather = saveRecord(data, path);
  requireSameSaveValue(
    saveInteger(requiredSaveField(weather, "version", path), `${path}.version`),
    WEATHER_SAVE_VERSION,
    `${path}.version`,
    "the current weather save version",
  );
  requireSameSaveValue(
    saveInteger(
      requiredSaveField(weather, "algorithmVersion", path),
      `${path}.algorithmVersion`,
    ),
    WEATHER_ALGORITHM_VERSION,
    `${path}.algorithmVersion`,
    "the current weather algorithm version",
  );
  requireSameSaveValue(
    saveUint32(requiredSaveField(weather, "seed", path), `${path}.seed`),
    expectedSeed,
    `${path}.seed`,
    "the world seed",
  );

  const validateSnapshot = (snapshotData, snapshotPath) => {
    const snapshot = saveRecord(snapshotData, snapshotPath);
    const date = saveDateMilliseconds(
      requiredSaveField(snapshot, "date", snapshotPath),
      `${snapshotPath}.date`,
    );
    const kind = saveString(
      requiredSaveField(snapshot, "kind", snapshotPath),
      `${snapshotPath}.kind`,
      { nonEmpty: true },
    );
    if (!WEATHER_TYPES.has(kind)) {
      failSave(`${snapshotPath}.kind`, `has unknown weather kind '${kind}'`);
    }
    const runHours = saveInteger(
      requiredSaveField(snapshot, "runHours", snapshotPath),
      `${snapshotPath}.runHours`,
      { min: 0 },
    );
    return { date, kind, runHours };
  };

  const origin = validateSnapshot(requiredSaveField(weather, "origin", path), `${path}.origin`);
  const current = validateSnapshot(requiredSaveField(weather, "current", path), `${path}.current`);
  if (origin.date > current.date) failSave(`${path}.current.date`, "precedes the weather origin");
  requireSameSaveValue(current.date, worldTime, `${path}.current.date`, "the world clock");
  requireSameSaveValue(
    saveDateMilliseconds(requiredSaveField(weather, "date", path), `${path}.date`),
    current.date,
    `${path}.date`,
    "the current weather date",
  );
  requireSameSaveValue(
    saveString(requiredSaveField(weather, "state", path), `${path}.state`),
    current.kind,
    `${path}.state`,
    "the current weather kind",
  );
  requireSameSaveValue(
    saveInteger(requiredSaveField(weather, "runHours", path), `${path}.runHours`, { min: 0 }),
    current.runHours,
    `${path}.runHours`,
    "the current weather run length",
  );
}

export function savedPlaceAt(mapIndex, locationId, placeId, path) {
  const location = mapIndex.locations.get(locationId);
  if (!location) failSave(path, `references unknown location '${locationId}'`);
  if (placeId == null) return null;
  const place = location.places.get(placeId);
  if (!place) {
    failSave(path, `references unknown place '${placeId}' in location '${locationId}'`);
  }
  return place;
}

export function validateWorldSave(
  data,
  { path = "save.world", expectedSeed, expectedTime },
) {
  const world = saveRecord(data, path);
  validateRandomStreamsSave(requiredSaveField(world, "random", path), {
    path: `${path}.random`,
    expectedSeed,
    requiredStreams: ["runtime", "calendar", "map"],
  });
  const worldTimeData = saveRecord(requiredSaveField(world, "time", path), `${path}.time`);
  const worldTime = saveDateMilliseconds(
    requiredSaveField(worldTimeData, "date", `${path}.time`),
    `${path}.time.date`,
  );
  requireSameSaveValue(worldTime, expectedTime, `${path}.time.date`, "the game clock");
  validateCalendarSave(
    requiredSaveField(world, "calendar", path),
    `${path}.calendar`,
    new Date(worldTime).getUTCFullYear(),
  );
  const weatherData = requiredSaveField(world, "weather", path);
  validateWeatherSave(weatherData, `${path}.weather`, expectedSeed, worldTime);
  const savedTemperature = saveFiniteNumber(
    requiredSaveField(world, "temperatureC", path),
    `${path}.temperatureC`,
  );
  const restoredWeather = Weather.fromJSON(weatherData, { seed: expectedSeed });
  const expectedTemperature = restoredWeather.computeTemperature(
    new Date(worldTime),
    restoredWeather.kind,
  );
  requireSameSaveValue(
    savedTemperature,
    expectedTemperature,
    `${path}.temperatureC`,
    "the deterministic temperature for the saved weather and clock",
  );
  const moon = saveRecord(requiredSaveField(world, "moon", path), `${path}.moon`);
  requireSameSaveValue(
    saveDateMilliseconds(requiredSaveField(moon, "date", `${path}.moon`), `${path}.moon.date`),
    worldTime,
    `${path}.moon.date`,
    "the world clock",
  );
  const mapIndex = validateWorldMapSave(requiredSaveField(world, "map", path), `${path}.map`);
  return { world, worldTime, mapIndex };
}
