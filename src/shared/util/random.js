
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