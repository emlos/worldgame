function evaluatedStats(character) {
  const values = {};
  for (const name of Object.keys(character.stats || {})) {
    values[name] = character.getStatValue(name);
  }
  return values;
}

function pronounValues(character) {
  return { ...(character.pronouns || {}) };
}

function playerContext(player) {
  return {
    ...evaluatedStats(player),
    ...pronounValues(player),
    gender: player.gender,
  };
}

function npcContext(game, npc) {
  const shortName = npc.meta?.shortName || npc.name;
  return {
    ...evaluatedStats(npc),
    ...pronounValues(npc),
    id: npc.id,
    name: npc.name,
    shortName,
    age: npc.age,
    gender: npc.gender,
    relationship: game.player.getRelationship(npc.id).score,
    present: game.getNPCsAtCurrentPosition().includes(npc),
    flags: { ...(npc.flags || {}) },
  };
}

export function createWGRuntimeContext(game) {
  const npcs = {};
  for (const [id, npc] of game.npcs) npcs[id] = npcContext(game, npc);

  const flags = {};
  for (const flag of game.flags) flags[flag] = true;

  return {
    story: game.story,
    player: playerContext(game.player),
    npc: npcs,
    flags,
  };
}
