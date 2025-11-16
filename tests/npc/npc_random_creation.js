function init() {
  const NAME_POOLS = {
    masc: ["Alex", "Ben", "Carter", "Diego", "Ethan", "Felix", "Hiro", "Ivan", "Jonas", "Kai"],
    fem: ["Ada", "Bianca", "Clara", "Dina", "Eva", "Freya", "Hana", "Iris", "Julia", "Kira"],
    nb: ["Cameron", "Chandler", "Dakota", "Darcy", "Drew", "Hayden", "Kim", "Taylor", "Ash", "Blair", "Carey", "Devon", "Elliott", "Finley", "Harper", "Indigo", "Jules", "Kit", "Taylor", "Blake", "Blue", "Larkin", "Sasha", "Mickey", "North", "Quincy", "Ramsey", "Hope", "Sky", "Salem", "Tavi", "Valentine", "Milo", "Austin", "Brooke"],
    surnames: ["Morgan", "Rivera", "Kowalski", "Khan", "Okoye", "Novak", "Nguyen", "Garcia", "Patel", "Silva"],
  };

  const PRONOUN_BY_GENDER = {
    [Gender.M]: PronounSets.HE_HIM,
    [Gender.F]: PronounSets.SHE_HER,
    [Gender.NB]: PronounSets.THEY_THEM,
  };

  const STAT_KEYS = ["looks", "strength", "intelligence"];

  const randomStats = (rnd) => {
    const stats = {};
    for (const k of STAT_KEYS) {
      // Base around 3–6 with slight bell-shape
      const v = 3 + Math.round(approxNormal01(rnd) * 3);
      stats[k] = clamp(v, 1, 10);
    }
    return stats;
  };

  const randomClothingItem = (slot, gender, rnd) => {
    // slight bias: masc -> negative, fem -> positive, nb -> near zero
    let bias = 0;
    if (gender === Gender.M) bias = -0.2 + (rnd() - 0.5) * 0.2;
    else if (gender === Gender.F) bias = 0.2 + (rnd() - 0.5) * 0.2;
    else bias = (rnd() - 0.5) * 0.2;

    return new Clothing({
      id: `${slot}-${Math.floor(rnd() * 1e6)}`,
      slot,
      image: `${slot}/default.png`,
      durability: Math.max(0.3, approxNormal01(rnd)),
      wetness: Math.max(0, approxNormal01(rnd) - 0.3),
      color: randomHexColor(rnd),
      genderBias: clamp(bias, -1, 1),
    });
  };

  const randomNPC = (opts = {}) => {
    const {
      seed,
      gender = pick([Gender.M, Gender.F, Gender.NB], makeRNG((seed ?? Date.now()) + 7)),
      pronouns,
      ageMin = 16,
      ageMax = 80,
      equipRatio = 0.6,
      nameStyle = "auto",
      traits = [],
      stats,
    } = opts;

    const rnd = makeRNG(seed ?? Date.now());

    // Name
    const style = nameStyle === "auto" ? (gender === Gender.M ? "masc" : gender === Gender.F ? "fem" : "nb") : nameStyle;
    const first = pick(NAME_POOLS[style] || NAME_POOLS.nb, rnd);
    const last = pick(NAME_POOLS.surnames, rnd);
    const name = `${first} ${last}`;

    // Age & stats
    const age = randInt(ageMin, ageMax, rnd);
    const baseStats = stats ? { ...stats } : randomStats(rnd);

    // Build NPC
    const npc = new NPC({
      name,
      age,
      stats: baseStats,
      gender,
      pronouns: pronouns || PRONOUN_BY_GENDER[gender] || PronounSets.THEY_THEM,
    });

    // Traits (optional preset array)
    for (const t of traits) npc.addTrait(t);

    // Clothing
    for (const slot in WearSlot) {
      if (rnd() < equipRatio) npc.equip(randomClothingItem(WearSlot[slot], gender, rnd));
    }

    return npc;
  };

  const npc = randomNPC(); // helpers + randomNPC() are exposed by your script

  // ---- tiny DOM helpers ----
  const byId = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) k === "class" ? (n.className = v) : k === "html" ? (n.innerHTML = v) : n.setAttribute(k, v);
    for (const c of kids) n.append(c);
    return n;
  };
  const table = (rows, headers = []) => {
    const t = el("table");
    if (headers.length) {
      const thead = el("thead");
      const tr = el("tr");
      headers.forEach((h) => tr.append(el("th", { html: h })));
      thead.append(tr);
      t.append(thead);
    }
    const tbody = el("tbody");
    rows.forEach((r) => {
      const tr = el("tr");
      r.forEach((cell) => tr.append(el("td", { html: cell ?? "" })));
      tbody.append(tr);
    });
    t.append(tbody);
    return t;
  };
  const colorSwatch = (hex) => `<span class="swatch" style="background:${hex}"></span> <code>${hex}</code>`;

  // ---- render ----
  // status
  byId("status").textContent = "fresh NPC generated";

  // Identity
  byId("identity").innerHTML = "";
  byId("identity").append(el("h2", { html: "Identity" }));
  byId("identity").append(
    table(
      [
        ["Name", npc.name],
        ["Age", String(npc.age)],
        ["Gender", `<code>${npc.gender}</code>`],
        ["Pronouns", `<code>${npc.pronouns.subject}/${npc.pronouns.object}/${npc.pronouns.dependent}/${npc.pronouns.independent}/${npc.pronouns.reflexive}</code>`],
        ["Perceived Gender", `<code>${npc.perceivedGender.label}</code> (score: ${npc.perceivedGender.score.toFixed(2)})`],
      ],
      ["Property", "Value"]
    )
  );

  // Stats
  const statRows = Object.keys(npc.stats).map((name) => {
    const base = npc.getStatBase(name);
    const val = npc.getStatValue(name);
    return [name, String(base), String(Number(val.toFixed ? val.toFixed(2) : val))];
  });
  byId("stats").innerHTML = "";
  byId("stats").append(el("h2", { html: "Stats" }));
  byId("stats").append(table(statRows, ["Stat", "Base", "Computed Value"]));

  // Traits
  const traitRows = [...npc.traits.values()].map((t) => [`<code>${t.id}</code>`, t.description || "-", String(t.has(npc))]);
  byId("traits").innerHTML = "";
  byId("traits").append(el("h2", { html: "Traits" }));
  byId("traits").append(table(traitRows.length ? traitRows : [["-", "-", "-"]], ["ID", "Description", "Active?"]));

  // Relationships (with other NPCs)
  const relRows = [...npc.relationships.values()].map((r) => [r.npcId, String(r.met), r.score.toFixed(2)]);
  byId("relationships").innerHTML = "";
  byId("relationships").append(el("h2", { html: "Relationships" }));
  byId("relationships").append(table(relRows.length ? relRows : [["-", "-", "-"]], ["NPC ID", "Met", "Score (-1..1)"]));

  // Clothing
  const clothesRows = [...npc.clothing.entries()].map(([slot, item]) => [
    slot,
    item.id || "-",
    item.image ? `<img class="icon" src="${item.image}" alt=""> <code>${item.image}</code>` : "-",
    item.durability.toFixed(2),
    item.wetness.toFixed(2),
    colorSwatch(item.color),
    item.genderBias.toFixed(2),
  ]);
  byId("clothing").innerHTML = "";
  byId("clothing").append(el("h2", { html: "Clothing" }));
  byId("clothing").append(table(clothesRows.length ? clothesRows : [["-", "-", "-", "-", "-", "-", "-"]], ["Slot", "ID", "Image", "Durability", "Wetness", "Color", "Gender Bias"]));
}

window.addEventListener("DOMContentLoaded", init);
