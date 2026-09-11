import { isPlaceUnlocked } from "../../../world/model/place.js";
import { STATS } from "../../../characters/player/stats.js";

const WG_FLAG_VALUE = Symbol.for("worldgame.wg.flag-value");

function hierarchicalBooleanValues(activeNames) {
  const root = Object.create(null);
  for (const activeName of activeNames) {
    const segments = String(activeName).split(".");
    let current = root;
    for (const segment of segments) {
      if (!Object.hasOwn(current, segment) || typeof current[segment] !== "object") {
        current[segment] = Object.create(null);
      }
      current = current[segment];
    }
    current[WG_FLAG_VALUE] = true;
  }
  return root;
}

function placeKeys(places) {
  const keys = places.map((place) => place.key)
    .filter((key) => typeof key === "string" && key);
  return [...new Set(keys)].sort();
}

function evaluatedStats(character, names = Object.keys(character.stats || {})) {
  const values = {};
  for (const name of names) {
    values[name] = character.getStatValue(name);
  }
  return values;
}

function pronounValues(character) {
  return { ...(character.pronouns || {}) };
}

function skillValues(player) {
  return Object.fromEntries(player.skills || []);
}

function playerContext(player) {
  return {
    ...evaluatedStats(player, Object.keys(STATS)),
    ...pronounValues(player),
    gender: player.gender,
    age: player.age,
    money: player.money,
    temperature: player.temperature,
    skills: skillValues(player),
  };
}

function timeContext(date, startedAt) {
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  return {
    iso: date.toISOString(),
    day: Math.floor(date.getTime() / 86_400_000) - Math.floor(Date.parse(startedAt) / 86_400_000) + 1,
    hour,
    minute,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

function homeContext(game, locationId) {
  const location = locationId == null ? null : game.world.getLocation(locationId);
  return {
    location: location ? { name: location.name } : null,
  };
}

function npcContext(game, npc) {
  const shortName = npc.meta?.shortName || npc.name;
  const schedule = npc.brain?.getScheduleStatus?.(game.now) ?? {
    phase: "free",
    obligationId: null,
    startsAt: null,
    requiredArrivalAt: null,
    earlyArrivalMinutes: null,
    minutesUntilStart: null,
  };
  
  const relationship = game.player.getRelationshipProfile(
    npc.id,
    npc.relationshipProfile,
  );
  const relationshipValues = Object.fromEntries(
    Object.keys(npc.relationshipProfile?.meters || {}).map((meterId) => [
      meterId,
      relationship.meters.get(meterId)?.value ??
        npc.relationshipProfile.meters[meterId].initial,
    ]),
  );

  return {
    ...evaluatedStats(npc),
    ...pronounValues(npc),
    id: npc.id,
    name: npc.name,
    shortName,
    age: npc.age,
    gender: npc.gender,
    home: homeContext(game, npc.homeLocationId),
    met: relationship.met,
    relationship: relationshipValues,
    present: game.getNPCsAtCurrentPosition().includes(npc),
    available: game.getNPCInteractionAccess(npc).allowed,
    schedule,
    flags: { ...(npc.flags || {}) },
  };
}

function actorContext(actor) {
  return {
    ...(actor.stats || {}),
    ...(actor.pronouns || {}),
    id: actor.id,
    alias: actor.alias,
    name: actor.name,
    title: actor.title,
    category: actor.category,
    noun: actor.noun,
    age: actor.age,
    gender: actor.gender,
    stats: { ...(actor.stats || {}) },
    flags: { ...(actor.flags || {}) },
  };
}

export function createWGRuntimeContext(
  game,
  { locals = null, additionalFlags = [], event = undefined } = {},
) {
  const npcs = {};
  for (const [id, npc] of game.npcs) npcs[id] = npcContext(game, npc);

  const actors = {};
  for (const [alias, actor] of Object.entries(game.currentStory?.actors || {})) {
    actors[alias] = actorContext(actor);
  }

  const flags = hierarchicalBooleanValues([...game.flags, ...additionalFlags]);

  const daily = hierarchicalBooleanValues(game.dailyFlags);

  const activeContinuation = game.storyContinuations.at(-1) || null;
  const context = {
    story: game.story,
    player: playerContext(game.player),
    home: homeContext(game, game.homeLocationId),
    npc: npcs,
    actor: actors,
    flags,
    daily,
    local: locals ?? game.currentStory?.locals ?? {},
    time: timeContext(game.now, game.startedAt),
    event: event === undefined
      ? activeContinuation
        ? {
            poolId: activeContinuation.poolId,
            sceneId: activeContinuation.eventSceneId,
            data: activeContinuation.data ?? null,
            source: {
              sceneId: activeContinuation.sourceSceneId,
              passageId: activeContinuation.sourcePassageId,
              choiceId: activeContinuation.sourceChoiceId,
            },
          }
        : null
      : event,
    location: game.location
      ? {
          id: game.location.id,
          name: game.location.name,
          type: game.location.type,
          tags: [...(game.location.tags || [])],
          placeKeys: placeKeys(game.location.places),
          visiblePlaceKeys: placeKeys(game.location.places.filter(isPlaceUnlocked)),
        }
      : null,
    place: game.currentPlace
      ? {
          id: game.currentPlace.id,
          key: game.currentPlace.key,
          name: game.currentPlace.name,
          tags: [
            ...(Array.isArray(game.currentPlace.props?.category)
              ? game.currentPlace.props.category
              : [game.currentPlace.props?.category].filter(Boolean)),
            ...(game.currentPlace.props?.tags || []),
          ],
        }
      : null,
  };
  return Object.assign(context, game.features.createWGContext(game));
}
