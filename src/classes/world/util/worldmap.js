//TODO: rework streets between nodes to prevent from long chans of stingle streets happening [see screenshot]
//TODO: basicaly reword the node distribution - more scattered circle like

import { weightedPick, randInt, makeRNG } from "../../../shared/util/random.js";
import { Location } from "./location.js";
import { Place } from "./place.js";
import { Street } from "./street.js";
import { LOCATION_REGISTRY } from "../../../data/world/location.js";
import { PLACE_REGISTRY } from "../../../data/world/place.js";
import { STREET_REGISTRY } from "../../../data/world/street.js";
import { finitePositive } from "../../../shared/util/util.js";

const capacityPerLocation = 10;
const MS_PER_MINUTE = 60 * 1000;

const dist = (A, B) => Math.hypot(A.x - B.x, A.y - B.y);

function addTravelTime(atTime, minutes) {
    if (!(atTime instanceof Date) || !Number.isFinite(atTime.getTime())) return atTime;
    return new Date(atTime.getTime() + minutes * MS_PER_MINUTE);
}

/**
 * Choose district definitions for a number of locations.
 * Tries to satisfy `min` first and respects `max` caps.
 */
function pickDistrictDefs(count, rnd) {
    if (count < LOCATION_REGISTRY.length) {
        throw new RangeError("World map needs at least one of every registered district");
    }

    // Every district definition is represented once. Besides guaranteeing all
    // place-tag constraints have somewhere legal to resolve, this keeps the
    // fixed-size world varied without a separate size control.
    const out = [...LOCATION_REGISTRY];
    const used = new Map(LOCATION_REGISTRY.map((definition) => [definition.key, 1]));
    const inc = (k) => used.set(k, (used.get(k) || 0) + 1);

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

    for (let index = out.length - 1; index > 0; index--) {
        const other = (rnd() * (index + 1)) | 0;
        [out[index], out[other]] = [out[other], out[index]];
    }

    return out;
}

/** Name like "Suburb A", "Suburb B", but leave singletons as-is. */
function defaultDistrictName(def, _index, { totalForKey = 1, occurrence = 0 } = {}) {
    const base = def.label || def.key;
    if (totalForKey <= 1) return base;
    const suffix = String.fromCharCode("A".charCodeAt(0) + (occurrence % 26));
    return `${base} ${suffix}`;
}

/** Create tagged locations from registry choices. */
function createLocations({ count, rnd, nameFn = defaultDistrictName }) {
    const chosen = pickDistrictDefs(count, rnd);
    const totals = new Map();
    const seen = new Map();

    for (const def of chosen) {
        totals.set(def.key, (totals.get(def.key) || 0) + 1);
    }

    return chosen.map((def, i) => {
        const occurrence = seen.get(def.key) || 0;
        seen.set(def.key, occurrence + 1);

        return new Location({
            id: i,
            name: nameFn(def, i, {
                totalForKey: totals.get(def.key) || 1,
                occurrence,
            }),
            x: 0,
            y: 0,
            districtKey: def.key,
            tags: def.tags || [],
            meta: { label: def.label },
        });
    });
}

/** Build a unique id for a placed instance. */
function instanceId(key, idx, locationId) {
    return `${key}#${idx}@${String(locationId)}`;
}

function generatePlaces({ locations, getTag, rnd }) {
    const locationUsage = new Map(locations.map((locationId) => [String(locationId), 0]));
    const seenKeys = new Set();

    const placements = PLACE_REGISTRY.map((def, registryIndex) => {
        const key = String(def?.key ?? "");
        if (!key) throw new Error("Every PLACE_REGISTRY definition requires a key");
        if (seenKeys.has(key)) {
            throw new Error(`PLACE_REGISTRY contains duplicate key '${key}'`);
        }
        seenKeys.add(key);

        const allowedTags = Array.isArray(def.allowedTags)
            ? def.allowedTags.filter((tag) => tag != null)
            : [];
        const candidates = locations.filter((locationId) => {
            if (!allowedTags.length) return true;
            const tags = getTag(locationId) || [];
            const locationTags = Array.isArray(tags) ? tags : [tags];
            return allowedTags.some((tag) => locationTags.includes(tag));
        });
        if (!candidates.length) {
            throw new Error(
                `No generated location can host registered place '${key}'`,
            );
        }
        return { def, registryIndex, candidates };
    });

    // Place definitions with the fewest legal districts first so broad,
    // flexible definitions cannot consume their capacity.
    placements.sort(
        (left, right) =>
            left.candidates.length - right.candidates.length ||
            left.registryIndex - right.registryIndex,
    );

    const results = [];
    for (const { def, candidates } of placements) {
        const available = candidates.filter(
            (locationId) =>
                (locationUsage.get(String(locationId)) || 0) < capacityPerLocation,
        );
        if (!available.length) {
            throw new Error(
                `No location has capacity for registered place '${def.key}'`,
            );
        }

        // Prefer emptier districts while retaining seeded variation.
        const weights = available.map((locationId) => {
            const used = locationUsage.get(String(locationId)) || 0;
            const remaining = capacityPerLocation - used;
            return remaining * remaining;
        });
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        let roll = rnd() * totalWeight;
        let locationId = available.at(-1);
        for (let index = 0; index < available.length; index++) {
            roll -= weights[index];
            if (roll <= 0) {
                locationId = available[index];
                break;
            }
        }

        const tags = getTag(locationId) || [];
        const locationTags = Array.isArray(tags) ? tags : [tags];
        const name =
            typeof def.nameFn === "function"
                ? def.nameFn({
                    tags: locationTags,
                    rnd,
                    index: 0,
                    locationId,
                })
                : def.label || def.key;

        results.push(
            new Place({
                id: instanceId(def.key, 0, locationId),
                key: def.key,
                name,
                locationId,
                props: def.props || {},
            }),
        );
        const locationKey = String(locationId);
        locationUsage.set(locationKey, (locationUsage.get(locationKey) || 0) + 1);
    }

    if (results.length !== PLACE_REGISTRY.length) {
        throw new Error("World generation did not place every registered place exactly once");
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

function computeAutoLocationCount() {
    const capacityCount = Math.ceil(PLACE_REGISTRY.length / capacityPerLocation);
    return Math.max(LOCATION_REGISTRY.length, capacityCount, 1);
}

// --------------------------
// WorldMap class
// --------------------------

export class WorldMap {
    /**
     * @param {Object} opts
     * @param {Function} opts.rnd   - RNG function
     * @param {number} mapWidth - span of map in local coordinates
     * @param {number} mapHeight - height of map in local coordinates
     */
    constructor({ rnd = null, mapWidth = 100, mapHeight = 50 } = {}) {
        mapWidth = finitePositive(mapWidth, "World map width");
        mapHeight = finitePositive(mapHeight, "World map height");

        this.rnd = rnd ?? makeRNG();
        this.locations = new Map(); // id -> Location
        this.edges = []; // array<Street>
        const count = computeAutoLocationCount();

        this._generateLocations(count, mapWidth, mapHeight);
        this._connectGraph();
        this._populatePlaces();
    }

    toJSON() {
        return {
            locations: [...this.locations.values()].map((loc) => loc.toJSON()),
            edges: this.edges.map((edge) => edge.toJSON()),
        };
    }

    static fromJSON(data, { rnd } = {}) {
        const map = Object.create(WorldMap.prototype);
        map.rnd = rnd ?? makeRNG();
        map.locations = new Map();
        map.edges = [];
        for (const locData of data?.locations || []) {
            const places = (locData?.places || []).map((placeData) => Place.fromJSON(placeData));
            const loc = Location.fromJSON(locData, { places });
            map.locations.set(String(loc.id), loc);
        }

        // Edges are stored once per undirected connection. Rebuild both
        // directional neighbor entries so normal pathfinding APIs keep working.
        for (const edgeData of data?.edges || []) {
            const edge = Street.fromJSON(edgeData);
            edge.a = String(edge.a);
            edge.b = String(edge.b);

            const a = map.locations.get(edge.a);
            const b = map.locations.get(edge.b);
            if (!a || !b) continue;

            const reverse = new Street({
                a: edge.b,
                b: edge.a,
                minutes: edge.minutes,
                streetName: edge.streetName,
            });
            a.connect(b, edge);
            b.connect(a, reverse);
            map.edges.push(edge);
        }

        return map;
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

        const placed = generatePlaces({
            locations: ids,
            getTag: (locId) => this.locations.get(locId)?.tags || [],
            rnd: this.rnd,
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

        const MAX_LEN = 3;
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
                    const pContinue = 0.5;
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

            let streetName = null;

            // Special case: single-edge "run" that we couldn't extend.
            if (runEdges.length === 1) {
                const lone = runEdges[0];
                const nodes = [lone.a, lone.b];

                // Look for any incident edge that already has a streetName
                for (const nodeId of nodes) {
                    const incident = nodeEdges.get(nodeId) || [];
                    const candidate = incident.find(
                        (e) => e !== lone && e.streetName, // already named
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

    /** Return all locations where ANY place has the given category in props.category. */
    findLocationsWithCategory(placeCategory) {
        if (!placeCategory) return [];
        const out = [];

        const hasCategory = (place) => {
            if (!place || !place.props) return false;
            const cat = place.props.category;
            return Array.isArray(cat) && cat.includes(placeCategory);
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

                const d = this.getTravelMinutes(originLocationId, loc.id);
                if (!Number.isFinite(d)) continue;

                if (respectOpening && typeof place.isOpen === "function") {
                    if (!place.isOpen(addTravelTime(atTime, d))) continue;
                }

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

                const minutes = this.getTravelMinutes(originLocationId, loc.id);
                if (!Number.isFinite(minutes)) continue;

                if (respectOpening && typeof place.isOpen === "function") {
                    if (!place.isOpen(addTravelTime(atTime, minutes))) continue;
                }

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
            0,
        );

        return { locations, edges, minutes: totalMinutes };
    }
}
