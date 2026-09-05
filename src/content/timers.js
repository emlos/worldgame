function literal(value) {
  return Object.freeze({ type: "literal", value });
}

function addStory(path, amount) {
  return Object.freeze({
    op: "add",
    path: Object.freeze(["story", ...path]),
    value: literal(amount),
  });
}

export const TIMER_DEFINITIONS = Object.freeze({
  "rent.weekly": Object.freeze({
    schedule: Object.freeze({ kind: "interval", days: 7 }),
    repeat: true,
    effects: Object.freeze([
      addStory(["rent", "debt"], 200),
      addStory(["rent", "chargesIssued"], 1),
      Object.freeze({ op: "reminder", action: "add", id: "rent_due" }),
    ]),
  }),
});
