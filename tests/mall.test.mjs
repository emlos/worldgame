import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildPhoneRelationshipsView } from "../src/game/scene/phoneView.js";
import {
  resolveWGAutomaticScene,
  WG_AUTO_TRIGGER,
} from "../src/story/wg/runtime/sceneExposure.js";

function placePlayerAtMall(game) {
  for (const location of game.world.locations.values()) {
    const mall = location.places.find(({ key }) => key === "mall");
    if (!mall) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(mall.id) });
    return mall;
  }
  throw new Error("Generated world has no mall");
}

function choose(game, label) {
  const scene = buildScene(game);
  const choice = scene.sections
    .flatMap(({ choices }) => choices)
    .find((candidate) => candidate.label === label);
  assert.ok(choice, `Missing choice '${label}'`);
  return performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

test("mall hub exposes activities and sells the planned home computer once", () => {
  const game = new Game({
    seed: 7301,
    startDate: new Date("2026-09-03T14:00:00.000Z"),
    playerOptions: { startPlaceId: null, money: 700 },
  });
  placePlayerAtMall(game);

  const hubLabels = buildScene(game).sections.flatMap(({ choices }) =>
    choices.map(({ label }) => label),
  );
  assert.ok(hubLabels.includes("Browse the shops"));
  assert.ok(hubLabels.includes("Visit the food court"));
  assert.ok(hubLabels.includes("Visit the electronics shop"));

  choose(game, "Visit the electronics shop");
  const before = game.now.getTime();
  choose(game, "Buy a home computer");

  assert.equal(game.player.money, 100);
  assert.equal(game.hasFlag("inventory.computer"), true);
  assert.equal(game.now.getTime() - before, 15 * 60_000);
  assert.equal(game.currentPlace.key, "mall");

  choose(game, "Visit the electronics shop");
  const electronicsLabels = buildScene(game).sections.flatMap(({ choices }) =>
    choices.map(({ label }) => label),
  );
  assert.ok(electronicsLabels.includes("Look at accessories"));
  assert.ok(!electronicsLabels.includes("Buy a home computer"));
});

test("Taylor can introduce herself at the mall exactly once", () => {
  const game = new Game({
    seed: 7302,
    startDate: new Date("2026-09-03T16:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  placePlayerAtMall(game);

  assert.equal(
    buildPhoneRelationshipsView(game).some(({ id }) => id === "taylor"),
    false,
  );

  game.teleportNPC("taylor", "player");
  const meeting = resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace);
  assert.equal(meeting?.id, "mall.taylor.first-meeting");
  assert.equal(
    buildPhoneRelationshipsView(game).some(({ id }) => id === "taylor"),
    true,
  );

  choose(game, "See you at school");
  assert.equal(
    resolveWGAutomaticScene(game, WG_AUTO_TRIGGER.enterPlace),
    null,
  );
});
