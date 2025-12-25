import { clamp01 } from "../../../shared/modules.js";
import { Location, Place } from "../module.js";
import { LOCATION_REGISTRY, PLACE_REGISTRY, STREET_REGISTRY } from "../../../data/data.js";

const capacityPerLocation = 10;

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
        const pick = candidates.length
            ? weightedPick(candidates, rnd)
            : weightedPick(LOCATION_REGISTRY, rnd);
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

function generatePlaces({
    locations,
    getTag,
    neighbors,
    distance,
    rnd,
    targetCounts,
    density = 0,
}) {
    const density01 = density;
    const minPlacesPerLocation = 1;

    // --- Graph + degree -----------------------------------
    const neighborList = new Map();
    for (const locId of locations) {
        const nbs = neighbors(locId);
        neighborList.set(locId, Array.from(nbs || []));
    }
    const neighborsFn = (id) => neighborList.get(id) || [];

    const distFn = (a, b, nb) => (distance ? distance(a, b) : bfsDistance(a, b, nb || neighborsFn));

    const degree = new Map();
    for (const [id, nbs] of neighborList) {
        degree.set(id, nbs.length);
    }

    // --- Track per-location usage & soft targets ----------
    const locationUsage = new Map();
    for (const locId of locations) {
        locationUsage.set(String(locId), 0);
    }

    const softTarget = new Map();
    for (const locId of locations) {
        const d = degree.get(locId) || 0;
        let minSlots = 1;
        let maxSlots = capacityPerLocation;

        if (d <= 1) {
            minSlots = 1;
            maxSlots = Math.min(2, capacityPerLocation);
        } else if (d === 2) {
            minSlots = 2;
            maxSlots = Math.min(3, capacityPerLocation);
        } else {
            minSlots = Math.min(3, capacityPerLocation);
            maxSlots = capacityPerLocation;
        }

        // For density 0, bias closer to min; for density 1, allow max
        const target = Math.round(minSlots*(1-density) + maxSlots*density);

        softTarget.set(String(locId), target);
    }

    // --- Index locations by tag ---------------------------
    const byTag = new Map();
    for (const locId of locations) {
        const tags = getTag(locId) || [];
        const list = Array.isArray(tags) ? tags : [tags];
        for (const t of list) {
            if (!byTag.has(t)) byTag.set(t, []);
            byTag.get(t).push(locId);
        }
    }

    function candidateListFor(def) {
        const set = new Set();

        if (def.allowedTags && def.allowedTags.length) {
            for (const tag of def.allowedTags) {
                const arr = byTag.get(tag);
                if (arr) for (const locId of arr) set.add(locId);
            }
        } else {
            for (const locId of locations) set.add(locId);
        }


        return Array.from(set);
    }

    // --- desired counts -----------------------------------
    const baseTargetCounts = {};
    if (targetCounts) {
        for (const k of Object.keys(targetCounts)) baseTargetCounts[k] = targetCounts[k];
    }

    const stage1Min = new Map();
    const stage2Extra = new Map();

    for (const def of PLACE_REGISTRY) {
        const key = def.key;
        const max = Number.isFinite(def.maxCount) ? def.maxCount : Infinity;

        let min = def.minCount ?? 1;
        const ext = baseTargetCounts[key];
        if (Number.isFinite(ext)) {
            min = Math.max(min, ext);
        }
        min = Math.min(min, max);
        stage1Min.set(key, min);

        let extra = 0;
        if (density01 > 0 && Number.isFinite(max) && max > min) {
            const room = max - min;
            extra = Math.round(room * density01);
            if (extra > room) extra = room;
        }
        stage2Extra.set(key, extra);
    }

    // --- Placement bookkeeping ----------------------------
    const results = [];
    const placedByKey = new Map();
    const totalByKey = new Map();
    const namesByKey = new Map();

    function recordPlacement(def, place, locId) {
        results.push(place);

        const key = def.key;
        const list = placedByKey.get(key) || [];
        list.push(place);
        placedByKey.set(key, list);

        totalByKey.set(key, (totalByKey.get(key) || 0) + 1);

        const locKey = String(locId);
        locationUsage.set(locKey, (locationUsage.get(locKey) || 0) + 1);
    }

    function canPlaceAt(def, locId, { respectSoftTarget }) {
        const locKey = String(locId);
        const used = locationUsage.get(locKey) || 0;
        if (used >= capacityPerLocation) return false;

        const locTagsRaw = getTag(locId) || [];
        const locTags = Array.isArray(locTagsRaw) ? locTagsRaw : [locTagsRaw];

        if (def.allowedTags && def.allowedTags.length) {
            if (!def.allowedTags.some((t) => locTags.includes(t))) return false;
        }


        if (Number.isFinite(def.maxCount)) {
            const already = totalByKey.get(def.key) || 0;
            if (already >= def.maxCount) return false;
        }

        const sameKeyPlaced = placedByKey.get(def.key) || [];
        if (!isFarEnough(locId, sameKeyPlaced, def.minDistance || 0, neighborsFn, distFn)) {
            return false;
        }

        return true;
    }

    function makePlace(def, locId) {
        const sameKeyPlaced = placedByKey.get(def.key) || [];
        const indexForKey = sameKeyPlaced.length;

        const locTagsRaw = getTag(locId) || [];
        const locTags = Array.isArray(locTagsRaw) ? locTagsRaw : [locTagsRaw];

        const context = {
            tags: locTags,
            rnd,
            index: indexForKey,
            locationId: locId,
        };

        const baseName =
            typeof def.nameFn === "function" ? def.nameFn(context) : def.label || def.key;

        let nameSet = namesByKey.get(def.key);
        if (!nameSet) {
            nameSet = new Set();
            namesByKey.set(def.key, nameSet);
        }

        let name = baseName;
        if (nameSet.has(name)) {
            let suffix = 2;
            while (suffix <= 99 && nameSet.has(`${baseName} ${suffix}`)) suffix++;
            if (suffix <= 99) {
                name = `${baseName} ${suffix}`;
            } else {
                return null; // give up on this slot
            }
        }
        nameSet.add(name);

        return new Place({
            id: instanceId(def.key, indexForKey, locId),
            key: def.key,
            name,
            locationId: locId,
            props: def.props || {},
        });
    }

    // --- weighted location picking: prefer underused -----------------
    function pickLocationFor(def, candidates, { respectSoftTarget }) {
        const weights = [];
        let total = 0;

        for (const locId of candidates) {
            const locKey = String(locId);
            const used = locationUsage.get(locKey) || 0;
            const soft = softTarget.get(locKey) ?? capacityPerLocation;
            const capLeft = Math.max(0, capacityPerLocation - used);

            if (capLeft <= 0) {
                weights.push(0);
                continue;
            }

            let w = capLeft * capLeft; // strongly prefer emptier spots

            if (respectSoftTarget && used >= soft) {
                w *= 0.1; // heavily down-weight over-target locations
            }

            weights.push(w);
            total += w;
        }

        if (total <= 0) return null;

        let r = rnd() * total;
        for (let i = 0; i < candidates.length; i++) {
            r -= weights[i];
            if (r <= 0 && weights[i] > 0) return candidates[i];
        }

        return null;
    }

    function placeForDef(def, targetTotal, { respectSoftTarget }) {
        if (targetTotal <= 0) return;

        const candidates = candidateListFor(def);
        if (!candidates.length) return;

        let attempts = 0;
        const maxAttempts = candidates.length * 15;

        while ((totalByKey.get(def.key) || 0) < targetTotal && attempts < maxAttempts) {
            attempts++;

            const locId =
                pickLocationFor(def, candidates, { respectSoftTarget }) ??
                candidates[(rnd() * candidates.length) | 0];

            if (!canPlaceAt(def, locId, { respectSoftTarget })) continue;

            const p = makePlace(def, locId);
            if (!p) continue;

            recordPlacement(def, p, locId);
        }
    }

    // --- Special case: bus stops --------------------------------------
    function placeBusStopsGreedy() {
        const BUS_STOP_KEY = "bus_stop";
        const busDef = PLACE_REGISTRY.find((d) => d.key === BUS_STOP_KEY);
        if (!busDef) return;

        // All locations where a bus stop *could* exist
        const candidates = candidateListFor(busDef);
        if (!candidates.length) return;

        // Shuffle candidates so patterns aren't fixed
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = (rnd() * (i + 1)) | 0;
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        const minDist = busDef.minDistance || 0;
        const placedSoFar = placedByKey.get(BUS_STOP_KEY) || [];

        for (const locId of candidates) {
            // Only rule: respect minDistance between bus stops
            if (!isFarEnough(locId, placedSoFar, minDist, neighborsFn, distFn)) {
                continue;
            }

            // IMPORTANT: do NOT call canPlaceAt here
            // -> ignores capacityPerLocation and softTarget
            const p = makePlace(busDef, locId);
            if (!p) continue;

            recordPlacement(busDef, p, locId);
            placedSoFar.push(p);
        }

        placedByKey.set(BUS_STOP_KEY, placedSoFar);
    }

    // --- Stage 0: bus stops, independent of density/targets ----------
    placeBusStopsGreedy();

    // --- Stage 1a: singletons / rare items first (NOT bus_stop) -----
    const singletonDefs = PLACE_REGISTRY.filter(
        (d) => d.key !== "bus_stop" && (d.maxCount === 1 || (d.minCount && d.minCount > 0))
    );

    // Rarest (fewest candidate locations) first
    singletonDefs.sort((a, b) => candidateListFor(a).length - candidateListFor(b).length);

    for (const def of singletonDefs) {
        const target = stage1Min.get(def.key) || 0;
        placeForDef(def, target, { respectSoftTarget: false });
    }

    // --- Stage 1b: bus stops (still important, but after singletons) --
    const busDef = PLACE_REGISTRY.find((d) => d.key === "bus_stop");
    if (busDef) {
        const target = stage1Min.get(busDef.key) || 0;
        placeForDef(busDef, target, { respectSoftTarget: false });
    }

    // --- Stage 1c: all remaining minCounts ---------------------------
    const others = PLACE_REGISTRY.filter((d) => d !== busDef && !singletonDefs.includes(d));

    others.sort((a, b) => candidateListFor(a).length - candidateListFor(b).length);

    for (const def of others) {
        const target = stage1Min.get(def.key) || 0;
        placeForDef(def, target, { respectSoftTarget: false });
    }

    // --- Stage 2: density-driven extras (respect soft targets) -------
    for (const def of PLACE_REGISTRY) {
        const base = stage1Min.get(def.key) || 0;
        const extra = stage2Extra.get(def.key) || 0;
        if (extra <= 0) continue;

        const targetTotal = base + extra;
        placeForDef(def, targetTotal, { respectSoftTarget: true });
    }

    // --- Stage 3: guarantee at least 1 place per location ------------
    if (minPlacesPerLocation > 0 && capacityPerLocation > 0) {
        for (const locId of locations) {
            const locKey = String(locId);
            let used = locationUsage.get(locKey) || 0;

            if (used >= capacityPerLocation) continue;

            while (used < minPlacesPerLocation && used < capacityPerLocation) {
                const tags = getTag(locId) || [];
                const locTags = Array.isArray(tags) ? tags : [tags];

                const candidateDefs = PLACE_REGISTRY.filter((def) => {
                    if (def.allowedTags && def.allowedTags.length) {
                        if (!def.allowedTags.some((t) => locTags.includes(t))) return false;
                    }
                    if (
                        Number.isFinite(def.maxCount) &&
                        (totalByKey.get(def.key) || 0) >= def.maxCount
                    )
                        return false;

                    const sameKeyPlaced = placedByKey.get(def.key) || [];
                    if (
                        !isFarEnough(
                            locId,
                            sameKeyPlaced,
                            def.minDistance || 0,
                            neighborsFn,
                            distFn
                        )
                    )
                        return false;

                    return true;
                });

                if (!candidateDefs.length) break;

                let def =
                    candidateDefs.find((d) => d.key === "bus_stop") ||
                    candidateDefs[(rnd() * candidateDefs.length) | 0];

                if (!canPlaceAt(def, locId, { respectSoftTarget: false })) {
                    const others = candidateDefs.filter((d) => d.key !== def.key);
                    if (!others.length) break;
                    def = others[(rnd() * others.length) | 0];
                    if (!canPlaceAt(def, locId, { respectSoftTarget: false })) break;
                }

                const p = makePlace(def, locId);
                if (!p) break;

                recordPlacement(def, p, locId);
                used = locationUsage.get(locKey) || 0;
            }
        }
    }

    return results;
}

function pickStreetDefForRun(startLocation, usedKeys, rnd) {
    const locTags = startLocation?.tags || [];
    const unused = STREET_REGISTRY.filter((s) => !usedKeys.has(s.key));
    if (unused.length === 0) return null; // we'll fall back to generic names

    // Prefer names whose tags overlap with the start location
    const candidates = [];
    for (const def of unused) {
        const overlap = (def.tags || []).filter((t) => locTags.includes(t)).length;
        const weight = 1 + overlap; // 1 base + bonus per matching tag
        candidates.push({ def, weight });
    }

    const total = candidates.reduce((s, c) => s + c.weight, 0);
    let r = rnd() * total;
    for (const c of candidates) {
        r -= c.weight;
        if (r <= 0) return c.def;
    }
    return candidates[candidates.length - 1].def;
}

function computeAutoLocationCount(density) {
    // 1) Absolute minimum required by minCount
    let totalMinPlaces = 0;
    for (const def of PLACE_REGISTRY) {
        const min = def.minCount ?? 1;
        totalMinPlaces += min;
    }

    const targetAvg = capacityPerLocation / 3; // tune if you like

    const locCount = Math.ceil(totalMinPlaces / targetAvg) * (1 + density);

    return Math.max(locCount, 1);
}

// --------------------------
// WorldMap class
// --------------------------

export class WorldMap {
    /**
     * @param {Object} opts
     * @param {Function} opts.rnd   - RNG function
     * @param {number} opts.density - 0..1, used when locationCount is not given
     * @param {number} mapWidth - span of map in local coordinates
     * @param {number} mapHeight - height of map in local coordinates
     */
    constructor({ rnd, density = 0, mapWidth = 100, mapHeight = 50 } = {}) {
        this.rnd = rnd;
        this.locations = new Map(); // id -> Location
        this.edges = []; // array<Street>
        this.density = density;

        const count = computeAutoLocationCount(density);

        this._generateLocations(count, mapWidth, mapHeight);
        this._connectGraph();
        this._populatePlaces();
    }

    // --------------------------
    // Location generation
    // --------------------------

    _generateLocations(n, W, H) {
        // 1) Create N locations with districts + tags
        const locs = createLocations({ count: n, rnd: this.rnd });

        // 2) Lay them out on a jittered grid for spacing/planarity
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
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
        // Distance cap: median of the MST edges * 1.25 to keep locality
        const sortedMst = [...mstEdges].sort((a, b) => a.d - b.d);
        const median = sortedMst.length ? sortedMst[Math.floor(sortedMst.length / 2)].d : Infinity;
        const maxExtraLen = median * 1.3;

        for (const A of nodes) {
            const k = Math.round(2 + this.rnd());
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

        this._assignStreetNames();

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
            const minutes = randInt(1, 5, map.rnd);

            const edgeAB = new Street({
                a: a.id,
                b: b.id,
                minutes,
                streetName: null,
            }); //defer naming
            const edgeBA = new Street({
                a: b.id,
                b: a.id,
                minutes,
                streetName: null,
            });

            a.connect(b, edgeAB);
            b.connect(a, edgeBA);
            map.edges.push(edgeAB);
        }

        function _orient(ax, ay, bx, by, cx, cy) {
            const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            return v === 0 ? 0 : v > 0 ? 1 : -1;
        }
        function _onSeg(ax, ay, bx, by, px, py) {
            return (
                Math.min(ax, bx) <= px &&
                px <= Math.max(ax, bx) &&
                Math.min(ay, by) <= py &&
                py <= Math.max(ay, by)
            );
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
            if (o1 === 0 && _onSeg(A.x, A.y, B.x, B.y, C.x, C.y))
                return !(C.x === A.x && C.y === A.y) && !(C.x === B.x && C.y === B.y);
            if (o2 === 0 && _onSeg(A.x, A.y, B.x, B.y, D.x, D.y))
                return !(D.x === A.x && D.y === A.y) && !(D.x === B.x && D.y === B.y);
            if (o3 === 0 && _onSeg(C.x, C.y, D.x, D.y, A.x, A.y))
                return !(A.x === C.x && A.y === C.y) && !(A.x === D.x && A.y === D.y);
            if (o4 === 0 && _onSeg(C.x, C.y, D.x, D.y, B.x, B.y))
                return !(B.x === C.x && B.y === C.y) && !(B.x === D.x && B.y === D.y);

            return false;
        }
    }

    // --------------------------
    // Place population
    // --------------------------

    _populatePlaces() {
        const ids = [...this.locations.keys()];
        const neighbors = (locId) => this.locations.get(locId)?.neighbors.keys() || [];

        const placed = generatePlaces({
            locations: ids,
            getTag: (locId) => this.locations.get(locId)?.tags || [],
            neighbors,
            rnd: this.rnd,
            density: this.density,
        });

        for (const p of placed) {
            const loc = this.locations.get(String(p.locationId));
            if (loc) (loc.places || (loc.places = [])).push(p);
        }
    }

    // --------------------------
    // Street naming
    // --------------------------
    _assignStreetNames() {
        const rnd = this.rnd;

        // nodeId -> array<Street> (undirected)
        const nodeEdges = new Map();
        for (const e of this.edges) {
            if (!nodeEdges.has(e.a)) nodeEdges.set(e.a, []);
            if (!nodeEdges.has(e.b)) nodeEdges.set(e.b, []);
            nodeEdges.get(e.a).push(e);
            nodeEdges.get(e.b).push(e);
        }

        // degree per node
        const degree = new Map();
        for (const [id, list] of nodeEdges) {
            degree.set(id, list.length);
        }

        const unassigned = new Set(this.edges); // edges without a streetName
        const usedStreetKeys = new Set(); // no reuse of a registry name
        let fallbackIndex = 1; // "Road 1", "Road 2", ... if registry is exhausted

        const MAX_LEN = Math.round(6 * ((1 + this.density) / 2));
        const MIN_LEN = 2;

        while (unassigned.size > 0) {
            // --- pick starting edge: prefer edges that touch low-degree nodes (<= 2) ---
            let startEdge = null;
            const lowDeg = [];

            for (const e of unassigned) {
                const da = degree.get(e.a) || 0;
                const db = degree.get(e.b) || 0;
                if (da <= 2 || db <= 2) lowDeg.push(e);
            }

            if (lowDeg.length > 0) {
                startEdge = lowDeg[(rnd() * lowDeg.length) | 0];
            } else {
                const arr = Array.from(unassigned);
                startEdge = arr[(rnd() * arr.length) | 0];
            }

            // orient so we start from the "less busy" end if possible
            let from = startEdge.a;
            let to = startEdge.b;
            if ((degree.get(startEdge.a) || 0) > (degree.get(startEdge.b) || 0)) {
                from = startEdge.b;
                to = startEdge.a;
            }

            const runEdges = [];
            runEdges.push(startEdge);
            unassigned.delete(startEdge);

            let prevNode = from;
            let currNode = to;
            let len = 1;

            while (len < MAX_LEN) {
                const incident = nodeEdges.get(currNode) || [];
                const available = incident.filter((e) => unassigned.has(e));
                if (available.length === 0) break;

                const deg = degree.get(currNode) || 0;

                // At intersections (deg >= 3) and once we have MIN_LEN, sometimes stop here
                if (deg >= 3 && len >= MIN_LEN) {
                    const pContinue = clamp01(0.5 * (1 + this.density)); // tweak: higher means longer continuous streets
                    if (rnd() > pContinue) break;
                }

                // Choose next edge – avoid going straight back if other options exist
                let nextEdge = null;
                const nonBack = available.filter((e) => {
                    const other = e.a === currNode ? e.b : e.a;
                    return other !== prevNode;
                });
                if (nonBack.length > 0) {
                    nextEdge = nonBack[(rnd() * nonBack.length) | 0];
                } else {
                    nextEdge = available[(rnd() * available.length) | 0];
                }

                runEdges.push(nextEdge);
                unassigned.delete(nextEdge);

                prevNode = currNode;
                currNode = nextEdge.a === currNode ? nextEdge.b : nextEdge.a;
                len++;
            }

            // --- Try to enforce "street is at least 2 edges long" structurally ---
            if (runEdges.length === 1) {
                const e = runEdges[0];
                const endpoints = [e.a, e.b];
                let extended = false;

                for (const node of endpoints) {
                    const incident = nodeEdges.get(node) || [];
                    const avail = incident.filter((ed) => unassigned.has(ed));
                    if (avail.length) {
                        const extra = avail[(rnd() * avail.length) | 0];
                        runEdges.push(extra);
                        unassigned.delete(extra);
                        extended = true;
                        break;
                    }
                }
                // if extended === false here, this edge is truly isolated:
                // there are no unassigned neighbors left to merge with
            }

            const startLoc = this.locations.get(from);
            const def = pickStreetDefForRun(startLoc, usedStreetKeys, rnd);

            let streetName = null;

            // Special case: single-edge "run" that we couldn't extend.
            if (runEdges.length === 1) {
                const lone = runEdges[0];
                const nodes = [lone.a, lone.b];

                // Look for any incident edge that already has a streetName
                for (const nodeId of nodes) {
                    const incident = nodeEdges.get(nodeId) || [];
                    const candidate = incident.find(
                        (e) => e !== lone && e.streetName // already named
                    );
                    if (candidate) {
                        streetName = candidate.streetName; // ✅ merge into existing street
                        break;
                    }
                }
            }

            // If we couldn’t reuse an existing name, pick a fresh one from the registry
            if (!streetName) {
                const startLoc = this.locations.get(from);
                const def = pickStreetDefForRun(startLoc, usedStreetKeys, rnd);

                if (def) {
                    streetName = def.name;
                    usedStreetKeys.add(def.key); // mark registry key as used
                } else {
                    streetName = `Road ${fallbackIndex++}`; // registry exhausted
                }
            }

            // Assign name to both directions of every edge in the run
            for (const e of runEdges) {
                const A = this.locations.get(e.a);
                const B = this.locations.get(e.b);

                e.streetName = streetName;

                const ab = A.neighbors.get(B.id);
                if (ab) ab.streetName = streetName;

                const ba = B.neighbors.get(A.id);
                if (ba) ba.streetName = streetName;
            }
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

    // --------------------------
    // Helpers: location queries
    // --------------------------

    /**
     * Return all locations that have the given tag.
     */
    findLocationsWithTag(tag) {
        if (!tag) return [];
        const out = [];
        for (const loc of this.locations.values()) {
            const tags = loc.tags || [];
            if (tags.includes(tag)) {
                out.push(loc);
            }
        }
        return out;
    }

    /**
     * Return all locations that have ANY of the provided tags.
     */
    findLocationsWithTags(locationTags) {
        const tagsArr = Array.isArray(locationTags)
            ? locationTags.filter(Boolean)
            : [locationTags].filter(Boolean);
        if (!tagsArr.length) return [];

        const out = [];
        for (const loc of this.locations.values()) {
            const tags = loc.tags || [];
            if (tags.some((t) => tagsArr.includes(t))) {
                out.push(loc);
            }
        }
        return out;
    }

    /**
     * Return all locations that have ALL of the provided tags.
     */
    findLocationsWithAllTags(locationTags) {
        const tagsArr = Array.isArray(locationTags)
            ? locationTags.filter(Boolean)
            : [locationTags].filter(Boolean);
        if (!tagsArr.length) return [];

        const out = [];
        for (const loc of this.locations.values()) {
            const tags = loc.tags || [];
            const ok = tagsArr.every((t) => tags.includes(t));
            if (ok) out.push(loc);
        }
        return out;
    }

    /**
     * Return all locations where ANY place has the given category in props.category.
     * (Supports both string and array category props for backward compatibility.)
     */
    findLocationsWithCategory(placeCategory) {
        if (!placeCategory) return [];
        const out = [];

        const hasCategory = (place) => {
            if (!place || !place.props) return false;
            const cat = place.props.category;
            if (!cat) return false;
            if (Array.isArray(cat)) return cat.includes(placeCategory);
            return cat === placeCategory;
        };

        for (const loc of this.locations.values()) {
            const places = loc.places || [];
            if (places.some(hasCategory)) {
                out.push(loc);
            }
        }
        return out;
    }

    // --------------------------
    // Place calculation
    // --------------------------

    /**
     * Create a Place at a given location and attach it to that Location.
     *
     * @param {Object} placeData - data for the Place constructor ({id,key,name,props,...})
     * @param {string|number} locationId - target location id (overrides placeData.locationId)
     * @returns {Place|null} the created Place or null if location not found
     */
    createPlaceAt(placeData, locationId) {
        if (!placeData) return null;
        const locId = String(locationId != null ? locationId : placeData.locationId);
        const loc = this.locations.get(locId);
        if (!loc) return null;

        const { id, key, name, props = {} } = placeData;

        if (!key) {
            throw new Error("createPlaceAt: 'key' is required");
        }

        const placeId = id || `${key}_${(loc.places && loc.places.length) || 0}`;

        const place = new Place({
            id: placeId,
            key,
            name: name || key,
            locationId: locId,
            props,
        });

        if (!Array.isArray(loc.places)) {
            loc.places = [];
        }
        loc.places.push(place);

        return place;
    }

    findNearestPlace(matchFn, originLocationId, atTime, respectOpening) {
        let best = null;
        let bestDist = Infinity;

        for (const loc of this.locations.values()) {
            const places = loc.places;
            for (const place of places) {
                if (!matchFn(place)) continue;

                if (respectOpening && typeof place.isOpen === "function") {
                    if (!place.isOpen(atTime)) continue;
                }

                const d = this.getTravelMinutes(originLocationId, loc.id);
                if (d < bestDist) {
                    bestDist = d;
                    best = {
                        locationId: loc.id,
                        placeId: place.id,
                    };
                }
            }
        }

        return best;
    }

    findRandomPlace(matchFn, originLocationId, atTime, respectOpening, minutesAtOrigin = 0) {
        const candidates = [];

        for (const loc of this.locations.values()) {
            const places = loc.places || [];
            for (const place of places) {
                if (!matchFn(place)) continue;

                if (respectOpening && typeof place.isOpen === "function") {
                    if (!place.isOpen(atTime)) continue;
                }

                const minutes = this.getTravelMinutes(originLocationId, loc.id);
                if (!Number.isFinite(minutes) || minutes === Infinity) continue;

                const baseWeight = 1 / (1 + 0.2 * minutes);
                candidates.push({
                    locationId: loc.id,
                    placeId: place.id,
                    weight: baseWeight,
                });
            }
        }

        if (!candidates.length) return null;

        // If there are multiple *different* locations, penalize staying in the same one.
        const distinctLocations = new Set(candidates.map((c) => c.locationId));
        if (originLocationId && distinctLocations.size > 1) {
            const stayBias = computeStayBias(minutesAtOrigin);

            for (const c of candidates) {
                if (c.locationId === originLocationId) {
                    c.weight *= stayBias;
                }
            }
        }

        // Weighted pick
        let total = 0;
        for (const c of candidates) total += c.weight;
        if (total <= 0) return null;

        let r = this.rnd() * total;
        for (const c of candidates) {
            r -= c.weight;
            if (r <= 0) {
                return { locationId: c.locationId, placeId: c.placeId };
            }
        }

        // Fallback (floating point edge case)
        const last = candidates[candidates.length - 1];
        return { locationId: last.locationId, placeId: last.placeId };

        function computeStayBias(minutesAtOrigin) {
            // 0–30 min: no penalty (1.0)
            // 30–120 min: linearly from 1.0 down to 0.3
            // 120+ min: strong penalty (~0.1)
            if (minutesAtOrigin <= 30) return 1.0;
            if (minutesAtOrigin >= 120) return 0.1;

            const t = (minutesAtOrigin - 30) / (120 - 30); // 0..1
            return 1.0 - 0.7 * t; // 1.0 -> 0.3
        }
    }

    //Dijkstra-style shortest-path, returns travel minutes again this si some real,bs lol
    getTravelMinutes(fromId, toId) {
        const start = String(fromId);
        const goal = String(toId);
        if (!start || !goal) return Infinity;
        if (start === goal) return 0;

        const dist = new Map();
        const queue = [];

        dist.set(start, 0);
        queue.push({ id: start, cost: 0 });

        while (queue.length) {
            // Naive priority queue: O(n) scan is fine for small graphs
            let bestIndex = 0;
            for (let i = 1; i < queue.length; i++) {
                if (queue[i].cost < queue[bestIndex].cost) bestIndex = i;
            }

            const { id, cost } = queue.splice(bestIndex, 1)[0];

            if (id === goal) return cost;

            // Outdated entry?
            if (cost > (dist.get(id) ?? Infinity)) continue;

            const loc = this.locations.get(id);
            if (!loc) continue;

            for (const [nbId, edge] of loc.neighbors) {
                const minutes = edge?.minutes ?? 1;
                const nextCost = cost + minutes;

                if (nextCost < (dist.get(nbId) ?? Infinity)) {
                    dist.set(nbId, nextCost);
                    queue.push({ id: nbId, cost: nextCost });
                }
            }
        }

        return Infinity; // unreachable
    }

    getTravelTotal(fromId, toId) {
        const start = String(fromId);
        const goal = String(toId);
        if (!start || !goal) return null;
        if (start === goal) {
            return { locations: [start], edges: [], minutes: 0 };
        }

        const dist = new Map();
        const prev = new Map(); // nodeId -> { id: prevNodeId, edge }
        const queue = [];

        dist.set(start, 0);
        queue.push({ id: start, cost: 0 });

        while (queue.length) {
            // naive priority queue
            let bestIndex = 0;
            for (let i = 1; i < queue.length; i++) {
                if (queue[i].cost < queue[bestIndex].cost) bestIndex = i;
            }
            const { id, cost } = queue.splice(bestIndex, 1)[0];

            if (id === goal) break;
            if (cost > (dist.get(id) ?? Infinity)) continue;

            const loc = this.locations.get(id);
            if (!loc) continue;

            for (const [nbId, edge] of loc.neighbors) {
                const minutes = edge && typeof edge.minutes === "number" ? edge.minutes : 1;
                const nextCost = cost + minutes;

                if (nextCost < (dist.get(nbId) ?? Infinity)) {
                    dist.set(nbId, nextCost);
                    prev.set(nbId, { id, edge });
                    queue.push({ id: nbId, cost: nextCost });
                }
            }
        }

        if (!dist.has(goal)) return null;

        const locations = [];
        const edges = [];
        let cur = goal;
        while (cur !== start) {
            const info = prev.get(cur);
            if (!info) break;
            locations.push(cur);
            edges.push(info.edge);
            cur = info.id;
        }
        locations.push(start);
        locations.reverse();
        edges.reverse();

        const totalMinutes = edges.reduce(
            (sum, e) => sum + (e && typeof e.minutes === "number" ? e.minutes : 1),
            0
        );

        return { locations, edges, minutes: totalMinutes };
    }
}
