//TODO: move those to pronouns.js and import them here
const PLAYER_PRONOUNS = Object.freeze({
  subject: "you",
  object: "you",
  dependent: "your",
  independent: "yours",
  reflexive: "yourself",
});

const FALLBACK_PRONOUNS = Object.freeze({
  subject: "they",
  object: "them",
  dependent: "their",
  independent: "theirs",
  reflexive: "themself",
});

export function capitalizeEncounterText(value) {
  const text = String(value || "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

export function encounterPronouns(context, actorId) {
  if (actorId === "player") return PLAYER_PRONOUNS;
  return context.combatants?.[actorId]?.actor?.pronouns || FALLBACK_PRONOUNS;
}

export function encounterPronoun(context, actorId, form, { sentence = false } = {}) {
  const value = encounterPronouns(context, actorId)[form] || FALLBACK_PRONOUNS[form];
  return sentence ? capitalizeEncounterText(value) : value;
}

export function encounterVerb(context, actorId, singular, plural) {
  const subject = encounterPronoun(context, actorId, "subject").toLowerCase();
  return actorId === "player" || subject === "they" ? plural : singular;
}
