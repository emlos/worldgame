import { SKILLS, STATS } from "../../../../src/data/player/stats.js";
import { SCHOOL_SUBJECTS } from "../../../../src/data/player/education.js";
import { PLACE_REGISTRY } from "../../../../src/data/world/place.js";
import { NPC_REGISTRY } from "../../../../src/data/npc/npcs.js";
import { TIMER_DEFINITIONS } from "../../../../src/content/timers.js";
import { createWGEffectCatalog } from "../../../../src/shared/wg/effects/catalog.js";

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
