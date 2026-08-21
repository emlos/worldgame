import { Moon } from "./util/moon.js";
import { WorldTime } from "./util/time.js";
import { Calendar } from "./util/calendar.js";
import { Weather } from "./util/weather.js";
import { WorldMap } from "./util/worldmap.js";
import { RandomStreams, rollSeed } from "../../shared/util/random.js";
// --------------------------
// World
// --------------------------

export class World {
    constructor({
        seed = rollSeed(),
        startDate = new Date(),
        density = 0.1,
        w = 100,
        h = 50,
    } = {}) {
        this.random = new RandomStreams(seed);
        // General world-runtime stream. Map generation/calendar/weather each use
        // separate streams below.
        this.rnd = this.random.stream("runtime");

        // Time itself is deterministic and does not need an RNG.
        this.time = new WorldTime({ startDate });
        this.calendar = new Calendar({
            year: this.time.date.getUTCFullYear(),
            rnd: this.random.stream("calendar"),
        });

        this.weather = new Weather({
            startDate: this.time.date,
            seed: this.random.seed,
            rnd: this.random.stream("weather"),
        });
        this.temperatureC = this.weather.computeTemperature(this.time.date);

        this.moon = new Moon({ startDate: this.time.date });

        this.map = new WorldMap({
            rnd: this.random.stream("map"),
            density,
            mapWidth: w,
            mapHeight: h,
        });
    }

    // --- Time & environment ---

    getDayInfo(date = this.time.date) {
        return this.calendar.getDayInfo(date);
    }

    daysUntil(name, fromDate = this.time.date) {
        return this.calendar.daysUntil(name, fromDate);
    }

    advance(minutes) {
        // Apply all weather transitions for the elapsed time
        this.weather.step(minutes, this.time.date);

        // Move world time
        this.time.advanceMinutes(minutes);

        // If year changed, rebuild calendar
        const newYear = this.time.date.getUTCFullYear();
        if (newYear !== this.calendar.year) {
            this.calendar.setYear(newYear);
        }

        // Step moon
        this.moon.step(minutes, this.time.date);

        // Recompute temperature at the new time with the latest weather
        this.temperatureC = this.weather.computeTemperature(this.time.date);
    }

    // --- Environment snapshot for a given time ---
    getEnvironmentAt(date = this.time.date) {
        const d = date || this.time.date;

        const temperature = this.weather.computeTemperature(d);
        const weather = this.weather.kind; // current weather state
        const density = this.density;

        const season = this.season;

        return { weather, temperature, density, season };
    }

    // --- Queries ---

    // ---- Map helpers (delegated to WorldMap) ----
    findLocationsWithTag(tag) {
        return this.map.findLocationsWithTag(tag);
    }

    findLocationsWithTags(tags) {
        return this.map.findLocationsWithTags(tags);
    }

    findLocationsWithAllTags(tags) {
        return this.map.findLocationsWithAllTags(tags);
    }

    findLocationsWithCategory(category) {
        return this.map.findLocationsWithCategory(category);
    }

    createPlaceAt(placeData, locationId) {
        return this.map.createPlaceAt(placeData, locationId);
    }

    getLocation(id) {
        return this.locations.get(id);
    }

    getTravelEdge(fromId, toId) {
        return this.locations.get(fromId)?.neighbors.get(toId) || null;
    }

    getCurrentHolidayNames() {
        const info = this.calendar.getDayInfo(this.time.date);
        const all = [...info.holidays, ...info.specials];

        return all.map((h) => (typeof h === "string" ? h : h.name));
    }

    get currentWeather() {
        return this.weather.kind;
    }

    get season() {
        return Weather.monthToSeason(this.time.date.getUTCMonth() + 1);
    }

    get temperature() {
        return this.temperatureC;
    }

    get moonPhase() {
        return this.moon.getPhase();
    }

    get moonInfo() {
        return this.moon.getInfo(this.time.date);
    }

    toJSON() {
        return {
            random: this.random.toJSON(),
            time: this.time.toJSON(),
            calendar: this.calendar.toJSON(),
            weather: this.weather.toJSON(),
            temperatureC: this.temperatureC,
            moon: this.moon.toJSON(),
            map: this.map.toJSON(),
        };
    }

    static fromJSON(data) {
        const world = Object.create(World.prototype);
        world.random = RandomStreams.fromJSON(data.random);
        world.rnd = world.random.stream("runtime");
        world.time = WorldTime.fromJSON(data.time);
        world.calendar = Calendar.fromJSON(data.calendar, {
            rnd: world.random.stream("calendar"),
        });
        world.weather = Weather.fromJSON(data.weather, {
            seed: world.random.seed,
            rnd: world.random.stream("weather"),
        });
        world.temperatureC = Number(data.temperatureC);
        world.moon = Moon.fromJSON(data.moon);
        world.map = WorldMap.fromJSON(data.map, { rnd: world.random.stream("map") });
        return world;
    }

    // worldmap getters
    get locations() {
        return this.map.locations;
    }

    get edges() {
        return this.map.edges;
    }

    get density() {
        return this.map.density;
    }
}
