// --------------------------
// Utilities
// --------------------------

/** Clamp a number between min and max. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Deep freeze (shallow for arrays/objects inside). Useful for immutables. */
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