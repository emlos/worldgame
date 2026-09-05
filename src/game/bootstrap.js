import { NPC_REGISTRY } from "../characters/npc/npcs.js";
import { createNPCs, initializeNPCBrains } from "../characters/npc/roster.js";
import { Player } from "../characters/player/player.js";
import { INITIAL_PLAYER_AGE } from "../characters/player/stats.js";
import {
  RandomStreams,
  deriveSeed,
  normalizeSeed,
  rollSeed,
} from "../shared/util/random.js";
import { World } from "../world/world.js";
import { collectDailyAnnouncements } from "./announcements.js";
import { createChatState } from "./chat/runtime.js";
import { createGameEventListeners } from "./events.js";

export function initializeNewGame(
  game,
  {
    seed = rollSeed(),
    startDate = new Date(),
    playerOptions = {},
    npcTemplates = NPC_REGISTRY.filter(
      (definition) => !definition.meta?.example,
    ),
  } = {},
) {
  game.seed = normalizeSeed(seed);
  game.random = new RandomStreams(game.seed);
  game.rnd = game.random.stream("gameplay");

  game.world = new World({
    seed: deriveSeed(game.seed, "world"),
    startDate,
  });
  game.startedAt = game.now.toISOString();
  game.reminders = new Set();
  game.chats = createChatState();
  game.timers = {};

  game.player = new Player(playerOptions);
  game.player.setAgeAtDate(INITIAL_PLAYER_AGE, game.now);

  game.flags = new Set();
  game.dailyFlags = new Set();
  game.story = {};
  game.currentStory = null;
  game.storyContinuations = [];
  game.storyRevision = 0;
  game.actionRevision = 0;
  game.interruptState = {
    active: null,
    pending: null,
    latchedSceneIds: [],
  };

  game.npcs = new Map();
  createNPCs(game, npcTemplates);
  initializeNPCBrains(game);

  const home = game.world.findFirstPlaceByKey("player_home");
  game.homeLocationId = home?.locationId ?? null;
  game.homePlaceId = home?.id ?? null;

  const hasStartLocation = playerOptions.startLocationId != null;
  const hasStartPlace = Object.prototype.hasOwnProperty.call(
    playerOptions,
    "startPlaceId",
  );
  if (
    hasStartLocation &&
    playerOptions.startLocationId != null &&
    !game.world.locations.has(playerOptions.startLocationId)
  ) {
    throw new Error(
      `Unknown starting location: ${playerOptions.startLocationId}`,
    );
  }

  game.currentLocationId = hasStartLocation
    ? playerOptions.startLocationId
    : (game.homeLocationId ?? firstLocationId(game.world));
  if (hasStartPlace) {
    game.currentPlaceId = playerOptions.startPlaceId;
  } else if (game.currentLocationId === game.homeLocationId) {
    game.currentPlaceId = game.homePlaceId;
  } else {
    game.currentPlaceId = null;
  }

  if (game.currentPlaceId != null) {
    const place = game.world.getPlace(
      game.currentLocationId,
      game.currentPlaceId,
    );
    if (!place) {
      throw new Error(
        `Unknown starting place '${game.currentPlaceId}' in location ` +
          `'${game.currentLocationId}'`,
      );
    }
    game.currentPlaceId = place.id;
    game.currentPlaceKey = place.key ?? null;
  } else {
    game.currentPlaceKey = null;
  }

  game.gpsTarget = null;
  game.log = [];
  game._listeners = createGameEventListeners();
  game.dailyAnnouncements = collectDailyAnnouncements(game, game.now);
  return game;
}

function firstLocationId(world) {
  const first = world.locations.keys().next();
  return first.done ? null : first.value;
}
