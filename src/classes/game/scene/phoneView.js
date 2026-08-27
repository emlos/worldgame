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
