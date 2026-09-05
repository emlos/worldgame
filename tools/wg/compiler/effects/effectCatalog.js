import { SKILLS, STATS } from "../../../../src/characters/player/stats.js";
import { SCHOOL_SUBJECTS } from "../../../../src/characters/player/education.js";
import { PLACE_REGISTRY } from "../../../../src/world/data/place.js";
import { NPC_REGISTRY } from "../../../../src/characters/npc/npcs.js";
import { TIMER_DEFINITIONS } from "../../../../src/game/timerDefinitions.js";
import { createWGEffectCatalog } from "../../../../src/story/wg/shared/effects/catalog.js";

export function createCompilerEffectCatalog({ reminderMap, chatMap }) {
  return createWGEffectCatalog({
    skills: SKILLS,
    stats: STATS,
    subjects: SCHOOL_SUBJECTS,
    placeRegistry: PLACE_REGISTRY,
    npcRegistry: NPC_REGISTRY,
    timers: TIMER_DEFINITIONS,
    reminders: reminderMap,
    chats: chatMap,
  });
}
