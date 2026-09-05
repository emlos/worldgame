import { weightedPick, randInt, makeRNG } from "../../shared/util/random.js";
import { Location } from "./location.js";
import { Place } from "./place.js";
import { Street } from "./street.js";
import { LOCATION_REGISTRY } from "../data/location.js";
import {
    getPlaceInstanceTarget,
    PLACE_DISTRIBUTION_KIND,
    PLACE_REGISTRY,
} from "../data/place.js";
import { STREET_REGISTRY } from "../data/street.js";
import { finitePositive } from "../../shared/util/util.js";

const capacityPerLocation = 10;
const MS_PER_MINUTE = 60 * 1000;
const POSITION_CANDIDATES_PER_NODE = 32;
const TARGET_EDGE_RATIO = 1.3;
const MAX_EDGE_RATIO = 1.5;
const MAX_NODE_DEGREE = 5;
const TARGET_LEAF_COUNT = 3;
const TARGET_CORRIDOR_LENGTH = 4;
const EXTRA_EDGE_LENGTH_RATIO = 2.8;
const GEOMETRY_RELAXATION_STEPS = 250;
const MIN_GEOMETRY_SPACING = 5.05;
const TRAVEL_LENGTH_BASE = 5;
const TRAVEL_LENGTH_PER_MINUTE = 3.2;

const dist = (A, B) => Math.hypot(A.x - B.x, A.y - B.y);

const undirectedEdgeKey = (a, b) => [String(a), String(b)].sort().join("\u0000");

function generateOrganicPositions(count, width, height, rnd) {
    if (count <= 0) return [];

    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = width * 0.46;
    const radiusY = height * 0.46;
    const phaseA = rnd() * Math.PI * 2;
    const phaseB = rnd() * Math.PI * 2;

    const sampleCandidate = () => {
        const angle = rnd() * Math.PI * 2;
        const radius = Math.sqrt(rnd());
        const boundaryShape =
            0.93 +
            Math.sin(angle * 3 + phaseA) * 0.045 +
            Math.sin(angle * 5 + phaseB) * 0.025;
        return {
            x: centerX + Math.cos(angle) * radius * radiusX * boundaryShape,
            y: centerY + Math.sin(angle) * radius * radiusY * boundaryShape,
        };
    };

    const points = [sampleCandidate()];
    while (points.length < count) {
        let best = null;
        let bestDistance = -Infinity;

        for (let attempt = 0; attempt < POSITION_CANDIDATES_PER_NODE; attempt++) {
            const candidate = sampleCandidate();
            const nearestDistance = Math.min(
                ...points.map((point) => Math.hypot(candidate.x - point.x, candidate.y - point.y)),
            );
            if (nearestDistance > bestDistance) {
                best = candidate;
                bestDistance = nearestDistance;
            }
        }

        points.push(best);
    }

    return points;
}

function collectDegreeTwoCorridors(locations) {
    const nodes = [...locations.values()];
    const adjacency = new Map(
        nodes.map((node) => [String(node.id), [...node.neighbors.keys()].map(String)]),
    );
    const visitedEdges = new Set();
    const corridors = [];

    const walk = (startId, nextId) => {
        const nodeIds = [String(startId), String(nextId)];
        const edgeKeys = [undirectedEdgeKey(startId, nextId)];
        visitedEdges.add(edgeKeys[0]);

        let previousId = String(startId);
        let currentId = String(nextId);
        while ((adjacency.get(currentId) || []).length === 2) {
            const followingId = (adjacency.get(currentId) || []).find(
                (candidateId) => candidateId !== previousId,
            );
            if (followingId == null) break;

            const key = undirectedEdgeKey(currentId, followingId);
            if (visitedEdges.has(key)) break;
            visitedEdges.add(key);
            edgeKeys.push(key);
            nodeIds.push(followingId);
            previousId = currentId;
            currentId = followingId;
        }

        corridors.push({ nodeIds, edgeKeys, length: edgeKeys.length });
    };

    for (const node of nodes) {
        const nodeId = String(node.id);
        const neighbors = adjacency.get(nodeId) || [];
        if (neighbors.length === 2) continue;
        for (const neighborId of neighbors) {
            if (!visitedEdges.has(undirectedEdgeKey(nodeId, neighborId))) {
                walk(nodeId, neighborId);
            }
        }
    }

    // A connected component made entirely of degree-two nodes is a cycle and
    // has no natural endpoint, so account for any edges not visited above.
    for (const node of nodes) {
        const nodeId = String(node.id);
        for (const neighborId of adjacency.get(nodeId) || []) {
            if (!visitedEdges.has(undirectedEdgeKey(nodeId, neighborId))) {
                walk(nodeId, neighborId);
            }
        }
    }

    return corridors;
}

function analyzeGraph(locations, edges) {
    const nodes = [...locations.values()];
    const degrees = nodes.map((node) => node.neighbors.size);
    const unseen = new Set(nodes.map((node) => String(node.id)));
    let componentCount = 0;

    while (unseen.size) {
        componentCount++;
        const queue = [unseen.values().next().value];
        unseen.delete(queue[0]);
        while (queue.length) {
            const currentId = queue.shift();
            const current = locations.get(currentId);
            for (const neighborId of current?.neighbors.keys() || []) {
                const id = String(neighborId);
                if (!unseen.delete(id)) continue;
                queue.push(id);
            }
        }
    }

    const corridors = collectDegreeTwoCorridors(locations);
    const streetEdges = new Map();
    for (const edge of edges) {
        const streetName = String(edge.streetName || "Street");
        if (!streetEdges.has(streetName)) streetEdges.set(streetName, []);
        streetEdges.get(streetName).push(edge);
    }

    let branchingStreetCount = 0;
    for (const street of streetEdges.values()) {
        const streetDegrees = new Map();
        for (const edge of street) {
            streetDegrees.set(String(edge.a), (streetDegrees.get(String(edge.a)) || 0) + 1);
            streetDegrees.set(String(edge.b), (streetDegrees.get(String(edge.b)) || 0) + 1);
        }
        if ([...streetDegrees.values()].some((degree) => degree > 2)) {
            branchingStreetCount++;
        }
    }

    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    return {
        nodeCount,
        edgeCount,
        componentCount,
        cycleCount: edgeCount - nodeCount + componentCount,
        leafCount: degrees.filter((degree) => degree === 1).length,
        degreeTwoCount: degrees.filter((degree) => degree === 2).length,
        maxDegree: degrees.length ? Math.max(...degrees) : 0,
        averageDegree: nodeCount ? (edgeCount * 2) / nodeCount : 0,
        longestCorridor: corridors.length
            ? Math.max(...corridors.map((corridor) => corridor.length))
            : 0,
        streetCount: streetEdges.size,
        singleEdgeStreetCount: [...streetEdges.values()].filter((street) => street.length === 1)
            .length,
        longestStreetLength: streetEdges.size
            ? Math.max(...[...streetEdges.values()].map((street) => street.length))
            : 0,
        branchingStreetCount,
    };
}

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

function generatePlaces({ locations, getTag, getNeighbors, rnd }) {
    const locationUsage = new Map(locations.map((locationId) => [String(locationId), 0]));
    const seenKeys = new Set();

    const placements = PLACE_REGISTRY.map((def, registryIndex) => {
        const key = String(def?.key ?? "");
        if (!key) throw new Error("Every PLACE_REGISTRY definition requires a key");
        if (typeof def.unlocked !== "boolean") {
            throw new Error(`Registered place '${key}' requires a boolean unlocked state`);
        }
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

    const results = [];

    const createPlace = (def, locationId, index) => {
        const tags = getTag(locationId) || [];
        const locationTags = Array.isArray(tags) ? tags : [tags];
        const name =
            typeof def.nameFn === "function"
                ? def.nameFn({
                    tags: locationTags,
                    rnd,
                    index,
                    locationId,
                })
                : def.label || def.key;
        const place = new Place({
            id: instanceId(def.key, index, locationId),
            key: def.key,
            name,
            locationId,
            props: def.props || {},
            unlocked: def.unlocked,
        });
        results.push(place);
        const locationKey = String(locationId);
        locationUsage.set(locationKey, (locationUsage.get(locationKey) || 0) + 1);
    };

    const hopDistanceCache = new Map();
    const getHopDistances = (startLocationId) => {
        const startId = String(startLocationId);
        if (hopDistanceCache.has(startId)) return hopDistanceCache.get(startId);

        const distances = new Map([[startId, 0]]);
        const queue = [startId];
        while (queue.length) {
            const currentId = queue.shift();
            const nextDistance = distances.get(currentId) + 1;
            for (const neighborId of getNeighbors(currentId) || []) {
                const id = String(neighborId);
                if (distances.has(id)) continue;
                distances.set(id, nextDistance);
                queue.push(id);
            }
        }
        hopDistanceCache.set(startId, distances);
        return distances;
    };

    const graphDistance = (leftId, rightId) =>
        getHopDistances(leftId).get(String(rightId)) ?? Infinity;

    const findCoverageSelection = (orderedCandidates, target, maximumDistance) => {
        const allMask = (1n << BigInt(locations.length)) - 1n;
        const coverageMasks = orderedCandidates.map((candidateId) =>
            locations.reduce(
                (mask, locationId, index) =>
                    graphDistance(candidateId, locationId) <= maximumDistance
                        ? mask | (1n << BigInt(index))
                        : mask,
                0n,
            ),
        );

        const search = (startIndex, remaining, coveredMask, selectedIndices) => {
            if (coveredMask === allMask) return selectedIndices;
            if (remaining === 0) return null;

            let possibleMask = coveredMask;
            for (let index = startIndex; index < coverageMasks.length; index++) {
                possibleMask |= coverageMasks[index];
            }
            if (possibleMask !== allMask) return null;

            for (let index = startIndex; index < orderedCandidates.length; index++) {
                const result = search(
                    index + 1,
                    remaining - 1,
                    coveredMask | coverageMasks[index],
                    [...selectedIndices, index],
                );
                if (result) return result;
            }
            return null;
        };

        const selectedIndices = search(0, target, 0n, []);
        if (!selectedIndices) return null;
        const selected = selectedIndices.map((index) => orderedCandidates[index]);

        // A smaller set may already satisfy the coverage constraint. Fill the
        // remaining configured instances by maximizing their distance from it.
        while (selected.length < target) {
            let bestLocationId = null;
            let bestNearestDistance = -Infinity;
            for (const locationId of orderedCandidates) {
                if (selected.includes(locationId)) continue;
                const nearestDistance = Math.min(
                    ...selected.map((selectedId) => graphDistance(locationId, selectedId)),
                );
                if (nearestDistance > bestNearestDistance) {
                    bestLocationId = locationId;
                    bestNearestDistance = nearestDistance;
                }
            }
            if (bestLocationId == null) return null;
            selected.push(bestLocationId);
        }
        return selected;
    };

    // Distributed infrastructure reserves its capacity first. Start from the
    // graph's most central legal location, then repeatedly choose the legal
    // location furthest from the stops already selected.
    for (const { def, candidates } of placements.filter(
        ({ def }) => def.distribution?.kind === PLACE_DISTRIBUTION_KIND.graphCoverage,
    )) {
        const target = getPlaceInstanceTarget(def, locations.length);
        const shuffled = [...candidates];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const other = (rnd() * (index + 1)) | 0;
            [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
        }

        let firstLocationId = null;
        let firstEccentricity = Infinity;
        let firstTotalDistance = Infinity;
        for (const locationId of shuffled) {
            const distances = locations.map((otherId) => graphDistance(locationId, otherId));
            const eccentricity = Math.max(...distances);
            const totalDistance = distances.reduce((sum, distance) => sum + distance, 0);
            if (
                eccentricity < firstEccentricity ||
                (eccentricity === firstEccentricity && totalDistance < firstTotalDistance)
            ) {
                firstLocationId = locationId;
                firstEccentricity = eccentricity;
                firstTotalDistance = totalDistance;
            }
        }

        let selected = firstLocationId == null ? [] : [firstLocationId];
        while (selected.length < target) {
            let bestLocationId = null;
            let bestNearestDistance = -Infinity;
            for (const locationId of shuffled) {
                if (selected.includes(locationId)) continue;
                if ((locationUsage.get(String(locationId)) || 0) >= capacityPerLocation) continue;
                const nearestDistance = Math.min(
                    ...selected.map((selectedId) => graphDistance(locationId, selectedId)),
                );
                if (nearestDistance > bestNearestDistance) {
                    bestLocationId = locationId;
                    bestNearestDistance = nearestDistance;
                }
            }
            if (bestLocationId == null) {
                throw new Error(
                    `No location has capacity for distributed place '${def.key}'`,
                );
            }
            selected.push(bestLocationId);
        }

        const maximumCoverageDistance = Number(def.distribution.maxGraphDistance);
        if (
            Number.isFinite(maximumCoverageDistance) &&
            locations.some(
                (locationId) =>
                    Math.min(
                        ...selected.map((selectedId) =>
                            graphDistance(locationId, selectedId),
                        ),
                    ) > maximumCoverageDistance,
            )
        ) {
            selected = findCoverageSelection(
                shuffled,
                target,
                maximumCoverageDistance,
            );
            if (!selected) {
                throw new Error(
                    `Distributed place '${def.key}' cannot cover the generated graph`,
                );
            }
        }

        selected.forEach((locationId, index) => createPlace(def, locationId, index));
    }

    // Place definitions with the fewest legal districts first so broad,
    // flexible definitions cannot consume their capacity.
    const uniquePlacements = placements.filter(
        ({ def }) => def.distribution?.kind !== PLACE_DISTRIBUTION_KIND.graphCoverage,
    );
    uniquePlacements.sort(
        (left, right) =>
            left.candidates.length - right.candidates.length ||
            left.registryIndex - right.registryIndex,
    );

    for (const { def, candidates } of uniquePlacements) {
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
        createPlace(def, locationId, 0);
    }

    const expectedCount = PLACE_REGISTRY.reduce(
        (total, definition) =>
            total + getPlaceInstanceTarget(definition, locations.length),
        0,
    );
    if (results.length !== expectedCount) {
        throw new Error(
            `World generation placed ${results.length} places instead of ${expectedCount}`,
        );
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
    let count = Math.max(LOCATION_REGISTRY.length, 1);
    while (true) {
        const placeCount = PLACE_REGISTRY.reduce(
            (total, definition) => total + getPlaceInstanceTarget(definition, count),
            0,
        );
        const required = Math.max(
            LOCATION_REGISTRY.length,
            Math.ceil(placeCount / capacityPerLocation),
            1,
        );
        if (required <= count) return count;
        count = required;
    }
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
        this._fitGeometryToTravelTimes(mapWidth, mapHeight);
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

        // 2) Best-candidate sampling gives the fixed-size world organic,
        // collision-resistant spacing without forcing nodes into rows.
        const positions = generateOrganicPositions(n, W, H, this.rnd);
        for (let index = 0; index < locs.length; index++) {
            locs[index].x = positions[index].x;
            locs[index].y = positions[index].y;
            this.locations.set(locs[index].id, locs[index]);
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
                candidates.push({
                    a: A.id,
                    b: B.id,
                    d: dist(A, B),
                    tieBreaker: this.rnd(),
                });
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

        // Add local, non-crossing edges until the graph has useful loops and
        // its leaves/degree-two corridors are under control. Scoring the full
        // candidate pool avoids the old failure mode where each node's nearest
        // choices were already consumed by the MST.
        const sortedMst = [...mstEdges].sort((a, b) => a.d - b.d);
        const median = sortedMst.length ? sortedMst[Math.floor(sortedMst.length / 2)].d : Infinity;
        const maxExtraLen = median * EXTRA_EDGE_LENGTH_RATIO;
        const planarLimit = Math.max(nodes.length - 1, nodes.length * 3 - 6);
        const targetEdgeCount = Math.min(
            planarLimit,
            Math.max(nodes.length - 1, Math.round(nodes.length * TARGET_EDGE_RATIO)),
        );
        const maxEdgeCount = Math.min(
            planarLimit,
            Math.max(targetEdgeCount, Math.round(nodes.length * MAX_EDGE_RATIO)),
        );

        while (this.edges.length < maxEdgeCount) {
            const metrics = analyzeGraph(this.locations, this.edges);
            const needsStructuralRepair =
                metrics.leafCount > TARGET_LEAF_COUNT ||
                metrics.longestCorridor > TARGET_CORRIDOR_LENGTH;
            if (this.edges.length >= targetEdgeCount && !needsStructuralRepair) break;

            const corridorPressure = new Map();
            for (const corridor of collectDegreeTwoCorridors(this.locations)) {
                if (corridor.length <= TARGET_CORRIDOR_LENGTH) continue;
                const pressure = corridor.length - TARGET_CORRIDOR_LENGTH;
                for (const nodeId of corridor.nodeIds.slice(1, -1)) {
                    const node = this.locations.get(String(nodeId));
                    if (node?.neighbors.size !== 2) continue;
                    corridorPressure.set(
                        String(nodeId),
                        Math.max(corridorPressure.get(String(nodeId)) || 0, pressure),
                    );
                }
            }

            let best = null;
            let bestScore = -Infinity;
            for (const candidate of candidates) {
                if (candidate.d > maxExtraLen) continue;
                const A = this.locations.get(String(candidate.a));
                const B = this.locations.get(String(candidate.b));
                if (!A || !B || A.neighbors.has(B.id)) continue;
                if (
                    A.neighbors.size >= MAX_NODE_DEGREE ||
                    B.neighbors.size >= MAX_NODE_DEGREE
                ) {
                    continue;
                }
                if (crossesExisting(A, B, this)) continue;

                const degreeScore =
                    (A.neighbors.size === 1 ? 7 : A.neighbors.size === 2 ? 2 : 0) +
                    (B.neighbors.size === 1 ? 7 : B.neighbors.size === 2 ? 2 : 0);
                const corridorScore =
                    (corridorPressure.get(String(A.id)) || 0) * 4 +
                    (corridorPressure.get(String(B.id)) || 0) * 4;
                const lengthPenalty = median > 0 ? (candidate.d / median) * 1.6 : 0;
                const score =
                    degreeScore +
                    corridorScore -
                    lengthPenalty +
                    candidate.tieBreaker * 0.25;

                if (score > bestScore) {
                    best = candidate;
                    bestScore = score;
                }
            }

            if (!best) break;
            linkNoCross(
                this.locations.get(String(best.a)),
                this.locations.get(String(best.b)),
                this,
            );
        }

        this._assignStreetNames();

        function linkNoCross(a, b, map) {
            // refuse if already linked
            if (a.id === b.id || a.neighbors.has(b.id)) return false;

            // crossing check against existing edges
            if (crossesExisting(a, b, map)) return false;

            // Travel minutes remain a separate gameplay value rather than a
            // direct conversion of display geometry.
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
            return true;
        }

        function crossesExisting(A, B, map) {
            for (const e of map.edges) {
                const C = map.locations.get(String(e.a));
                const D = map.locations.get(String(e.b));
                if (C.id === A.id || C.id === B.id || D.id === A.id || D.id === B.id) continue;
                if (segmentsIntersect(A, B, C, D)) return true;
            }
            return false;
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

    /**
     * Relax the initial planar drawing toward edge lengths implied by rolled
     * travel minutes. Topology and travel rolls stay unchanged; candidate
     * movements are accepted only while the drawing remains planar, bounded,
     * and collision-resistant.
     */
    _fitGeometryToTravelTimes(mapWidth, mapHeight) {
        const nodes = [...this.locations.values()];
        if (nodes.length < 2 || !this.edges.length) return;

        const originals = new Map(nodes.map((node) => [String(node.id), { x: node.x, y: node.y }]));
        const padding = Math.min(mapWidth, mapHeight) * 0.01;
        const desiredLength = (edge) =>
            TRAVEL_LENGTH_BASE + edge.minutes * TRAVEL_LENGTH_PER_MINUTE;

        const objective = () =>
            this.edges.reduce((sum, edge) => {
                const actual = dist(
                    this.locations.get(String(edge.a)),
                    this.locations.get(String(edge.b)),
                );
                const desired = desiredLength(edge);
                const relativeError = (actual - desired) / desired;
                return sum + relativeError * relativeError;
            }, 0);

        const minimumSpacing = () => {
            let minimum = Infinity;
            for (let left = 0; left < nodes.length; left++) {
                for (let right = left + 1; right < nodes.length; right++) {
                    minimum = Math.min(minimum, dist(nodes[left], nodes[right]));
                }
            }
            return minimum;
        };

        const orientation = (a, b, c) => {
            const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
            return value === 0 ? 0 : value > 0 ? 1 : -1;
        };
        const edgesCross = (a, b, c, d) =>
            orientation(a, b, c) !== orientation(a, b, d) &&
            orientation(c, d, a) !== orientation(c, d, b);
        const hasCrossings = () => {
            for (let left = 0; left < this.edges.length; left++) {
                const first = this.edges[left];
                for (let right = left + 1; right < this.edges.length; right++) {
                    const second = this.edges[right];
                    if (
                        first.a === second.a ||
                        first.a === second.b ||
                        first.b === second.a ||
                        first.b === second.b
                    ) {
                        continue;
                    }
                    if (
                        edgesCross(
                            this.locations.get(String(first.a)),
                            this.locations.get(String(first.b)),
                            this.locations.get(String(second.a)),
                            this.locations.get(String(second.b)),
                        )
                    ) {
                        return true;
                    }
                }
            }
            return false;
        };

        let score = objective();
        for (let iteration = 0; iteration < GEOMETRY_RELAXATION_STEPS; iteration++) {
            const forces = new Map(nodes.map((node) => [String(node.id), { x: 0, y: 0 }]));

            for (const edge of this.edges) {
                const a = this.locations.get(String(edge.a));
                const b = this.locations.get(String(edge.b));
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distance = Math.max(0.000001, Math.hypot(dx, dy));
                const error = (distance - desiredLength(edge)) / desiredLength(edge);
                const fx = (dx / distance) * error;
                const fy = (dy / distance) * error;
                forces.get(String(a.id)).x += fx;
                forces.get(String(a.id)).y += fy;
                forces.get(String(b.id)).x -= fx;
                forces.get(String(b.id)).y -= fy;
            }

            for (let left = 0; left < nodes.length; left++) {
                for (let right = left + 1; right < nodes.length; right++) {
                    const a = nodes[left];
                    const b = nodes[right];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const distance = Math.max(0.000001, Math.hypot(dx, dy));
                    if (distance >= MIN_GEOMETRY_SPACING + 1) continue;
                    const pressure = (MIN_GEOMETRY_SPACING + 1 - distance) * 0.8;
                    const fx = (dx / distance) * pressure;
                    const fy = (dy / distance) * pressure;
                    forces.get(String(a.id)).x -= fx;
                    forces.get(String(a.id)).y -= fy;
                    forces.get(String(b.id)).x += fx;
                    forces.get(String(b.id)).y += fy;
                }
            }

            for (const node of nodes) {
                const original = originals.get(String(node.id));
                const force = forces.get(String(node.id));
                force.x += (original.x - node.x) * 0.003;
                force.y += (original.y - node.y) * 0.003;
            }

            const before = new Map(nodes.map((node) => [String(node.id), { x: node.x, y: node.y }]));
            let accepted = false;
            for (let attempt = 0; attempt < 8 && !accepted; attempt++) {
                const step = 0.85 / 2 ** attempt;
                for (const node of nodes) {
                    const previous = before.get(String(node.id));
                    const force = forces.get(String(node.id));
                    const magnitude = Math.hypot(force.x, force.y);
                    const scale = magnitude > 0.45 ? 0.45 / magnitude : 1;
                    node.x = clampCoordinate(
                        previous.x + force.x * scale * step,
                        padding,
                        mapWidth - padding,
                    );
                    node.y = clampCoordinate(
                        previous.y + force.y * scale * step,
                        padding,
                        mapHeight - padding,
                    );
                }

                const nextScore = objective();
                if (
                    nextScore <= score + 1e-12 &&
                    minimumSpacing() > MIN_GEOMETRY_SPACING &&
                    !hasCrossings()
                ) {
                    score = nextScore;
                    accepted = true;
                }
            }

            if (!accepted) {
                for (const node of nodes) {
                    const previous = before.get(String(node.id));
                    node.x = previous.x;
                    node.y = previous.y;
                }
            }
        }

        function clampCoordinate(value, min, max) {
            return Math.max(min, Math.min(max, value));
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
            getNeighbors: (locId) => this.locations.get(String(locId))?.neighbors.keys() || [],
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

        const MAX_LEN = 4;

        const continuation = (previousNodeId, currentNodeId, runNodeIds) => {
            const previous = this.locations.get(String(previousNodeId));
            const current = this.locations.get(String(currentNodeId));
            const incident = nodeEdges.get(String(currentNodeId)) || [];
            const options = [];

            for (const edge of incident) {
                if (!unassigned.has(edge)) continue;
                const otherNodeId = String(
                    edge.a === String(currentNodeId) ? edge.b : edge.a,
                );
                if (runNodeIds.has(otherNodeId)) continue;
                const other = this.locations.get(otherNodeId);
                if (!previous || !current || !other) continue;

                const incomingX = current.x - previous.x;
                const incomingY = current.y - previous.y;
                const outgoingX = other.x - current.x;
                const outgoingY = other.y - current.y;
                const denominator =
                    Math.hypot(incomingX, incomingY) * Math.hypot(outgoingX, outgoingY);
                const alignment = denominator
                    ? (incomingX * outgoingX + incomingY * outgoingY) / denominator
                    : -1;
                options.push({ edge, otherNodeId, alignment });
            }

            options.sort(
                (left, right) =>
                    right.alignment - left.alignment ||
                    undirectedEdgeKey(left.edge.a, left.edge.b).localeCompare(
                        undirectedEdgeKey(right.edge.a, right.edge.b),
                    ),
            );
            const best = options[0];
            if (!best) return null;

            // Degree-two bends may curve substantially; at a junction require
            // the continuation to be recognisably straight.
            const threshold = (degree.get(String(currentNodeId)) || 0) >= 3 ? 0.35 : -0.25;
            return best.alignment >= threshold ? best : null;
        };

        while (unassigned.size > 0) {
            // Start at the least-connected available edge so leaf streets and
            // connectors are resolved before dense intersections.
            const availableStarts = [...unassigned];
            const lowestDegreeSum = Math.min(
                ...availableStarts.map(
                    (edge) => (degree.get(edge.a) || 0) + (degree.get(edge.b) || 0),
                ),
            );
            const preferredStarts = availableStarts.filter(
                (edge) =>
                    (degree.get(edge.a) || 0) + (degree.get(edge.b) || 0) ===
                    lowestDegreeSum,
            );
            const startEdge = preferredStarts[(rnd() * preferredStarts.length) | 0];
            const runEdges = [startEdge];
            unassigned.delete(startEdge);

            const runNodeIds = new Set([String(startEdge.a), String(startEdge.b)]);
            const sides = [
                { previousNodeId: String(startEdge.b), currentNodeId: String(startEdge.a) },
                { previousNodeId: String(startEdge.a), currentNodeId: String(startEdge.b) },
            ];

            while (runEdges.length < MAX_LEN) {
                const options = sides
                    .map((side, sideIndex) => ({
                        sideIndex,
                        option: continuation(
                            side.previousNodeId,
                            side.currentNodeId,
                            runNodeIds,
                        ),
                    }))
                    .filter((candidate) => candidate.option);
                if (!options.length) break;
                options.sort(
                    (left, right) =>
                        right.option.alignment - left.option.alignment ||
                        left.sideIndex - right.sideIndex,
                );

                const selected = options[0];
                runEdges.push(selected.option.edge);
                unassigned.delete(selected.option.edge);
                runNodeIds.add(selected.option.otherNodeId);
                const side = sides[selected.sideIndex];
                side.previousNodeId = side.currentNodeId;
                side.currentNodeId = selected.option.otherNodeId;
            }

            let streetName = null;

            // A final connector may join an already named path only when it
            // extends that path at an endpoint. This removes needless
            // one-edge names without creating branching streets.
            if (runEdges.length === 1) {
                const lone = runEdges[0];
                const reuseOptions = [];
                for (const sharedNodeId of [String(lone.a), String(lone.b)]) {
                    const loneOtherId = String(
                        String(lone.a) === sharedNodeId ? lone.b : lone.a,
                    );
                    const sharedNode = this.locations.get(sharedNodeId);
                    const loneOther = this.locations.get(loneOtherId);

                    for (const namedEdge of nodeEdges.get(sharedNodeId) || []) {
                        if (namedEdge === lone || unassigned.has(namedEdge)) continue;
                        const namedStreet = this.edges.filter(
                            (edge) =>
                                edge !== lone &&
                                !unassigned.has(edge) &&
                                edge.streetName === namedEdge.streetName,
                        );
                        if (namedStreet.length >= MAX_LEN) continue;

                        const incidentCount = namedStreet.filter(
                            (edge) =>
                                String(edge.a) === sharedNodeId ||
                                String(edge.b) === sharedNodeId,
                        ).length;
                        if (incidentCount !== 1) continue;

                        const namedOtherId = String(
                            String(namedEdge.a) === sharedNodeId
                                ? namedEdge.b
                                : namedEdge.a,
                        );
                        const namedOther = this.locations.get(namedOtherId);
                        if (!sharedNode || !loneOther || !namedOther) continue;

                        const incomingX = sharedNode.x - namedOther.x;
                        const incomingY = sharedNode.y - namedOther.y;
                        const outgoingX = loneOther.x - sharedNode.x;
                        const outgoingY = loneOther.y - sharedNode.y;
                        const denominator =
                            Math.hypot(incomingX, incomingY) *
                            Math.hypot(outgoingX, outgoingY);
                        const alignment = denominator
                            ? (incomingX * outgoingX + incomingY * outgoingY) /
                              denominator
                            : -1;
                        if (alignment >= -0.25) {
                            reuseOptions.push({
                                streetName: namedEdge.streetName,
                                alignment,
                            });
                        }
                    }
                }
                reuseOptions.sort((left, right) => right.alignment - left.alignment);
                streetName = reuseOptions[0]?.streetName ?? null;
            }

            if (!streetName) {
                const startLoc = this.locations.get(String(startEdge.a));
                const def = pickStreetDefForRun(startLoc, usedStreetKeys, rnd);
                streetName = def ? def.name : `Road ${fallbackIndex++}`;
                if (def) usedStreetKeys.add(def.key);
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

    getGraphMetrics() {
        return analyzeGraph(this.locations, this.edges);
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
     * @param {Object} placeData - data for the Place constructor ({id,key,name,props,unlocked,...})
     * @param {string|number} locationId - target location id (overrides placeData.locationId)
     * @returns {Place|null} the created Place or null if location not found
     */
    createPlaceAt(placeData, locationId) {
        if (!placeData) return null;
        const locId = String(locationId != null ? locationId : placeData.locationId);
        const loc = this.locations.get(locId);
        if (!loc) return null;

        const { id, key, name, props = {}, unlocked = true } = placeData;

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
            unlocked,
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
