import { Game } from "../../src/classes/game/game.js";
import { buildPhonePlayerStatsView } from "../../src/classes/game/scene/phoneView.js";
import { SKILLS, STATS } from "../../src/data/player/stats.js";
import { BodyPartId } from "../../src/shared/classes/body.js";
import { Clothing, WearSlot } from "../../src/shared/classes/clothing.js";

const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else failures.push(label);
}

const game = new Game({ seed: 117 });
game.player.money = 42.5;
game.player.temperature = "cold";
game.player.setSkillValue("strength", 4.25);
game.player.equip(new Clothing({
  id: "plain_shirt",
  slot: WearSlot.UPPER,
  durability: 0.8,
  wetness: 0.25,
  color: "#445566",
}));
game.player.applyDamageToPart({ partId: BodyPartId.HEAD, amount: 12 });

const view = buildPhonePlayerStatsView(game);
const health = view.stats.find((entry) => entry.id === "health");
const strength = view.skills.find((entry) => entry.id === "strength");
const head = view.body.parts.find((entry) => entry.id === BodyPartId.HEAD);
const shirt = view.clothing.find((entry) => entry.slot === WearSlot.UPPER)?.item;

check(
  "overview exposes current money, temperature, identity, and pronouns",
    view.overview.money === 42.5 &&
    view.overview.temperature === "cold" &&
    view.overview.age === 18 &&
    view.overview.gender === game.player.gender &&
    view.overview.pronouns.subject === game.player.pronouns.subject,
);
check(
  "every registered stat is named and included exactly once",
  view.stats.length === Object.keys(STATS).length &&
    new Set(view.stats.map((entry) => entry.id)).size === Object.keys(STATS).length &&
    Object.entries(STATS).every(([id, definition]) =>
      view.stats.some((entry) => entry.id === id && entry.label === definition.label)),
);
check(
  "health is the pooled percentage of all body parts",
  health?.base === game.player.body.getHealthPercentage() &&
    health?.value === health.base &&
    health?.value < 100 &&
    health?.min === 0 &&
    health?.max === 100,
);
check(
  "every registered skill is named and includes its current value and range",
  view.skills.length === Object.keys(SKILLS).length &&
    strength?.label === SKILLS.strength.label &&
    strength?.value === 4.25 &&
    strength?.min === 0 &&
    strength?.max === 10,
);
check(
  "body summary exposes pain, condition, performance, and incapacitation",
  view.body.pain === game.player.getBodyPain() &&
    view.body.healthPercentage === health.value &&
    view.body.health === game.player.body.getTotalHealth() &&
    view.body.maxHealth === game.player.body.getMaximumHealth() &&
    view.body.painLabel === game.player.getBodyPainLabel() &&
    view.body.performanceMultiplier === game.player.getPhysicalPerformanceMultiplier() &&
    view.body.incapacitated === game.player.isIncapacitated(),
);
check(
  "every body part is included with health, pain, region, and conditions",
  view.body.parts.length === game.player.body.parts.size &&
    head?.label === "Head" &&
    head?.health === 88 &&
    head?.pain === 18 &&
    Array.isArray(head?.conditions),
);
check(
  "appearance colours and every clothing slot are included",
  view.appearance.skinTone === game.player.skinTone &&
    view.clothing.length === Object.keys(WearSlot).length &&
    shirt?.id === "plain_shirt" &&
    shirt?.durability === 0.8 &&
    shirt?.wetness === 0.25,
);

game.player.money = 1;
game.player.setSkillValue("strength", 9);
check(
  "previously built stats views remain immutable snapshots",
  view.overview.money === 42.5 && strength?.value === 4.25,
);

const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
const restoredView = buildPhonePlayerStatsView(restored);
check(
  "the complete stats view rebuilds correctly after save and load",
  restoredView.overview.money === 1 &&
    restoredView.skills.find((entry) => entry.id === "strength")?.value === 9 &&
    restoredView.body.parts.find((entry) => entry.id === BodyPartId.HEAD)?.health === 88 &&
    restoredView.clothing.find((entry) => entry.slot === WearSlot.UPPER)?.item?.id === "plain_shirt",
);

if (failures.length) {
  console.error("\nPhone player stats view failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All phone player stats view tests passed.");
}
