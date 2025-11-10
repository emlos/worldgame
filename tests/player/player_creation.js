function init() {
  const defaultStats = () => ({ looks: 5, strength: 3, intelligence: 4 });

  const SAMPLE_TRAITS = {
    CHARISMATIC: new Trait({
      id: "charismatic",
      description: "People tend to like you; +2 looks, +10% looks multiplier.",
      statMods: { looks: { add: [2], mult: [1.1] } },
    }),
    GYM_GOER: new Trait({
      id: "gym_goer",
      description: "+1 strength per session (abstracted here as +1 flat)",
      statMods: { strength: { add: [1] } },
    }),
  };

  const player = new Player({
    stats: defaultStats(),
    gender: Gender.NB,
    pronouns: PronounSets.THEY_THEM,
    appearance: { head: "head/1.png", body: "body/1.png", face: "head/1.png", hair: "hair/1.png" },
    skinTone: "#d2a679",
    eyeColor: "#5b7fa6",
    hairColor: "#4b3621",
  });

  player.addTrait(SAMPLE_TRAITS.CHARISMATIC);
  console.log("Looks (base):", player.getStatBase("looks"));
  console.log("Looks (final):", player.getStatValue("looks"));

  // clothing + perceived gender
  player.equip(new Clothing({ id: "sun-hat", slot: WearSlot.HEAD, image: "assets/hat.png", genderBias: +0.3 }));
  console.log("Perceived gender:", player.perceivedGender);

  console.log(player)
}

window.addEventListener("DOMContentLoaded", init)