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

  let currentBodyPart;
  let lastElemPart = el("div");

  function render() {
    // Identity
    {
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
    }

    // Appearance
    {
      byId("appearance").innerHTML = "";
      byId("appearance").append(el("h2", { html: "Appearance" }));
      byId("appearance").append(
        table(
          [
            ["Head", `<code>${p.appearance.head}</code>`],
            ["Face", `<code>${p.appearance.face}</code>`],
            ["Hair", `<code>${p.appearance.hair}</code>`],
            ["Body (immutable)", `<code>${p.visualbody}</code>`],
            ["Skin Tone", colorSwatch(p.skinTone)],
            ["Eye Color", colorSwatch(p.eyeColor)],
            ["Hair Color", colorSwatch(p.hairColor)],
          ],
          ["Property", "Value"]
        )
      );
    }

    // Stats
    {
      const statRows = Object.keys(p.stats).map((name) => {
        const base = p.getStatBase(name);
        const val = p.getStatValue(name);
        return [name, String(base), String(Number(val.toFixed ? val.toFixed(2) : val))];
      });
      byId("stats").innerHTML = "";
      byId("stats").append(el("h2", { html: "Stats" }));
      byId("stats").append(table(statRows, ["Stat", "Base", "Computed Value"]));
    }

    // Traits
    {
      const traitRows = [...p.traits.values()].map((t) => [`<code>${t.id}</code>`, t.description || "-", String(t.has(p))]);
      byId("traits").innerHTML = "";
      byId("traits").append(el("h2", { html: "Traits" }));
      byId("traits").append(table(traitRows, ["ID", "Description", "Active?"]));
    }

    // Skills
    {
      const skillRows = [...p.skills.entries()].map(([name, sk]) => [name, sk.type, sk.type === "meter" ? sk.value.toFixed(2) : String(!!sk.value)]);
      byId("skills").innerHTML = "";
      byId("skills").append(el("h2", { html: "Skills" }));
      byId("skills").append(table(skillRows, ["Skill", "Type", "Value"]));
    }

    // Relationships
    {
      const relRows = [...p.relationships.values()].map((r) => [r.npcId, String(r.met), r.score.toFixed(2)]);
      byId("relationships").innerHTML = "";
      byId("relationships").append(el("h2", { html: "Relationships" }));
      byId("relationships").append(table(relRows, ["NPC ID", "Met", "Score (-1..1)"]));
    }

    // Clothing
    {
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

    // Bodyparts :
    {
      document.querySelectorAll(".bodypart").forEach((part) => {
        part.addEventListener("mouseenter", () => {
          part.style.fill = "#bcc8e7ff";
        });

        part.addEventListener("mouseleave", () => {
          part.style.fill = "#949494";
        });

        part.addEventListener("click", () => renderPart(part));
      });
    }

    //Body info general
    {
      byId("bodyinfo").innerHTML = "";
      const t = table(
        [
          ["Total Pain", `${p.getBodyPain()}/100`],
          ["Pain Label", `<code>${p.getBodyPainLabel()}</code>`],
          ["Physical performance Multiplier", `* ${p.getPhysicalPerformanceMultiplier()}`],
          ["Is Incapacitated?", `<code>${p.isIncapacitated()}</code>`],
        ],
        ["Property", "Value"]
      );

      byId("bodyinfo").append(t);
    }
  }
  let bodyPartInfo = {};
  function renderPart(part) {
    //select part
    part.style.stroke = "red";
    lastElemPart.style.stroke = "#000000";
    lastElemPart = part;

    //clean up listeners
    byId(`codegroup-${bodyPartInfo.id}`)?.removeEventListener("mouseenter", () => onhover(bodyPartInfo.region));
    byId(`codegroup-${bodyPartInfo.id}`)?.removeEventListener("mouseenter", () => unhover(bodyPartInfo.region));

    let bodypart = part.id;

    bodyPartInfo = p.getBodyPart(bodypart);
    currentBodyPart = bodyPartInfo;

    //show buttons
    byId("btnDamage").style.display = "block";
    byId("btnDamage").innerText = `Damage ${bodyPartInfo.displayName} +10`;
    byId("btnDamageRandom").style.display = "block";
    byId("btnDamageRandom").innerText = `Damage ${bodyPartInfo.displayName} +10 (Injury)`;
    byId("btnHealPart").style.display = "block";
    byId("btnHealPart").innerText = `Heal ${bodyPartInfo.displayName} +10`;

    //deal with tables
    byId("bodypartinfo").innerHTML = "";
    byId("bodypartinfo").style.display = "block";

    byId("bodypartinfo").append(el("h2", { html: "Body Part: " + bodyPartInfo.displayName }));
    const t = table(
      [
        ["id", `<code>${bodyPartInfo.id}</code>`],
        ["Body region", `<code style = "cursor: pointer;" class="bodypartgroup" id="codegroup-${bodyPartInfo.id}">${bodyPartInfo.region}</code> <small class="small">hover over me!</small>`],
        ["Health", `${bodyPartInfo.health}/${bodyPartInfo.maxHealth}`],
        ["Pain", `${bodyPartInfo.pain}`],
        ["Pain Multiplier", `${bodyPartInfo.painMultiplier}`],
        ["can break?", `<code>${bodyPartInfo.canBreak}</code>`],
        [
          "Conditions",
          Object.values(InjuryCondition)
            .map((cond) => `<code>${bodyPartInfo.conditions.has(cond) ? " ☒" : " ☐"} ${cond}</code>`)
            .join("<br>"),
        ],
      ],
      ["Property", "Value"]
    );

    byId("bodypartinfo").append(t);

    byId(`codegroup-${bodyPartInfo.id}`).addEventListener("mouseenter", () => onhover(bodyPartInfo.region));
    byId(`codegroup-${bodyPartInfo.id}`).addEventListener("mouseleave", () => unhover(bodyPartInfo.region));

    function onhover(region) {
      if (!region) return;

      region = region.replace(" ", "-");
      document.querySelectorAll("." + region).forEach((pp) => {
        pp.style.fill = "#e7bcbcff";
      });
    }

    function unhover(region) {
      if (!region) return;

      region = region.replace(" ", "-");
      document.querySelectorAll("." + region).forEach((pp) => {
        pp.style.fill = "#949494";
      });
    }
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

  byId("btnDamage").addEventListener("click", () => {
    p.applyDamageToPart({ partId: currentBodyPart.id, amount: 10 });
    render();
    renderPart(lastElemPart);
  });

  byId("btnDamageRandom").addEventListener("click", () => {
    p.applyDamageToPartRandom({ partId: currentBodyPart.id, amount: 10, rnd: Math.random });
    render();
    renderPart(lastElemPart);
  });

  byId("btnHealPart").addEventListener("click", () => {
    p.healBodyPart(currentBodyPart.id, 10);
    render();
    renderPart(lastElemPart);
  });

  byId("btnHealFull").addEventListener("click", () => {
    p.fullyHealBody();
    if (Object.keys(bodyPartInfo).length > 0) {
      renderPart(lastElemPart);
      render();
    }
  });

  render();
}

window.addEventListener("DOMContentLoaded", init);
