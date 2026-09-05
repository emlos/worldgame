import { NPC } from "../../characters/npc/npc.js";
import { initializeNPCBrains } from "../../characters/npc/roster.js";
import { Player } from "../../characters/player/player.js";
import { RandomStreams } from "../../shared/util/random.js";
import { World } from "../../world/world.js";
import { createGameEventListeners } from "../events.js";
import { validateGameSave } from "./saveValidation.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function serializeGame(game) {
  return {
    saveVersion: 32,
    seed: game.seed,
    random: game.random.toJSON(),
    time: game.now.toISOString(),
    startedAt: game.startedAt,
    reminders: [...game.reminders].sort(),
    chats: clone(game.chats),
    timers: clone(game.timers),
    world: game.world.toJSON(),
    player: game.player.toJSON(),
    npcs: game.npcsArray.map((npc) => npc.toJSON()),
    homeLocationId: game.homeLocationId,
    homePlaceId: game.homePlaceId,
    currentLocationId: game.currentLocationId,
    currentPlaceId: game.currentPlaceId,
    currentPlaceKey: game.currentPlaceKey,
    gpsTarget: game.gpsTarget === null ? null : { ...game.gpsTarget },
    flags: [...game.flags],
    dailyFlags: [...game.dailyFlags],
    dailyAnnouncements: clone(game.dailyAnnouncements),
    story: clone(game.story),
    currentStory:
      game.currentStory === null ? null : clone(game.currentStory),
    storyContinuations: clone(game.storyContinuations),
    storyRevision: game.storyRevision,
    actionRevision: game.actionRevision,
    interruptState: clone(game.interruptState),
    log: game.log.map((entry) => ({ ...entry })),
  };
}

export function hydrateGame(game, data) {
  validateGameSave(data, { features: game.features });

  game.seed = data.seed;
  game.random = RandomStreams.fromJSON(data.random);
  game.rnd = game.random.stream("gameplay");
  game.world = World.fromJSON(data.world);
  game.startedAt = data.startedAt;
  game.reminders = new Set(data.reminders);
  game.chats = clone(data.chats);
  game.timers = clone(data.timers);

  game.player = Player.fromJSON(data.player || {});
  game.player.syncAgeAt(game.now);

  game.npcs = new Map();
  for (const npcData of Array.isArray(data.npcs) ? data.npcs : []) {
    const npc = NPC.fromJSON(npcData);
    const id = String(npc.id || npc.name);
    npc.id = id;
    game.npcs.set(id, npc);
  }

  game.homeLocationId = data.homeLocationId;
  game.homePlaceId = data.homePlaceId;
  game.currentLocationId = data.currentLocationId;
  game.currentPlaceId = data.currentPlaceId;
  game.currentPlaceKey = data.currentPlaceKey;
  game.gpsTarget = data.gpsTarget === null ? null : { ...data.gpsTarget };
  game.flags = new Set(data.flags);
  game.dailyFlags = new Set(data.dailyFlags);
  game.dailyAnnouncements = clone(data.dailyAnnouncements);
  game.story = clone(data.story);
  game.currentStory =
    data.currentStory === null ? null : clone(data.currentStory);
  game.storyContinuations = clone(data.storyContinuations);
  game.storyRevision = data.storyRevision;
  game.actionRevision = data.actionRevision;
  game.interruptState = clone(data.interruptState);
  game.log = data.log.map((entry) => ({ ...entry }));
  game._listeners = createGameEventListeners();

  initializeNPCBrains(game);
  return game;
}
