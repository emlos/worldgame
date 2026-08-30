import { SKILLS, STATS } from "../../../data/player/stats.js";
import {
  SCHOOL_SUBJECTS,
  SUBJECT_GRADE_MAX,
  SUBJECT_GRADE_MIN,
} from "../../../data/player/education.js";
import { WearSlot } from "../../../shared/classes/clothing.js";
import { listNavigationDestinations } from "../navigation.js";
import { collectReminders } from "../reminders.js";

/** A fresh, read-only view; opening the phone never acknowledges reminders. */
export function buildPhoneRemindersView(game) {
  const items = collectReminders(game);
  return {
    count: items.length,
    groups: [
      { id: "today", label: "Today" },
      { id: "todo", label: "To do" },
    ].map((group) => ({ ...group, items: items.filter((item) => item.group === group.id) }))
      .filter((group) => group.items.length > 0),
  };
}

/** Build the read-only list of met NPCs shown by the phone's Relationships app. */
export function buildPhoneRelationshipsView(game) {
  return [...game.npcs.values()]
    .filter((npc) => game.player.getRelationship(npc.id).met)
    .map((npc) => ({
      id: npc.id,
      name: npc.name,
      iconPath: npc.meta?.iconPath ?? null,
      score: game.player.getRelationship(npc.id).score,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Build the destination list and current route shown by the phone's GPS app. */
export function buildPhoneGpsView(game) {
  const route = game.getGpsRoute();
  const activePlaceId = game.gpsTarget?.placeId ?? null;
  const currentLocationId = String(game.currentLocationId);

  return {
    activeRoute: route
      ? {
          destination: { ...route.destination },
          totalMinutes: route.totalMinutes,
          nextLocationId: route.nextLocationId,
        }
      : null,
    destinations: listNavigationDestinations(game).map((destination) => ({
      ...destination,
      active: destination.placeId === activePlaceId,
      alreadyHere: destination.locationId === currentLocationId,
      recommended: destination.placeKey === "high_school",
    })),
  };
}

/** Build a read-only snapshot of every player-facing value shown by the Stats app. */
export function buildPhonePlayerStatsView(game) {
  const player = game.player;

  return {
    overview: {
      money: player.money,
      temperature: player.temperature,
      age: player.age,
      gender: player.gender,
      perceivedGender: player.perceivedGender.label,
      pronouns: { ...player.pronouns },
    },
    stats: Object.entries(STATS).map(([id, definition]) => ({
      id,
      label: definition.label,
      base: player.getStatBase(id),
      value: player.getStatValue(id),
      min: definition.min,
      max: definition.max,
    })),
    skills: Object.entries(SKILLS).map(([id, definition]) => ({
      id,
      label: definition.label,
      value: player.getSkillValue(id),
      min: definition.min,
      max: definition.max,
    })),
    education: Object.entries(SCHOOL_SUBJECTS).map(([id, definition]) => {
      const subject = player.getSubjectRecord(id);
      return {
        id,
        label: definition.label,
        grade: subject.grade,
        attendedSegments: subject.attendedSegments,
        min: SUBJECT_GRADE_MIN,
        max: SUBJECT_GRADE_MAX,
      };
    }),
    body: {
      health: player.body?.getTotalHealth() ?? 0,
      maxHealth: player.body?.getMaximumHealth() ?? 0,
      healthPercentage: player.body?.getHealthPercentage() ?? 0,
      pain: player.getBodyPain(),
      painLabel: player.getBodyPainLabel(),
      painStage: player.getBodyPainStage(),
      performanceMultiplier: player.getPhysicalPerformanceMultiplier(),
      incapacitated: player.isIncapacitated(),
      criticalBreaks: player.body?.hasCriticalBreaks() ?? false,
      parts: [...(player.body?.allParts() ?? [])].map((part) => ({
        id: part.id,
        label: part.displayName,
        region: part.region,
        health: part.health,
        maxHealth: part.maxHealth,
        pain: part.pain,
        conditions: [...part.conditions],
      })),
    },
    appearance: {
      skinTone: player.skinTone,
      eyeColor: player.eyeColor,
      hairColor: player.hairColor,
    },
    clothing: Object.values(WearSlot).map((slot) => {
      const item = player.getEquipped(slot);
      return {
        slot,
        item: item
          ? {
              id: item.id,
              durability: item.durability,
              wetness: item.wetness,
              color: item.color,
              genderBias: item.genderBias,
            }
          : null,
      };
    }),
  };
}
