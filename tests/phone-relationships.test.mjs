import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../src/classes/game/game.js";
import { buildPhoneRelationshipsView } from "../src/classes/game/scene/phoneView.js";

function createGame() {
  return new Game({ seed: 117, startDate: new Date("2026-09-01T07:00:00.000Z") });
}

test("a new game hides all NPCs without creating relationship records", () => {
  const game = createGame();
  assert.ok(game.npcs.size > 0);
  assert.equal(game.player.relationships.size, 0);
  assert.deepEqual(buildPhoneRelationshipsView(game), []);
  assert.equal(game.player.relationships.size, 0);
});

test("an unmet NPC stays hidden regardless of its relationship score", () => {
  const game = createGame();
  const ids = [...game.npcs.keys()];
  for (const [index, score] of [-1, 0, 1].entries()) {
    game.player.setRelationship({ npcId: ids[index], met: false, score });
  }
  assert.deepEqual(buildPhoneRelationshipsView(game), []);
});

test("met NPCs keep their names, icons and scores and sort alphabetically", () => {
  const game = createGame();
  const npcs = [...game.npcs.values()].slice(0, 3);
  const expected = npcs.map((npc, index) => {
    const score = [-0.5, 0, 0.5][index];
    game.player.setRelationship({ npcId: npc.id, met: true, score });
    return { id: npc.id, name: npc.name, iconPath: npc.meta?.iconPath ?? null, score };
  }).sort((left, right) => left.name.localeCompare(right.name));
  assert.deepEqual(buildPhoneRelationshipsView(game), expected);
});

test("rebuilding the list reflects changes to the met flag", () => {
  const game = createGame();
  const npc = game.npcs.values().next().value;
  assert.deepEqual(buildPhoneRelationshipsView(game), []);
  game.player.setRelationship({ npcId: npc.id, met: true });
  assert.deepEqual(buildPhoneRelationshipsView(game).map((entry) => entry.id), [npc.id]);
  game.player.setRelationship({ npcId: npc.id, met: false });
  assert.deepEqual(buildPhoneRelationshipsView(game), []);
});

test("the existing relationship-change mechanic makes an NPC visible", () => {
  const game = createGame();
  const npc = game.npcs.values().next().value;
  game.player.bumpRelationship(npc.id, -0.1);
  const view = buildPhoneRelationshipsView(game);
  assert.equal(view.length, 1);
  assert.equal(view[0].id, npc.id);
  assert.equal(view[0].score, -0.1);
});

test("building or editing a view does not mutate NPCs or relationships", () => {
  const game = createGame();
  const npc = game.npcs.values().next().value;
  game.player.setRelationship({ npcId: npc.id, met: true, score: 0.2 });
  game.player.setRelationship({ npcId: "not-a-world-npc", met: true, score: 1 });
  const npcIds = [...game.npcs.keys()];
  const relationships = [...game.player.relationships.values()].map((entry) => entry.toJSON());
  const firstView = buildPhoneRelationshipsView(game);
  assert.equal(firstView.length, 1);
  assert.deepEqual(buildPhoneRelationshipsView(game), firstView);
  firstView[0].name = "Changed in the view only";
  firstView[0].score = 1;
  assert.equal(buildPhoneRelationshipsView(game)[0].name, npc.name);
  assert.equal(buildPhoneRelationshipsView(game)[0].score, 0.2);
  assert.deepEqual([...game.npcs.keys()], npcIds);
  assert.deepEqual(
    [...game.player.relationships.values()].map((entry) => entry.toJSON()),
    relationships,
  );
});
