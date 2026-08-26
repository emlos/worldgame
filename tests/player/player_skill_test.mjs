import { Player } from "../../src/classes/player/player.js";
import { SKILLS } from "../../src/data/player/stats.js";
import {
  calculateSkillCheckChance,
  SKILL_CHECK_DIFFICULTIES,
} from "../../src/data/scene/skillChecks.js";

const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function throws(label, callback) {
  let error = null;
  try {
    callback();
  } catch (caught) {
    error = caught;
  }
  check(label, Boolean(error));
}

const player = new Player();
check(
  "every registered skill is initialized",
  Object.keys(SKILLS).every((id) => player.skills.has(id)),
);
check("skills start at their registered values", player.getSkillValue("strength") === 0);

player.setSkillValue("strength", 2.99);
check("fractional skill values are retained", player.getSkillValue("strength") === 2.99);
player.adjustSkill("strength", 0.01);
check("fractional adjustments normalize exact boundaries", player.getSkillValue("strength") === 3);
player.adjustSkill("strength", 100);
check("skill gains clamp to the registered maximum", player.getSkillValue("strength") === 10);
player.adjustSkill("strength", -100);
check("skill losses clamp to the registered minimum", player.getSkillValue("strength") === 0);

throws("unknown skills are rejected", () => player.setSkillValue("unknown", 1));
throws("non-finite skills are rejected", () => player.setSkillValue("strength", Number.NaN));

const floorChance = calculateSkillCheckChance(2, "tricky");
check(
  "2.05 uses skill level 2 for checks",
  calculateSkillCheckChance(2.05, "tricky") === floorChance,
);
check(
  "2.99 uses skill level 2 for checks",
  calculateSkillCheckChance(2.99, "tricky") === floorChance,
);
check("trivial checks always succeed", calculateSkillCheckChance(0, "trivial") === 1);
check("impossible checks always fail", calculateSkillCheckChance(10, "impossible") === 0);
check(
  "maxed skill retains failure risk on Impossible? checks",
  calculateSkillCheckChance(10, "near-impossible") < 1,
);

const rolledDifficulties = Object.keys(SKILL_CHECK_DIFFICULTIES).filter(
  (id) => !["trivial", "impossible"].includes(id),
);
check(
  "more skill never lowers a rolled check chance",
  rolledDifficulties.every((difficulty) => {
    let previous = -1;
    for (let skill = 0; skill <= 10; skill += 1) {
      const chance = calculateSkillCheckChance(skill, difficulty);
      if (chance < previous) return false;
      previous = chance;
    }
    return true;
  }),
);
check(
  "harder checks never have a higher chance",
  Array.from({ length: 11 }, (_, skill) => {
    const chances = rolledDifficulties.map((difficulty) =>
      calculateSkillCheckChance(skill, difficulty),
    );
    return chances.every((chance, index) => index === 0 || chance <= chances[index - 1]);
  }).every(Boolean),
);

player.setSkillValue("strength", 4.25);
const restored = Player.fromJSON(JSON.parse(JSON.stringify(player)));
check("fractional skills survive save/load", restored.getSkillValue("strength") === 4.25);

if (failures.length) {
  console.error("\nPlayer skill failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All player skill tests passed.");
}
