import { Moon, WorldTime, buildYearCalendar, ymd, Place, Street, Location, Weather } from "./module.js";
import { makeRNG } from "../../shared/modules.js";
// --------------------------
// World
// --------------------------

export class World {
  constructor({ seed = Date.now(), locationCount = 8, startDate = new Date() } = {}) {
    this.seed = seed;
    this.rnd = makeRNG(seed);

    // Time & calendar
    this.time = new WorldTime({ startDate, rnd: this.rnd });
    this.calendar = buildYearCalendar(this.time.date.getFullYear(), this.rnd);

    this.weather = new Weather({
      seed: this.seed,
      startDate: this.time.date,
      rnd: this.rnd,
    });

    this.moon = new Moon({ startDate: this.time.date });

    // Graph
    this.locations = new Map(); // id -> Location
    this.edges = []; // list of Street
    this._generateLocations(locationCount);
    this._connectGraph();

    // Temperature cache
    this.temperatureC = this.weather.computeTemperature(this.time.date);
  }

  // --- World gen ---
  _generateLocations(n) {
    // Place locations on a jittered grid for nice spacing & easy planarity
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const W = 1000,
      H = 700; // world units (free choice)
    const cellW = W / cols,
      cellH = H / rows;
    let i = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && i < n; c++, i++) {
        const jitterX = (this.rnd() - 0.5) * cellW * 0.5;
        const jitterY = (this.rnd() - 0.5) * cellH * 0.5;
        const x = c * cellW + cellW * 0.5 + jitterX;
        const y = r * cellH + cellH * 0.5 + jitterY;

        const places = Array.from({ length: randInt(1, 3, this.rnd) }, (_, k) => new Place({ id: `${i}-p${k}`, name: pick(PlaceNames, this.rnd) }));

        const loc = new Location({ id: `L${i}`, name: `District ${i + 1}`, places, x, y });
        this.locations.set(loc.id, loc);
      }
    }
  }

  _connectGraph() {
    const ids = [...this.locations.keys()];
    const nodes = ids.map((id) => this.locations.get(id));

    // --- Build complete list of candidate edges with Euclidean distances
    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i],
          B = nodes[j];
        candidates.push({ a: A.id, b: B.id, d: dist(A, B) });
      }
    }
    candidates.sort((u, v) => u.d - v.d); // shortest first

    // --- Kruskal’s MST (Euclidean MST is planar -> no crossings)
    const parent = new Map(ids.map((id) => [id, id]));
    const find = (x) => (parent.get(x) === x ? x : parent.set(x, find(parent.get(x))).get(x));
    const unite = (x, y) => parent.set(find(x), find(y));

    const mstEdges = [];
    for (const e of candidates) {
      if (find(e.a) !== find(e.b)) {
        mstEdges.push(e);
        unite(e.a, e.b);
      }
    }

    // Add MST edges (they cannot cross)
    for (const e of mstEdges) {
      const A = this.locations.get(e.a),
        B = this.locations.get(e.b);
      this._linkNoCross(A, B);
    }

    // --- Add a few local edges (k-NN) without crossings & within a distance cap
    const k = 2;
    // Distance cap: median of the MST edges * 1.25 to keep locality
    const sortedMst = [...mstEdges].sort((a, b) => a.d - b.d);
    const median = sortedMst.length ? sortedMst[Math.floor(sortedMst.length / 2)].d : Infinity;
    const maxExtraLen = median * 1.25;

    for (const A of nodes) {
      const byNear = nodes
        .filter((B) => B.id !== A.id)
        .map((B) => ({ B, d: dist(A, B) }))
        .sort((u, v) => u.d - v.d)
        .slice(0, k);

      for (const { B, d } of byNear) {
        if (d > maxExtraLen) continue;
        if (A.neighbors.has(B.id)) continue;
        this._linkNoCross(A, B); // will refuse if crossing
      }
    }
  }

  _linkNoCross(a, b) {
    // refuse if already linked
    if (a.id === b.id || a.neighbors.has(b.id)) return;

    // crossing check against existing edges
    const A = a,
      B = b;
    for (const e of this.edges) {
      const C = this.locations.get(e.a);
      const D = this.locations.get(e.b);
      if (C.id === A.id || C.id === B.id || D.id === A.id || D.id === B.id) continue; // shared endpoint ok
      if (segmentsIntersect(A, B, C, D)) return; // would cross -> skip
    }

    // create edge (travel minutes still randomized 1..10 at world-gen)
    const minutes = randInt(1, 10, this.rnd);
    const distance = Math.round(dist(a, b));
    const streetName = pick(StreetNames, this.rnd);

    const edgeAB = new Street({ a: a.id, b: b.id, minutes, distance, streetName });
    const edgeBA = new Street({ a: b.id, b: a.id, minutes, distance, streetName });

    a.connect(b, edgeAB);
    b.connect(a, edgeBA);
    this.edges.push(edgeAB);
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
}

const dist = (A, B) => Math.hypot(A.x - B.x, A.y - B.y);

function _orient(ax, ay, bx, by, cx, cy) {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return v === 0 ? 0 : v > 0 ? 1 : -1;
}
function _onSeg(ax, ay, bx, by, px, py) {
  return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by);
}
/** Proper segment intersection (allows touching at endpoints = NOT counted as crossing) */
function segmentsIntersect(A, B, C, D) {
  const o1 = _orient(A.x, A.y, B.x, B.y, C.x, C.y);
  const o2 = _orient(A.x, A.y, B.x, B.y, D.x, D.y);
  const o3 = _orient(C.x, C.y, D.x, D.y, A.x, A.y);
  const o4 = _orient(C.x, C.y, D.x, D.y, B.x, B.y);

  // General case
  if (o1 !== o2 && o3 !== o4) return true;

  // Collinear cases (touching). Treat as non-crossing if touching at endpoints.
  if (o1 === 0 && _onSeg(A.x, A.y, B.x, B.y, C.x, C.y)) return !(C.x === A.x && C.y === A.y) && !(C.x === B.x && C.y === B.y);
  if (o2 === 0 && _onSeg(A.x, A.y, B.x, B.y, D.x, D.y)) return !(D.x === A.x && D.y === A.y) && !(D.x === B.x && D.y === B.y);
  if (o3 === 0 && _onSeg(C.x, C.y, D.x, D.y, A.x, A.y)) return !(A.x === C.x && A.y === C.y) && !(A.x === D.x && A.y === D.y);
  if (o4 === 0 && _onSeg(C.x, C.y, D.x, D.y, B.x, B.y)) return !(B.x === C.x && B.y === C.y) && !(B.x === D.x && B.y === D.y);

  return false;
}

//TODO: street objects, logic etc, this is just placeholder
const StreetNames = ["Oak St", "River Rd", "Sunset Ave", "King's Way", "Maple Blvd", "Old Mill Rd"];

const PlaceNames = [
  "Cafe",
  "Market",
  "Library",
  "Park",
  "Bar",
  "Gym",
  "Clinic",
  "Theater",
  "Museum",
  "Corner Store",
  "Church",
  "Restaurant",
  "Train Station",
  "Salon",
  "Stadium",
  "Charity Shop",
  "Pizzeria",
  "Police Station",
  "Fire Department",
  "Civil Office",
  "Boulevards",
  "Primary School of Mayor Brigadier Little",
  "Middle School no. 1",
  "St. Genevieves High School",
  "University of Docktown",
  "Bus Station",
  "Town Square",
  "Fish Market",
  "Club",
  "Cinema",
  "Mechanic",
  "Corner Store",
  "Mall", 
  "Apartament Complex" //multiple can exist
  //more?
];

const DayKind = { WORKDAY: "workday", DAY_OFF: "day off" };