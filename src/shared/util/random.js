const UINT32_RANGE = 0x100000000;

/** Normalize any numeric seed to an unsigned 32-bit integer. */
export const normalizeSeed = (seed = Date.now()) => {
    const n = Number(seed);
    return Number.isFinite(n) ? n >>> 0 : Date.now() >>> 0;
};

/** Roll a new master seed once at game creation. */
export const rollSeed = () => {
    if (globalThis.crypto?.getRandomValues) {
        const value = new Uint32Array(1);
        globalThis.crypto.getRandomValues(value);
        return value[0] >>> 0;
    }
    return normalizeSeed(Date.now());
};

/**
 * Deterministically derive a new 32-bit seed from a master seed + stable label.
 * This does not consume any RNG state, so adding a new subsystem stream does not
 * shift existing streams.
 */
export const deriveSeed = (seed, label) => {
    let h = (2166136261 ^ normalizeSeed(seed)) >>> 0;
    const text = String(label);

    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }

    // Final avalanche so similar labels do not produce visibly related seeds.
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
};

/**
 * Small stateful seeded RNG. Returns values in [0, 1), never exactly 1.
 * The function carries getState/setState so save files can resume mid-stream.
 */
export const makeRNG = (seed = rollSeed()) => {
    let s = normalizeSeed(seed);

    const rnd = () => {
        // Numerical Recipes LCG
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / UINT32_RANGE;
    };

    rnd.getState = () => s >>> 0;
    rnd.setState = (state) => {
        const n = Number(state);
        if (!Number.isFinite(n)) throw new Error(`Invalid RNG state: ${state}`);
        s = n >>> 0;
        return s;
    };

    return rnd;
};

/**
 * A deterministic collection of independent named RNG streams.
 * Every stream is derived from the same master seed without consuming another
 * stream. Calling stream("weather") can therefore never shift stream("calendar").
 */
export class RandomStreams {
    constructor(seed = rollSeed()) {
        this.seed = normalizeSeed(seed);
        this._streams = new Map();
    }

    stream(name) {
        const key = String(name);
        let rnd = this._streams.get(key);
        if (!rnd) {
            rnd = makeRNG(deriveSeed(this.seed, key));
            this._streams.set(key, rnd);
        }
        return rnd;
    }

    toJSON() {
        return {
            seed: this.seed,
            states: Object.fromEntries(
                [...this._streams.entries()].map(([name, rnd]) => [name, rnd.getState()]),
            ),
        };
    }

    restoreJSON(data) {
        if (!data || normalizeSeed(data.seed) !== this.seed) {
            throw new Error("RandomStreams seed does not match save data");
        }

        this._streams.clear();
        for (const [name, state] of Object.entries(data.states || {})) {
            const rnd = this.stream(name);
            rnd.setState(state);
        }
        return this;
    }

    static fromJSON(data) {
        return new RandomStreams(data?.seed).restoreJSON(data);
    }
}

/** Stateless deterministic [0, 1) value for read-only noise/hash use. */
export const keyedRandom01 = (seed, key) => deriveSeed(seed, key) / UINT32_RANGE;

export const pick = (arr, rnd) => {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return arr[Math.floor(rnd() * arr.length)];
};

export const randInt = (min, max, rnd) => {
    const lo = Math.ceil(Number(min));
    const hi = Math.floor(Number(max));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) {
        throw new Error(`Invalid randInt range: ${min}..${max}`);
    }
    return Math.floor(rnd() * (hi - lo + 1)) + lo;
};

export const approxNormal01 = (rnd) => (rnd() + rnd() + rnd()) / 3;

/**
 * Weighted choice helper.
 * - items: array of anything
 * - rnd: function returning [0..1); required so callers choose their RNG explicitly
 * - weightFn: function(item) -> number (defaults to item.weight ?? 1)
 *
 * Returns the chosen item, or null if nothing has positive weight.
 */
export const weightedPick = (
    items,
    rnd,
    weightFn = (x) => (x && x.weight != null ? x.weight : 1),
) => {
    if (!items || !items.length) return null;
    if (typeof rnd !== "function") {
        throw new Error("weightedPick expects an rnd() function");
    }

    let total = 0;
    for (const it of items) {
        const w = Number(weightFn(it));
        if (Number.isFinite(w) && w > 0) total += w;
    }
    if (total <= 0) return null;

    let r = rnd() * total;
    for (const it of items) {
        const w = Number(weightFn(it));
        if (!Number.isFinite(w) || w <= 0) continue;
        r -= w;
        if (r <= 0) return it;
    }

    // Floating-point fallback.
    for (let i = items.length - 1; i >= 0; i--) {
        const w = Number(weightFn(items[i]));
        if (Number.isFinite(w) && w > 0) return items[i];
    }
    return null;
};
