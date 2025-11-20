// src/data/npc/npcs.js
import { Gender, PronounSets } from "../../shared/modules.js";

// Basic templates the game can turn into NPC instances
export const NPC_REGISTRY = [
    {
        key: "taylor",
        name: "Taylor Morgan",
        shortName: "Taylor",

        age: 18,
        gender: Gender.F,
        pronouns: PronounSets.SHE_HER,

        // Whatever stat keys you’re using
        stats: {
            looks: 3,
            strength: 1,
            intelligence: 4,
            charisma: 3,
        },

        // Tags are just metadata – useful for AI/scheduling later
        tags: ["student", "school", "befriendable"],

        // For body templates; right now everything is human
        bodyTemplate: null, // null/undefined => default HUMAN_BODY_TEMPLATE
    },

    // Add more templates here later
    // { key: "alien_bartender", ... }
];

/**
 * Helper that converts a registry entry into NPC constructor options.
 * (Not strictly required, but keeps the shape explicit.)
 */
export function npcFromRegistryKey(key) {
    const def = NPC_REGISTRY.find((d) => d.key === key);
    if (!def) return null;

    return {
        id: def.key,
        name: def.name,
        age: def.age,
        gender: def.gender,
        pronouns: def.pronouns,
        stats: def.stats,
        bodyTemplate: def.bodyTemplate,
        meta: {
            tags: def.tags || [],
            shortName: def.shortName || def.name,
            registryKey: def.key,
        },
    };
}
