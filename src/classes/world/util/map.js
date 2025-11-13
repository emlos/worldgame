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

export function generatePlaces({ locations, getTag, neighbors, distance, rnd, registry = PLACE_REGISTRY, targetCounts }) {
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

  for (const def of registry) {
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
  for (const def of registry) {
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
  const defs = [...registry];
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
        const candidates = registry.filter((def) => {
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

/** Optional: choose a random place definition compatible with a given location tag. */
export function pickPlaceDefForTag(tag, rnd, registry = PLACE_REGISTRY) {
  const options = registry.filter((d) => d.allowedTags?.includes(tag)).map((d) => ({ ...d, weight: d.weight || 1 }));
  if (options.length === 0) return null;
  return weightedPick(options, rnd);
}
