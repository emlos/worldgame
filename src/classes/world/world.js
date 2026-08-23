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
        // General world-runtime stream. Stateful procedural systems use separate
        // streams; weather uses keyed hourly rolls so queries cannot consume RNG.
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
        });
        this.temperatureC = this.weather.computeTemperature(this.time.date, this.weather.kind);

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
        const amount = Number(minutes);
        if (!Number.isFinite(amount) || amount === 0) return;

        const targetDate = new Date(this.time.date.getTime() + amount * 60 * 1000);

        // Resolve weather before mutating world time so an invalid rewind leaves
        // the whole world unchanged.
        this.weather.advanceTo(targetDate);

        // Move world time
        this.time.advanceMinutes(amount);

        // If year changed, rebuild calendar
        const newYear = this.time.date.getUTCFullYear();
        if (newYear !== this.calendar.year) {
            this.calendar.setYear(newYear);
        }

        // Step moon
        this.moon.step(amount, this.time.date);

        // Recompute temperature at the new time with the latest weather
        this.temperatureC = this.weather.computeTemperature(this.time.date, this.weather.kind);
    }

    // --- Environment snapshot for a given time ---
    getEnvironmentAt(date = this.time.date) {
        const d = date instanceof Date ? new Date(date.getTime()) : new Date(date || this.time.date);
        if (!Number.isFinite(d.getTime())) throw new Error(`Invalid environment date: ${date}`);

        const weatherState = this.weather.stateAt(d);
        const weather = weatherState.kind;
        const temperature = this.weather.computeTemperature(d, weather);
        const density = this.density;
        const season = Weather.monthToSeason(d.getUTCMonth() + 1);

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
        });
        if (world.weather.date.getTime() !== world.time.date.getTime()) {
            world.weather.advanceTo(world.time.date);
        }
        world.temperatureC = world.weather.computeTemperature(
            world.time.date,
            world.weather.kind,
        );
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
