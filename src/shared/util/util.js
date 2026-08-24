// --------------------------
// Utilities
// --------------------------

/** Clamp a number between min and max. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** clamp number between 0 and 1 */
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Deep freeze (shallow for arrays/objects inside). */
export const deepFreeze = (obj) => {
    if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
        Object.freeze(obj);
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (v && typeof v === "object") Object.freeze(v);
        }
    }
    return obj;
};

export const normalize = (weights) => {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    for (const k in weights) weights[k] /= sum;
    return weights;
};

export function finiteNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        throw new TypeError(`${label} must be a finite number`);
    }
    return number;
}

export function finiteNonNegative(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        throw new RangeError(`${label} must be a finite number greater than or equal to 0`);
    }
    return number;
}

export function finitePositive(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
        throw new RangeError(`${label} must be a finite number greater than 0`);
    }
    return number;
}
