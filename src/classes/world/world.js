import { Moon, WorldTime, Calendar, Weather, WorldMap } from "./module.js";
// --------------------------
// World
// --------------------------

export class World {
  constructor({ seed = Date.now(), startDate = new Date(), density = 0.25, w = 100, h = 50 } = {}) {
    this.seed = seed;
    this.rnd = makeRNG(seed);

    // Time & calendar
    this.time = new WorldTime({ startDate, rnd: this.rnd });
    this.calendar = new Calendar({
      year: this.time.date.getFullYear(),
      rnd: this.rnd,
    });

    // Weather & moon
    this.weather = new Weather({
      seed: this.seed,
      startDate: this.time.date,
      rnd: this.rnd,
    });

    this.temperatureC = this.weather.computeTemperature(this.time.date);

    this.moon = new Moon({ startDate: this.time.date });

    // World map (locations + streets + places)
    this.map = new WorldMap({
      rnd: this.rnd,
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
    const newYear = this.time.date.getFullYear();
    if (newYear !== this.calendar.year) {
      this.calendar.setYear(newYear);
    }

    // Step moon
    this.moon.step(minutes, this.time.date);

    // Recompute temperature at the new time with the latest weather
    this.temperatureC = this.weather.computeTemperature(this.time.date);
  }

  // --- Queries ---
  getLocation(id) {
    return this.locations.get(id);
  }

  getTravelEdge(fromId, toId) {
    return this.locations.get(fromId)?.neighbors.get(toId) || null;
  }

  get currentWeather() {
    return this.weather.kind;
  }

  get season() {
    return Weather.monthToSeason(this.time.date.getMonth());
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

  // worldmap getters
  get locations() {
    return this.map.locations;
  }

  get edges() {
    return this.map.edges;
  }
}
