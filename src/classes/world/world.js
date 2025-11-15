import { Moon, WorldTime, buildYearCalendar, ymd, Weather, WorldMap } from "./module.js";
// --------------------------
// World
// --------------------------

export class World {
  constructor({ seed = Date.now(), startDate = new Date(), density = 0.25, w = 100, h = 50 } = {}) {
    this.seed = seed;
    this.rnd = makeRNG(seed);

    // Time & calendar
    this.time = new WorldTime({ startDate, rnd: this.rnd });
    this.calendar = buildYearCalendar(this.time.date.getFullYear(), this.rnd);

    // Weather & moon
    this.weather = new Weather({
      seed: this.seed,
      startDate: this.time.date,
      rnd: this.rnd,
    });

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
    const y = date.getFullYear();
    if (y !== this._calYear) {
      this.calendar = buildYearCalendar(y, this.rnd);
      this._calYear = y;
    }
    const key = ymd(y, date.getMonth() + 1, date.getDate());
    const info = this.calendar.get(key) || { holidays: [], specials: [], dayOff: false };
    const dow = date.getDay(); // 0=Sunday
    const isWeekend = dow === 0 || dow === 6;
    const dayOff = info.dayOff || isWeekend;
    return { ...info, isWeekend, dayOff, kind: dayOff ? DayKind.DAY_OFF : DayKind.WORKDAY };
  }

  advance(minutes) {
    // Apply all weather transitions for the elapsed time
    this.weather.step(minutes, this.time.date);

    this.time.advanceMinutes(minutes);

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

  //worldmap getters
  get locations() {
    return this.map.locations;
  }

  get edges() {
    return this.map.edges;
  }
}

const DayKind = { WORKDAY: "workday", DAY_OFF: "day off" };
