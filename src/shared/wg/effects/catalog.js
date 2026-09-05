export function createWGEffectCatalog({
  skills,
  stats,
  subjects,
  placeRegistry,
  npcRegistry,
  timers,
  reminders,
  chats,
}) {
  const npcs = new Map(npcRegistry.map((npc) => [npc.id, npc]));
  const relationships = new Map();
  for (const npc of npcRegistry) {
    for (const [meterId, definition] of Object.entries(
      npc.relationshipProfile?.meters || {},
    )) {
      relationships.set(`${npc.id}.${meterId}`, definition);
    }
  }

  return Object.freeze({
    skills,
    stats,
    subjects,
    places: new Set([
      ...placeRegistry.map((place) => place.key),
      ...npcRegistry.map((npc) => `home_${npc.id}`),
    ]),
    npcs,
    relationships,
    timers,
    reminders,
    chats,
  });
}
