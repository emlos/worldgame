// --------------------------
// Helpers moved from location.js
// --------------------------

import { clamp01 } from "../../../shared/modules.js";
import { LOCATION_REGISTRY, Location, PLACE_REGISTRY, Place } from "../module.js";

const capacityPerLocation = 5;

const dist = (A, B) => Math.hypot(A.x - B.x, A.y - B.y);

/** Weighted choice helper. items: [{item, weight}] */
function weightedPick(defs, rnd) {
  const total = defs.reduce((s, d) => s + (d.weight || 1), 0);
  let r = rnd() * total;
  for (const d of defs) {
    r -= d.weight || 1;
    if (r <= 0) return d;
  }
  return defs[defs.length - 1];
}

/**
 * Choose district definitions for a number of locations.
 * Tries to satisfy `min` first and respects `max` caps.
 */
function pickDistrictDefs(count, rnd) {
  const out = [];
  const used = new Map(); // key -> count
  const inc = (k) => used.set(k, (used.get(k) || 0) + 1);

  // satisfy mins
  for (const d of LOCATION_REGISTRY) {
    if (Number.isFinite(d.min) && d.min > 0) {
      for (let i = 0; i < d.min && out.length < count; i++) {
        out.push(d);
        inc(d.key);
      }
    }
  }

  // fill the rest by weight while respecting max
  while (out.length < count) {
    const candidates = LOCATION_REGISTRY.filter((d) => {
      const u = used.get(d.key) || 0;
      return !Number.isFinite(d.max) || u < d.max;
    });
    const pick = candidates.length ? weightedPick(candidates, rnd) : weightedPick(LOCATION_REGISTRY, rnd);
    out.push(pick);
    inc(pick.key);
  }

  return out;
}

/** Name like "Suburb A", "Suburb B", but leave singletons as-is. */
function defaultDistrictName(def, index) {
  const base = def.label || def.key;
  const needsSuffix = LOCATION_REGISTRY.map((loc) => loc.key).includes(def.key);
  if (!needsSuffix) return base;
  const suffix = String.fromCharCode("A".charCodeAt(0) + (index % 26));
  return `${base} ${suffix}`;
}

/** Create tagged locations from registry choices. */
function createLocations({ count, rnd, nameFn = defaultDistrictName }) {
  const chosen = pickDistrictDefs(count, rnd, LOCATION_REGISTRY);
  return chosen.map(
    (def, i) =>
      new Location({
        id: i,
        name: nameFn(def, i),
        x: 0,
        y: 0,
        districtKey: def.key,
        tags: def.tags || [],
        meta: { label: def.label },
      })
  );
}

/** BFS distance if no distance() is supplied. */
function bfsDistance(a, b, neighbors) {
  if (a === b) return 0;
  const Q = [a];
  const seen = new Set([a]);
  let d = 0;
  while (Q.length) {
    const size = Q.length;
    d++;
    for (let i = 0; i < size; i++) {
      const cur = Q.shift();
      for (const nb of neighbors(cur) || []) {
        if (seen.has(nb)) continue;
        if (nb === b) return d;
        seen.add(nb);
        Q.push(nb);
      }
    }
  }
  return Infinity;
}

/** Check if two locations are at least minDistance apart. */
function isFarEnough(target, placed, minDistance, neighbors, distance) {
  for (const p of placed) {
    if (distance(target, p.locationId, neighbors) < minDistance) {
      return false;
    }
  }
  return true;
}

/** Build a unique id for a placed instance. */
function instanceId(key, idx, locationId) {
  return `${key}#${idx}@${String(locationId)}`;
}

function generatePlaces({ locations, getTag, neighbors, distance, rnd, targetCounts }) {
  const dist = (a, b, nb) => (distance ? distance(a, b) : bfsDistance(a, b, nb || neighbors));

  const maxPlacesPerLocation = 5;
  const minPlacesPerLocation = 1;

  // Track how many places each location has
  const locationUsage = new Map();
  for (const loc of locations) {
    locationUsage.set(String(loc), 0);
  }

  // Track global counts per place key
  const totalByKey = new Map();

  // Index candidate locations by allowedTags
  const byTag = new Map();
  for (const loc of locations) {
    const tags = getTag(loc);
    const list = Array.isArray(tags) ? tags : [tags];
    for (const t of list) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(loc);
    }
  }

  // --- Compute desired counts per key ---
  const L = Array.from(locations).length;
  const defaultCounts = {};

  for (const def of PLACE_REGISTRY) {
    if (def.unique) {
      defaultCounts[def.key] = 1;
    } else {
      // base from map size and weight
      const base = Math.max(1, Math.floor((L / 20) * (def.weight || 1)));
      defaultCounts[def.key] = base;
    }
  }

  const counts = { ...defaultCounts, ...(targetCounts || {}) };

  // Respect optional per-definition minCount / maxCount, and treat missing minCount as 1
  for (const def of PLACE_REGISTRY) {
    const k = def.key;
    let c = counts[k] ?? 0;

    const min = def.minCount != null ? def.minCount : 1; // default: at least one of each place type
    c = Math.max(c, min);

    if (def.maxCount != null) c = Math.min(c, def.maxCount);
    if (def.unique) c = 1;

    counts[k] = c;
  }

  const results = [];
  const placedByKey = new Map(); // key -> [Place]

  // Process bus_stop first, then uniques, then others
  const defs = [...PLACE_REGISTRY];
  const sortedDefs = defs.sort((a, b) => {
    const priority = (d) => (d.key === "bus_stop" ? 3 : d.unique ? 2 : 1);
    return priority(b) - priority(a);
  });

  // --- Main placement pass ---
  for (const def of sortedDefs) {
    // Candidate locations by allowedTags
    const candidates = new Set();
    for (const tag of def.allowedTags || []) {
      const arr = byTag.get(tag);
      if (arr) for (const loc of arr) candidates.add(loc);
    }
    if (candidates.size === 0) continue;

    const candidateList = Array.from(candidates);
    let want = counts[def.key] || (def.unique ? 1 : 0);

    // Special rule: bus_stop — try to add to every compatible location
    if (def.key === "bus_stop") {
      want = candidateList.length;
    }

    if (want <= 0) continue;

    let attempts = 0;
    let made = 0;
    const sameKeyPlaced = placedByKey.get(def.key) || [];

    while (made < want && attempts < candidateList.length * 3) {
      attempts++;

      const loc = candidateList[(rnd() * candidateList.length) | 0];
      const locId = String(loc);

      // per-location max
      if (locationUsage.get(locId) >= maxPlacesPerLocation) continue;

      // minDistance against same-key places
      if (!isFarEnough(loc, sameKeyPlaced, def.minDistance || 0, neighbors, dist)) {
        continue;
      }

      const locTagsRaw = getTag(loc);
      const locTags = Array.isArray(locTagsRaw) ? locTagsRaw : [locTagsRaw];
      const context = {
        tags: locTags,
        rnd,
        index: sameKeyPlaced.length,
        locationId: loc,
      };

      const placeName = typeof def.nameFn === "function" ? def.nameFn(context) : def.label;

      const p = new Place({
        id: instanceId(def.key, sameKeyPlaced.length, loc),
        key: def.key,
        name: placeName,
        locationId: loc,
        props: def.props || {},
      });

      results.push(p);
      sameKeyPlaced.push(p);
      placedByKey.set(def.key, sameKeyPlaced);

      locationUsage.set(locId, (locationUsage.get(locId) || 0) + 1);
      totalByKey.set(def.key, (totalByKey.get(def.key) || 0) + 1);

      made++;
    }
  }

  // --- Fill pass: ensure each location has at least minPlacesPerLocation ---
  if (minPlacesPerLocation > 0 && maxPlacesPerLocation > 0) {
    for (const loc of locations) {
      const locId = String(loc);
      let used = locationUsage.get(locId) || 0;

      while (used < minPlacesPerLocation && used < maxPlacesPerLocation) {
        const locTagsRaw = getTag(loc);
        const locTags = Array.isArray(locTagsRaw) ? locTagsRaw : [locTagsRaw];

        // Allowed types for this location that aren't over their own maxCount
        const candidates = PLACE_REGISTRY.filter((def) => {
          if (!(def.allowedTags || []).some((t) => locTags.includes(t))) return false;

          if (def.maxCount != null && (totalByKey.get(def.key) || 0) >= def.maxCount) return false;
          if (def.unique && (totalByKey.get(def.key) || 0) >= 1) return false;

          const sameKeyPlaced = placedByKey.get(def.key) || [];
          if (!isFarEnough(loc, sameKeyPlaced, def.minDistance || 0, neighbors, dist)) return false;

          return true;
        });

        if (candidates.length === 0) break;

        // Prefer bus_stop if allowed
        const def = candidates.find((d) => d.key === "bus_stop") || candidates[(rnd() * candidates.length) | 0];

        const sameKeyPlaced = placedByKey.get(def.key) || [];
        const context = {
          tags: locTags,
          rnd,
          index: sameKeyPlaced.length,
          locationId: loc,
        };
        const placeName = typeof def.nameFn === "function" ? def.nameFn(context) : def.label;

        const p = new Place({
          id: instanceId(def.key, sameKeyPlaced.length, loc),
          key: def.key,
          name: placeName,
          locationId: loc,
          props: def.props || {},
        });

        results.push(p);
        sameKeyPlaced.push(p);
        placedByKey.set(def.key, sameKeyPlaced);

        locationUsage.set(locId, (locationUsage.get(locId) || 0) + 1);
        totalByKey.set(def.key, (totalByKey.get(def.key) || 0) + 1);
        used++;
      }
    }
  }

  return results;
}

// --------------------------
// Helper moved from world.js
// --------------------------

function computeAutoLocationCount(density = 0) {
  // Clamp density defensively
  const d = clamp01(density);

  // --- 1) Compute the absolute minimum required to satisfy all minCount ---
  let totalMinPlaces = 0;

  for (const def of LOCATION_REGISTRY) {
    const min = def.minCount || 1;
    totalMinPlaces += min;
  }

  // We need enough locations that we can fit all minimum required places
  const minByCapacity = Math.ceil(totalMinPlaces / capacityPerLocation);
  const minLocations = Math.max(minByCapacity, 1);

  return Math.round(minLocations * 1 + d);
}

// --------------------------
// WorldMap class
// --------------------------

export class WorldMap {
  /**
   * @param {Object} opts
   * @param {Function} opts.rnd   - RNG function
   * @param {number} opts.density - 0..1, used when locationCount is not given
   */
  constructor({ rnd, density = 0 } = {}) {
    this.rnd = rnd;
    this.locations = new Map(); // id -> Location
    this.edges = []; // array<Street>

    const count = computeAutoLocationCount(density);

    this._generateLocations(count);
    this._connectGraph();
    this._populatePlaces();
  }

  // --------------------------
  // Location generation
  // --------------------------

  _generateLocations(n) {
    // 1) Create N locations with districts + tags
    const locs = createLocations({ count: n, rnd: this.rnd });

    // 2) Lay them out on a jittered grid for spacing/planarity
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const W = 1000,
      H = 700;
    const cellW = W / cols,
      cellH = H / rows;

    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && i < n; c++, i++) {
        const jitterX = (this.rnd() - 0.5) * cellW * 0.5;
        const jitterY = (this.rnd() - 0.5) * cellH * 0.5;
        locs[i].x = c * cellW + cellW * 0.5 + jitterX;
        locs[i].y = r * cellH + cellH * 0.5 + jitterY;
        this.locations.set(locs[i].id, locs[i]);
      }
    }
  }

  // --------------------------
  // Graph connection
  // --------------------------

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
      linkNoCross(A, B, this);
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
        linkNoCross(A, B, this); // will refuse if crossing
      }
    }

    function linkNoCross(a, b, map) {
      // refuse if already linked
      if (a.id === b.id || a.neighbors.has(b.id)) return;

      // crossing check against existing edges
      const A = a,
        B = b;
      for (const e of map.edges) {
        const C = map.locations.get(e.a);
        const D = map.locations.get(e.b);
        if (C.id === A.id || C.id === B.id || D.id === A.id || D.id === B.id) continue; // shared endpoint ok
        if (segmentsIntersect(A, B, C, D)) return; // would cross -> skip
      }

      // create edge (travel minutes still randomized 1..10 at world-gen)
      const minutes = randInt(1, 10, map.rnd);
      const distance = Math.round(dist(a, b));
      const streetName = pick(StreetNames, map.rnd);

      const edgeAB = new Street({ a: a.id, b: b.id, minutes, distance, streetName });
      const edgeBA = new Street({ a: b.id, b: a.id, minutes, distance, streetName });

      a.connect(b, edgeAB);
      b.connect(a, edgeBA);
      map.edges.push(edgeAB);
    }
  }

  // --------------------------
  // Place population
  // --------------------------

  _populatePlaces() {
    const ids = [...this.locations.keys()];
    const neighbors = (locId) => this.locations.get(locId)?.neighbors.keys() || [];

    // We let the generator use BFS hop-distance for minDistance;
    // pass no `distance` function to fall back to BFS over neighbors.
    const placed = generatePlaces({
      locations: ids,
      getTag: (locId) => this.locations.get(locId)?.tags || [],
      neighbors,
      rnd: this.rnd,
    });

    // attach instances back onto their owning Location
    for (const p of placed) {
      const loc = this.locations.get(String(p.locationId));
      if (loc) (loc.places || (loc.places = [])).push(p);
    }
  }

  // --------------------------
  // Queries
  // --------------------------

  getLocation(id) {
    return this.locations.get(String(id));
  }

  getTravelEdge(fromId, toId) {
    const a = String(fromId);
    const b = String(toId);

    const loc = this.locations.get(a);
    if (!loc) return null;

    return loc.neighbors.get(b) || null;
  }
}

//TODO: street objects, logic etc, this is just placeholder
const StreetNames = ["Oak St", "River Rd", "Sunset Ave", "King's Way", "Maple Blvd", "Old Mill Rd"];
