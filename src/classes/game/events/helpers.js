/* ------------------------------------------------------------------
   CONDITION HELPERS
   These helpers return (game) => boolean functions you can reuse.
   This is what makes scenes nicer to write.
-------------------------------------------------------------------*/

/**
 * Only during specific hours of the day.
 * hours are 0–23, inclusive/exclusive like [from, to)
 */
export function duringHours(fromHour, toHour) {
  return (game) => {
    const h = game.world.time.date.getHours();
    if (fromHour <= toHour) {
      return h >= fromHour && h < toHour;
    }
    // wraps around midnight
    return h >= fromHour || h < toHour;
  };
}

/**
 * Require a player flag to be true-ish.
 */
export function requiresPlayerFlag(flagName) {
  return (game) => !!game.player.flags?.[flagName];
}

/**
 * Require a game-level flag (e.g. "town_event_unlocked").
 */
export function requiresGameFlag(flagName) {
  return (game) => !!game.flags?.[flagName];
}

/**
 * Require a player stat to be >= some value.
 * Adjust depending on how you store stats.
 */
export function statAtLeast(statName, value) {
  return (game) => {
    const stat = game.player.stats?.[statName];
    if (!stat) return false;
    const v = typeof stat === "number" ? stat : stat.value;
    return v >= value;
  };
}

/**
 * Require a specific weather type (if you have weather).
 * Adjust to your weather system.
 */
export function requiresWeather(type) {
  return (game) => game.world.weather?.type === type;
}

/**
 * Only fire if the player HAS NOT seen this scene yet.
 * (Useful even when once=false, e.g., for alternate branches.)
 */
export function firstTimeScene(sceneId) {
  return (game) => !game.flags?.seenScenes?.[sceneId];
}

// Always true
export const always = () => true;

// AND of multiple conditions
export const all =
  (...conds) =>
  (state) =>
    conds.every((c) => !c || c(state));

// OR of multiple conditions
export const any =
  (...conds) =>
  (state) =>
    conds.some((c) => c && c(state));

// Negate a condition
export const not = (cond) => (state) => !cond(state);
