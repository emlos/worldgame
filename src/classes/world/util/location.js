// --------------------------
// Locations & Districts
// --------------------------

/**
 * Location is a node on the world graph. We extend it with:
 *  - districtKey: which entry from LOCATION_REGISTRY it instantiates
 *  - tags: array of strings describing this location's district traits
 */
export class Location {
  constructor({ id, name, places = [], x = 0, y = 0, districtKey = null, tags = [], meta = {} } = {}) {
    this.id = String(id);
    this.name = name || `Loc ${id}`;
    this.places = places; // array<Place>
    this.neighbors = new Map(); // neighborId -> Edge
    this.x = x;
    this.y = y;
    this.districtKey = districtKey; // e.g., "downtown"
    this.tags = Array.from(new Set(tags)); // e.g., ["urban","commercial"]
    this.meta = meta;
  }

  connect(other, edge) {
    this.neighbors.set(other.id, edge);
  }
}

/**
 * District registry:
 * - key: unique identifier
 * - label: human-readable name
 * - tags: list of tags that characterize this district
 * - weight: relative probability during random generation
 * - min/max (optional): soft constraints for typical counts in a town
 */
export const LOCATION_REGISTRY = [
  { key: "downtown", label: "Downtown", tags: ["urban", "commercial", "transit", "dense"], weight: 3, min: 1 },
  { key: "residential_core", label: "Residential Core", tags: ["urban", "residential", "dense"], weight: 4 },
  { key: "suburb", label: "Suburb", tags: ["suburban", "residential"], weight: 6 },
  { key: "industrial", label: "Industrial Park", tags: ["industrial", "urban"], weight: 2 },
  { key: "campus", label: "University District", tags: ["education", "suburban", "urban"], weight: 1, max: 1 },
  { key: "old_town", label: "Old Town", tags: ["urban", "historic", "tourism", "commercial"], weight: 2 },
  { key: "harbor", label: "Harbor", tags: ["industrial", "coastal", "commercial"], weight: 1, max: 1 },
  { key: "market_district", label: "Market District", tags: ["urban", "commercial"], weight: 2 },
  { key: "parklands", label: "Parklands", tags: ["green", "recreation"], weight: 2 },
  { key: "rural_edge", label: "Rural Edge", tags: ["rural", "residential", "sparse"], weight: 2 },
];

/** Utility: pick one entry from weighted list. */
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
export function pickDistrictDefs(count, rnd, registry = LOCATION_REGISTRY) {
  const out = [];
  const used = new Map(); // key -> count
  const inc = (k) => used.set(k, (used.get(k) || 0) + 1);

  // satisfy mins
  for (const d of registry) {
    if (Number.isFinite(d.min) && d.min > 0) {
      for (let i = 0; i < d.min && out.length < count; i++) {
        out.push(d);
        inc(d.key);
      }
    }
  }

  // fill the rest by weight while respecting max
  while (out.length < count) {
    const candidates = registry.filter((d) => {
      const u = used.get(d.key) || 0;
      return !Number.isFinite(d.max) || u < d.max;
    });
    const pick = candidates.length ? weightedPick(candidates, rnd) : weightedPick(registry, rnd);
    out.push(pick);
    inc(pick.key);
  }

  return out;
}

/** Name like "Suburb A", "Suburb B", but leave singletons as-is. */
export function defaultDistrictName(def, index) {
  const base = def.label || def.key;
  const needsSuffix = ["suburb", "residential_core", "parklands", "market_district", "rural_edge"].includes(def.key);
  if (!needsSuffix) return base;
  const suffix = String.fromCharCode("A".charCodeAt(0) + (index % 26));
  return `${base} ${suffix}`;
}

/** Create tagged locations from registry choices. */
export function createLocations({ count, rnd, nameFn = defaultDistrictName, registry = LOCATION_REGISTRY }) {
  const chosen = pickDistrictDefs(count, rnd, registry);
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

/** Tag helper. */
export function locationHasAnyTag(location, tagsToMatch = []) {
  if (!tagsToMatch || tagsToMatch.length === 0) return true;
  const set = new Set(location.tags || []);
  return tagsToMatch.some((t) => set.has(t));
}

/** Merge tags into a location (e.g., after refinement). */
export function addTags(location, ...tags) {
  const set = new Set(location.tags || []);
  for (const t of tags.flat()) set.add(t);
  location.tags = Array.from(set);
  return location;
}
