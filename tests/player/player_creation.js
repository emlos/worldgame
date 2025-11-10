function init() {
  // ------- Demo data -------
  const defaultStats = () => ({ looks: 5, strength: 3, intelligence: 4 });

  const TRAITS = {
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

  const p = new Player({ stats: defaultStats(), skinTone: "#d4a373", eyeColor: "#4d6fa9", hairColor: "#3a2a1a", gender: Gender.NB, pronouns: PronounSets.THEY_THEM });
  p.addTrait(TRAITS.CHARISMATIC);
  p.addTrait(TRAITS.GYM_GOER);
  p.setMeterSkill("logic", 0.35);
  p.setFlagSkill("lockpicking", false);
  p.setRelationship({ npcId: "npc-1", met: true, score: 0.2 });
  p.setRelationship({ npcId: "npc-2", met: false, score: -0.3 });
  p.equip(new Clothing({ id: "sun-hat", slot: WearSlot.HEAD, image: "assets/hat.png", genderBias: +0.25, color: "#e7d29c" }));
  p.equip(new Clothing({ id: "jeans", slot: WearSlot.LOWER, image: "assets/jeans.png", genderBias: -0.1, color: "#1f3555" }));

  // ------- Rendering helpers -------
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
      r.forEach((cell) => {
        tr.append(el(r.isHeader ? "th" : "td", { html: cell ?? "" }));
      });
      tbody.append(tr);
    });
    t.append(tbody);
    return t;
  };
  const colorSwatch = (hex) => `<span class="swatch" style="background:${hex}"></span> <code>${hex}</code>`;

  function render() {
    // Identity
    byId("identity").innerHTML = "";
    byId("identity").append(el("h2", { html: "Identity" }));
    byId("identity").append(
      table(
        [
          ["Gender", `<code>${p.gender}</code>`],
          ["Pronouns", `<code>${p.pronouns.subject}/${p.pronouns.object}/${p.pronouns.dependent}/${p.pronouns.independent}/${p.pronouns.reflexive}</code>`],
          ["Perceived Gender", `<code>${p.perceivedGender.label}</code> (score: ${p.perceivedGender.score.toFixed(2)})`],
        ],
        ["Property", "Value"]
      )
    );

    // Appearance
    byId("appearance").innerHTML = "";
    byId("appearance").append(el("h2", { html: "Appearance" }));
    byId("appearance").append(
      table(
        [
          ["Head", `<code>${p.appearance.head}</code>`],
          ["Face", `<code>${p.appearance.face}</code>`],
          ["Hair", `<code>${p.appearance.hair}</code>`],
          ["Body (immutable)", `<code>${p.body}</code>`],
          ["Skin Tone", colorSwatch(p.skinTone)],
          ["Eye Color", colorSwatch(p.eyeColor)],
          ["Hair Color", colorSwatch(p.hairColor)],
        ],
        ["Property", "Value"]
      )
    );

    // Stats
    const statRows = Object.keys(p.stats).map((name) => {
      const base = p.getStatBase(name);
      const val = p.getStatValue(name);
      return [name, String(base), String(Number(val.toFixed ? val.toFixed(2) : val))];
    });
    byId("stats").innerHTML = "";
    byId("stats").append(el("h2", { html: "Stats" }));
    byId("stats").append(table(statRows, ["Stat", "Base", "Computed Value"]));

    // Traits
    const traitRows = [...p.traits.values()].map((t) => [`<code>${t.id}</code>`, t.description || "-", String(t.has(p))]);
    byId("traits").innerHTML = "";
    byId("traits").append(el("h2", { html: "Traits" }));
    byId("traits").append(table(traitRows, ["ID", "Description", "Active?"]));

    // Skills
    const skillRows = [...p.skills.entries()].map(([name, sk]) => [name, sk.type, sk.type === "meter" ? sk.value.toFixed(2) : String(!!sk.value)]);
    byId("skills").innerHTML = "";
    byId("skills").append(el("h2", { html: "Skills" }));
    byId("skills").append(table(skillRows, ["Skill", "Type", "Value"]));

    // Relationships
    const relRows = [...p.relationships.values()].map((r) => [r.npcId, String(r.met), r.score.toFixed(2)]);
    byId("relationships").innerHTML = "";
    byId("relationships").append(el("h2", { html: "Relationships" }));
    byId("relationships").append(table(relRows, ["NPC ID", "Met", "Score (-1..1)"]));

    // Clothing
    const clothesRows = [...p.clothing.entries()].map(([slot, item]) => [
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
    byId("clothing").append(table(clothesRows, ["Slot", "ID", "Image", "Durability", "Wetness", "Color", "Gender Bias"]));
  }

  // Buttons
  byId("btnTan").addEventListener("click", () => {
    p.tan(0.05);
    byId("status").textContent = "tanned +0.05";
    render();
  });
  byId("btnLoseTan").addEventListener("click", () => {
    p.loseTan(0.05);
    byId("status").textContent = "lost tan 0.05";
    render();
  });
  byId("btnImproveInt").addEventListener("click", () => {
    p.improveSkill("logic", 0.1);
    byId("status").textContent = "logic +0.10";
    render();
  });

  render();
}

window.addEventListener("DOMContentLoaded", init);
