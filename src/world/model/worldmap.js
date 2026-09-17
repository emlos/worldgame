import { makeRNG } from "../../shared/util/random.js";
import { Location } from "./location.js";
import { Place } from "./place.js";
import { Street } from "./street.js";
import { PLACE_REGISTRY } from "../data/place.js";
import { finitePositive } from "../../shared/util/util.js";
import { analyzeGraph } from "./worldMapGraph.js";
import { generateWorldMap } from "./worldMapGenerator.js";

const MS_PER_MINUTE = 60 * 1000;

function addTravelTime(atTime, minutes) {
    if (!(atTime instanceof Date) || !Number.isFinite(atTime.getTime())) return atTime;
    return new Date(atTime.getTime() + minutes * MS_PER_MINUTE);
}

export class WorldMap {
    /**
     * @param {Object} opts
     * @param {Function} opts.rnd   - RNG function
     * @param {number} mapWidth - span of map in local coordinates
     * @param {number} mapHeight - height of map in local coordinates
     */
    constructor({ rnd = null, mapWidth = 100, mapHeight = 50, placeRegistry = PLACE_REGISTRY } = {}) {
        mapWidth = finitePositive(mapWidth, "World map width");
        mapHeight = finitePositive(mapHeight, "World map height");

        this.rnd = rnd ?? makeRNG();
        const generated = generateWorldMap({
            rnd: this.rnd,
            mapWidth,
            mapHeight,
            placeRegistry,
        });
        this.locations = generated.locations;
        this.edges = generated.edges;
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
            // 0-30 min: no penalty (1.0)
            // 30-120 min: linearly from 1.0 down to 0.3
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
