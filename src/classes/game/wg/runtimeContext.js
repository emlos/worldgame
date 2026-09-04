import { getSchoolDayState } from "../../../data/player/schedule.js";
import { isPlaceUnlocked } from "../../world/util/place.js";

function placeKeys(places) {
  const keys = places.map((place) => place.key)
    .filter((key) => typeof key === "string" && key);
  return [...new Set(keys)].sort();
}

function evaluatedStats(character) {
  const values = {};
  for (const name of Object.keys(character.stats || {})) {
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
  const education = Object.fromEntries(
    Object.keys(player.education?.subjects || {}).map((id) => {
      const subject = player.getSubjectRecord(id);
      return [
        id,
        {
          achievement: subject.achievement,
          grade: subject.grade,
          progress: subject.progress,
          attendedSegments: subject.attendedSegments,
        },
      ];
    }),
  );
  return {
    ...evaluatedStats(player),
    ...pronounValues(player),
    gender: player.gender,
    age: player.age,
    money: player.money,
    temperature: player.temperature,
    skills: skillValues(player),
    education,
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
    relationship: relationshipValues,
    present: game.getNPCsAtCurrentPosition().includes(npc),
    available: game.getNPCInteractionAccess(npc).allowed,
    schedule,
    flags: { ...(npc.flags || {}) },
  };
}

export function createWGRuntimeContext(game) {
  const npcs = {};
  for (const [id, npc] of game.npcs) npcs[id] = npcContext(game, npc);

  const flags = {};
  for (const flag of game.flags) flags[flag] = true;

  const daily = {};
  for (const flag of game.dailyFlags) daily[flag] = true;

  const school = getSchoolDayState(game);
  const activeContinuation = game.storyContinuations.at(-1) || null;
  const schoolClass =
    game.currentStory?.schoolClass
      ? game.currentStory.schoolClass
      : activeContinuation?.schoolClass;
  if (schoolClass) {
    school.arrival = { ...schoolClass };
  }

  return {
    story: game.story,
    player: playerContext(game.player),
    home: homeContext(game, game.homeLocationId),
    npc: npcs,
    flags,
    daily,
    time: timeContext(game.now, game.startedAt),
    school,
    event: activeContinuation
      ? {
          poolId: activeContinuation.poolId,
          sceneId: activeContinuation.eventSceneId,
          source: {
            sceneId: activeContinuation.sourceSceneId,
            passageId: activeContinuation.sourcePassageId,
            choiceId: activeContinuation.sourceChoiceId,
          },
        }
      : null,
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
}
