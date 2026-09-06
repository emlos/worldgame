export function clearActiveStory(game) {
  if (game.currentStory === null && game.storyContinuations.length === 0) return;
  game.currentStory = null;
  game.storyContinuations.length = 0;
  game.storyRevision += 1;
}

export function setStoryFlag(game, flag, value = true) {
  const key = String(flag);
  if (!value && (key === "journal" || key.startsWith("journal."))) {
    throw new Error(`Journal flag ${key} is irreversible and cannot be unset.`);
  }
  if (value) game.flags.add(key);
  else game.flags.delete(key);
}

export function clearStoryFlag(game, flag) {
  const key = String(flag);
  if (key === "journal" || key.startsWith("journal.")) {
    throw new Error(`Journal flag ${key} is irreversible and cannot be unset.`);
  }
  game.flags.delete(key);
}

export function hasStoryFlag(game, flag) {
  return game.flags.has(String(flag));
}

export function setDailyFlag(game, flag, value = true) {
  const key = String(flag);
  if (value) game.dailyFlags.add(key);
  else game.dailyFlags.delete(key);
}

export function clearDailyFlag(game, flag) {
  game.dailyFlags.delete(String(flag));
}

export function hasDailyFlag(game, flag) {
  return game.dailyFlags.has(String(flag));
}
