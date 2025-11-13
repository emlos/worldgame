/** Weighted choice helper. items: [{item, weight}] */
function weightedPick(pairs, rand) {
  const total = pairs.reduce((s, p) => s + (p.weight || 1), 0);
  let r = rand() * total;
  for (const p of pairs) {
    r -= p.weight || 1;
    if (r <= 0) return p;
  }
  return pairs[pairs.length - 1];
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

/**
 * Generate places on the map given a registry and a map interface.
 * Returns an array of Place instances (not yet attached to the map).
 *
 * options:
 * - locations: iterable of location ids/nodes
 * - getTag(loc): => string | string[]
 * - neighbors(loc): => iterable of neighbor ids
 * - distance(a,b,neighbors?): => number  (optional; if missing we BFS using neighbors)
 * - rnd: RNG with next(): number in [0,1)
 * - registry: array of place definitions (default: PLACE_REGISTRY)
 * - targetCounts: optional map { key: count } to force approximate counts for non-unique items.
 *                 If omitted, counts are inferred from location volume & weights.
 */
export function generatePlaces({ locations, getTag, neighbors, distance, rnd, registry = PLACE_REGISTRY, targetCounts }) {
  const dist = (a, b, nb) => (distance ? distance(a, b) : bfsDistance(a, b, nb || neighbors));

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

  // Compute desired counts for non-unique places if not provided
  const L = Array.from(locations).length;
  const defaultCounts = {};
  for (const def of registry) {
    if (def.unique) {
      defaultCounts[def.key] = 1;
    } else {
      // Heuristic: weight-scaled by map size; tweak as needed in your world.js
      const base = Math.max(1, Math.floor((L / 20) * (def.weight || 1)));
      defaultCounts[def.key] = base;
    }
  }
  const counts = { ...defaultCounts, ...(targetCounts || {}) };

  const results = [];
  const placedByKey = new Map(); // key -> placed instances of that key (for spacing between same kind)

  for (const def of registry) {
    const want = counts[def.key] || (def.unique ? 1 : 0);
    if (want <= 0) continue;

    const candidates = new Set();
    for (const tag of def.allowedTags || []) {
      const arr = byTag.get(tag);
      if (arr) for (const loc of arr) candidates.add(loc);
    }
    if (candidates.size === 0) continue;

    const candidateList = Array.from(candidates);
    let attempts = 0;
    let made = 0;
    const sameKeyPlaced = placedByKey.get(def.key) || [];

    while (made < want && attempts < candidateList.length * 3) {
      attempts++;

      // Random candidate
      const loc = candidateList[(rnd() * candidateList.length) | 0];

      // Enforce spacing among same-key places
      if (!isFarEnough(loc, sameKeyPlaced, def.minDistance || 0, neighbors, dist)) {
        continue;
      }

      const locTagsRaw = getTag(loc);
      const locTags = Array.isArray(locTagsRaw) ? locTagsRaw : [locTagsRaw];
      const context = { tags: locTags, rnd, index: made, locationId: loc };

      const placeName = typeof def.nameFn === "function" ? def.nameFn(context) : def.label;

      const p = new Place({
        id: instanceId(def.key, made, loc),
        key: def.key,
        name: placeName,
        locationId: loc,
        props: def.props || {},
      });

      results.push(p);
      sameKeyPlaced.push(p);
      made++;
    }
    placedByKey.set(def.key, sameKeyPlaced);
  }

  // Ensure uniqueness across incompatible keys if you want soft exclusion rules later.
  // For now, keys are independent except their own minDistance constraint.

  return results;
}

/** Optional: choose a random place definition compatible with a given location tag. */
export function pickPlaceDefForTag(tag, rnd, registry = PLACE_REGISTRY) {
  const options = registry.filter((d) => d.allowedTags?.includes(tag)).map((d) => ({ ...d, weight: d.weight || 1 }));
  if (options.length === 0) return null;
  return weightedPick(options, rnd);
}
