import { SKILLS, STATS } from "../../../characters/player/stats.js";
import { PLACE_REGISTRY } from "../../../world/data/place.js";
import { NPC_REGISTRY } from "../../../characters/npc/npcs.js";
import { WG_BUNDLE } from "../generated/scenes.js";
import { createWGEffectCatalog } from "../shared/effects/catalog.js";

const catalogs = new WeakMap();
const EMPTY_FEATURES = Object.freeze({ timerDefinitions: Object.freeze({}) });

export function getWGRuntimeEffectCatalog(features) {
  const source = features ?? EMPTY_FEATURES;
  let catalog = catalogs.get(source);
  if (!catalog) {
    catalog = createWGEffectCatalog({
      skills: SKILLS,
      stats: STATS,
      subjects: source.wgReferenceCatalogs?.subjects ?? {},
      placeRegistry: PLACE_REGISTRY,
      npcRegistry: NPC_REGISTRY,
      timers: source.timerDefinitions,
      reminders: WG_BUNDLE.reminders,
      chats: WG_BUNDLE.chats,
    });
    catalogs.set(source, catalog);
  }
  return catalog;
}
