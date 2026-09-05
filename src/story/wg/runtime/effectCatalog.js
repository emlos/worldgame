import { SKILLS, STATS } from "../../../characters/player/stats.js";
import { SCHOOL_SUBJECTS } from "../../../characters/player/education.js";
import { PLACE_REGISTRY } from "../../../world/data/place.js";
import { NPC_REGISTRY } from "../../../characters/npc/npcs.js";
import { TIMER_DEFINITIONS } from "../../../game/timerDefinitions.js";
import { WG_BUNDLE } from "../generated/scenes.js";
import { createWGEffectCatalog } from "../shared/effects/catalog.js";

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
