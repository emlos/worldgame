import test from "node:test";
import assert from "node:assert/strict";

import { validateNPCRosterSave } from "../src/characters/npc/saveValidation.js";
import { validatePlayerSave } from "../src/characters/player/saveValidation.js";
import { Game, SaveValidationError, validateGameSave } from "../src/game/game.js";
import { deriveSeed } from "../src/shared/util/random.js";
import { validateStorySave } from "../src/story/saveValidation.js";
import { validateWorldSave } from "../src/world/saveValidation.js";

const FIXED_START = new Date("2026-09-04T12:00:00.000Z");

function validSave() {
  return JSON.parse(JSON.stringify(new Game({ seed: 0x5a17, startDate: FIXED_START }).toJSON()));
}

function assertInvalid(mutate, expectedPath) {
  const save = validSave();
  mutate(save);
  assert.throws(
    () => validateGameSave(save),
    (error) => {
      assert.ok(error instanceof SaveValidationError);
      assert.equal(error.path, expectedPath);
      return true;
    },
  );
}

function firstOwnedPlace(save) {
  return save.world.map.locations
    .flatMap((location) => location.places)
    .find((place) => Object.hasOwn(place.props, "ownerNpcId"));
}

test("save validation is pure and valid saves still round-trip exactly", () => {
  const save = validSave();
  const before = JSON.stringify(save);

  assert.equal(validateGameSave(save), save);
  assert.equal(validateGameSave(save), save);
  assert.equal(JSON.stringify(save), before);

  const restored = Game.fromJSON(save);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.toJSON())), save);
});

test("root and random-stream corruption retain precise save paths", async (t) => {
  const cases = [
    ["schema version", (save) => { save.saveVersion = 31; }, "save.saveVersion"],
    ["non-JSON value", (save) => { save.player.money = Number.NaN; }, "save.player.money"],
    ["gameplay stream", (save) => { delete save.random.states.gameplay; }, "save.random.states.gameplay"],
    ["game clock", (save) => { save.time = "not-a-date"; }, "save.time"],
    ["start after clock", (save) => { save.startedAt = "2026-09-05T12:00:00.000Z"; }, "save.startedAt"],
  ];
  for (const [name, mutate, path] of cases) {
    await t.test(name, () => assertInvalid(mutate, path));
  }
});

test("world corruption is rejected by the world subsystem", async (t) => {
  const cases = [
    ["world clock", (save) => { save.world.time.date = "2026-09-04T12:01:00.000Z"; }, "save.world.time.date"],
    ["calendar year", (save) => { save.world.calendar.year += 1; }, "save.world.calendar.year"],
    ["weather kind", (save) => { save.world.weather.current.kind = "meteors"; }, "save.world.weather.current.kind"],
    ["temperature", (save) => { save.world.temperatureC += 1; }, "save.world.temperatureC"],
    ["moon clock", (save) => { save.world.moon.date = "2026-09-04T12:01:00.000Z"; }, "save.world.moon.date"],
    ["map endpoint", (save) => { save.world.map.edges[0].a = "missing"; }, "save.world.map.edges[0].a"],
  ];
  for (const [name, mutate, path] of cases) {
    await t.test(name, () => assertInvalid(mutate, path));
  }

  const save = validSave();
  save.world.temperatureC += 1;
  assert.throws(
    () => validateWorldSave(save.world, {
      expectedSeed: deriveSeed(save.seed, "world"),
      expectedTime: Date.parse(save.time),
    }),
    (error) => error instanceof SaveValidationError && error.path === "save.world.temperatureC",
  );
});

test("character corruption is rejected by its owning subsystem", async (t) => {
  const cases = [
    ["player stat", (save) => { save.player.stats.energy.base = "full"; }, "save.player.stats.energy.base"],
    ["player age", (save) => { save.player.age += 1; }, "save.player.age"],
    ["missing skill", (save) => { save.player.skills.pop(); }, "save.player.skills"],
    ["unknown relationship", (save) => {
      save.player.relationships.push(["missing", { met: false, meters: [] }]);
    }, `save.player.relationships[${validSave().player.relationships.length}][0]`],
    ["duplicate NPC", (save) => { save.npcs[1].id = save.npcs[0].id; }, "save.npcs[1].id"],
    ["NPC location", (save) => { save.npcs[0].locationId = "missing"; }, "save.npcs[0].locationId"],
    ["NPC brain clock", (save) => { save.npcs[0].brain.lastUpdatedAt = "2026-09-04T11:59:00.000Z"; }, "save.npcs[0].brain.lastUpdatedAt"],
    ["place owner", (save) => {
      const ownerId = firstOwnedPlace(save).props.ownerNpcId;
      save.npcs = save.npcs.filter((npc) => npc.id !== ownerId);
    }, null],
  ];
  for (const [name, mutate, expectedPath] of cases) {
    await t.test(name, () => {
      if (expectedPath !== null) return assertInvalid(mutate, expectedPath);
      const save = validSave();
      mutate(save);
      assert.throws(
        () => validateGameSave(save),
        (error) => error instanceof SaveValidationError &&
          error.path.endsWith(".props.ownerNpcId"),
      );
    });
  }

  const save = validSave();
  const { mapIndex } = validateWorldSave(save.world, {
    expectedSeed: deriveSeed(save.seed, "world"),
    expectedTime: Date.parse(save.time),
  });
  const roster = validateNPCRosterSave(save.npcs, {
    mapIndex,
    gameTime: Date.parse(save.time),
  });
  save.player.age += 1;
  assert.throws(
    () => validatePlayerSave(save.player, {
      npcProfiles: roster.npcProfiles,
      gameTime: Date.parse(save.time),
    }),
    (error) => error instanceof SaveValidationError && error.path === "save.player.age",
  );
});

test("game service corruption is rejected by the owning service", async (t) => {
  const cases = [
    ["reminder", (save) => { save.reminders.push("missing"); }, "save.reminders"],
    ["chat contact", (save) => {
      save.chats = { contacts: ["missing"], threads: { missing: {} } };
    }, "save.chats"],
    ["timer", (save) => {
      save.timers.missing = { dueAt: "2026-09-05T12:00:00.000Z", occurrences: 0 };
    }, "save.timers.missing"],
    ["current location", (save) => { save.currentLocationId = "missing"; }, "save.currentLocationId"],
    ["current place key", (save) => { save.currentPlaceKey = "wrong"; }, "save.currentPlaceKey"],
    ["GPS location", (save) => {
      save.gpsTarget = { locationId: "missing", placeId: "missing" };
    }, "save.gpsTarget.locationId"],
    ["announcement day", (save) => { save.dailyAnnouncements.day = "2026-09-03"; }, "save.dailyAnnouncements.day"],
    ["action revision", (save) => { save.actionRevision = -1; }, "save.actionRevision"],
    ["future log", (save) => {
      save.log.push({ t: "2026-09-05T12:00:00.000Z", label: "future" });
    }, "save.log[0].t"],
  ];
  for (const [name, mutate, path] of cases) {
    await t.test(name, () => assertInvalid(mutate, path));
  }
});

test("story corruption is rejected by the story subsystem", async (t) => {
  const continuation = {
    target: "other.scene",
    sceneId: null,
    sourcePassageId: null,
    poolId: "test.pool",
    eventSceneId: "test.event",
    sourceSceneId: "test.source",
    sourceChoiceId: "test.choice",
    behavior: null,
  };
  const cases = [
    ["orphaned continuation", (save) => { save.storyContinuations.push(continuation); }, "save.storyContinuations"],
    ["negative revision", (save) => { save.storyRevision = -1; }, "save.storyRevision"],
    ["orphaned interrupt", (save) => {
      save.interruptState.pending = {
        sceneId: "test.interrupt",
        priority: 1,
        triggeredAt: save.time,
      };
    }, "save.interruptState.pending"],
  ];
  for (const [name, mutate, path] of cases) {
    await t.test(name, () => assertInvalid(mutate, path));
  }

  const save = validSave();
  save.storyRevision = -1;
  assert.throws(
    () => validateStorySave(save, { gameTime: Date.parse(save.time) }),
    (error) => error instanceof SaveValidationError && error.path === "save.storyRevision",
  );
});
