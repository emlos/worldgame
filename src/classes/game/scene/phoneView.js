import { SKILLS, STATS } from "../../../data/player/stats.js";
import { WearSlot } from "../../../shared/classes/clothing.js";

/** Build the read-only list shown by the phone's Relationships app. */
export function buildPhoneRelationshipsView(game) {
  return [...game.npcs.values()]
    .map((npc) => ({
      id: npc.id,
      name: npc.name,
      iconPath: npc.meta?.iconPath ?? null,
      score: game.player.getRelationship(npc.id).score,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
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
