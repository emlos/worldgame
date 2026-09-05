// --------------------------
// Pronouns & Gender
// --------------------------

export const Gender = Object.freeze({
  M: "male",
  F: "female",
  NB: "non-binary",
});

/** Common pronoun sets; can be extended or replaced per player. */
export const PronounSets = Object.freeze({
  SHE_HER: {
    subject: "she",
    object: "her",
    dependent: "her",
    independent: "hers",
    reflexive: "herself",
  },
  HE_HIM: {
    subject: "he",
    object: "him",
    dependent: "his",
    independent: "his",
    reflexive: "himself",
  },
  THEY_THEM: {
    subject: "they",
    object: "them",
    dependent: "their",
    independent: "theirs",
    reflexive: "themself",
  },
});

export const Nouns = Object.freeze({
  M: ["male", "man", "guy", "boy"],
  F: ["female", "woman", "girl"],
  NB: ["person", "stranger"],
  AGE: {
    child: ["child", "kid", "youngster"],
    teen: ["teenager", "teen", "adolescent", "tween"],
    adult: ["adult", "grown-up", "person"],
    elder: ["elder", "senior", "old person"],
  },
  LOVE: {
    M: ["boyfriend", "partner"],
    F: ["girlfriend", "wife", "partner"],
    NB: ["partner", "significant other"],
  },
});
