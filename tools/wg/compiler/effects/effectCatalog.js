import { SKILLS, STATS } from "../../../../src/characters/player/stats.js";
import { PLACE_REGISTRY } from "../../../../src/world/data/place.js";
import { NPC_REGISTRY } from "../../../../src/characters/npc/npcs.js";
import { DEFAULT_FEATURE_CATALOG } from "../../../../src/features/index.js";
import { createWGEffectCatalog } from "../../../../src/story/wg/shared/effects/catalog.js";

export function createCompilerEffectCatalog({
  reminderMap,
  chatMap,
  features = DEFAULT_FEATURE_CATALOG,
}) {
  return createWGEffectCatalog({
    skills: SKILLS,
    stats: STATS,
    subjects: features.wgReferenceCatalogs.subjects ?? {},
    placeRegistry: PLACE_REGISTRY,
    npcRegistry: NPC_REGISTRY,
    timers: features.timerDefinitions,
    reminders: reminderMap,
    chats: chatMap,
  });
}
