function storyObject(game, path) {
  let value = game.story;
  for (const segment of path) {
    const current = value[segment];
    if (current === undefined) value[segment] = {};
    else if (!current || typeof current !== "object" || Array.isArray(current)) {
      throw new TypeError(
        `Timer cannot write through non-object story path 'story.${path.join(".")}'`,
      );
    }
    value = value[segment];
  }
  return value;
}

function addStoryNumber(game, path, amount) {
  const parent = storyObject(game, path.slice(0, -1));
  const key = path.at(-1);
  const current = parent[key] ?? 0;
  if (!Number.isFinite(current)) {
    throw new TypeError(`Timer story value 'story.${path.join(".")}' is not a number`);
  }
  const next = current + amount;
  if (!Number.isFinite(next)) throw new RangeError("Timer produced a non-finite story value");
  parent[key] = next;
  return next;
}

export const TIMER_DEFINITIONS = Object.freeze({
  "rent.weekly": Object.freeze({
    schedule: Object.freeze({ kind: "interval", days: 7 }),
    repeat: true,
    onDue(game) {
      addStoryNumber(game, ["rent", "debt"], 200);
      addStoryNumber(game, ["rent", "chargesIssued"], 1);
      game.addReminder("rent_due");
    },
  }),
});
