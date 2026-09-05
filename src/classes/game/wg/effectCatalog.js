import { SKILLS, STATS } from "../../../data/player/stats.js";
import { SCHOOL_SUBJECTS } from "../../../data/player/education.js";
import { PLACE_REGISTRY } from "../../../data/world/place.js";
import { NPC_REGISTRY } from "../../../data/npc/npcs.js";
import { TIMER_DEFINITIONS } from "../../../content/timers.js";
import { WG_BUNDLE } from "../../../generated/wg/scenes.js";
import { createWGEffectCatalog } from "../../../shared/wg/effects/catalog.js";

export const WG_RUNTIME_EFFECT_CATALOG = createWGEffectCatalog({
  skills: SKILLS,
  stats: STATS,
  subjects: SCHOOL_SUBJECTS,
  placeRegistry: PLACE_REGISTRY,
  npcRegistry: NPC_REGISTRY,
  timers: TIMER_DEFINITIONS,
  reminders: WG_BUNDLE.reminders,
  chats: WG_BUNDLE.chats,
});
