import { Game } from "../../src/classes/game/game.js";
import { buildPhoneRelationshipsView } from "../../src/classes/game/scene/phoneView.js";

const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else failures.push(label);
}

const game = new Game({
  seed: 117,
  startDate: new Date("2026-08-24T08:00:00.000Z"),
});
const view = buildPhoneRelationshipsView(game);

check("the relationship view includes every active NPC", view.length === game.npcs.size);
check(
  "the relationship view contains every active NPC exactly once",
  new Set(view.map((entry) => entry.id)).size === game.npcs.size &&
    [...game.npcs.keys()].every((id) => view.some((entry) => entry.id === id)),
);
check(
  "relationship entries use full names and configured icons",
  view.every((entry) => entry.name === game.npcs.get(entry.id).name && entry.iconPath),
);
check(
  "relationship entries are sorted by full name",
  view.map((entry) => entry.name).join("|") ===
    [...view].sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => entry.name)
      .join("|"),
);
check("unmet NPCs still appear with a zero score", view.every((entry) => entry.score === 0));

game.player.bumpRelationship("taylor", 0.02);
const changedView = buildPhoneRelationshipsView(game);
check(
  "the relationship view reads the current player relationship score",
  changedView.find((entry) => entry.id === "taylor")?.score === 0.02,
);
check(
  "previously built relationship views remain immutable snapshots",
  view.find((entry) => entry.id === "taylor")?.score === 0,
);

const restored = Game.fromJSON(JSON.parse(JSON.stringify(game)));
check(
  "relationship scores and icon metadata survive save/load",
  buildPhoneRelationshipsView(restored).find((entry) => entry.id === "taylor")?.score === 0.02 &&
    restored.npcs.get("taylor")?.meta?.iconPath === "assets/npc/icons/talor/icon.png",
);

if (failures.length) {
  console.error("\nPhone relationship view failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All phone relationship view tests passed.");
}
