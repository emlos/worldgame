export const makeRNG = (seed = Date.now()) => {
  let s = (seed >>> 0) || 1;
  return () => {
    // Numerical Recipes LCG
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

export const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length]; //pick one of array
export const randInt = (min, max, rnd) => Math.floor(rnd() * (max - min + 1)) + min; //random number
export const approxNormal01 = (rnd) => (rnd() + rnd() + rnd()) / 3; // tri-sample average

/**
 * Weighted choice helper.
 * - items: array of anything
 * - rnd: function returning [0..1) (defaults to Math.random)
 * - weightFn: function(item) -> number (defaults to item.weight ?? 1)
 *
 * Returns the chosen item, or null if nothing has positive weight.
 */
export const weightedPick = (items, rnd = Math.random, weightFn = (x) => (x && x.weight != null ? x.weight : 1)) => {
  if (!items || !items.length) return null;

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

  // Fallback (floating point edge cases)
  for (let i = items.length - 1; i >= 0; i--) {
    const w = Number(weightFn(items[i]));
    if (Number.isFinite(w) && w > 0) return items[i];
  }
  return null;
};
