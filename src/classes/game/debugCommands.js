const DEFAULT_TEMPORARY_STAY_MINUTES = 30;

function requireNPC(game, npcId) {
  const id = String(npcId);
  const npc = game?.npcs?.get(id);
  if (!npc) throw new Error(`Unknown NPC '${id}'`);
  return npc;
}

export function teleportNPCToPlayer(
  game,
  npcId,
  { stayMinutes = DEFAULT_TEMPORARY_STAY_MINUTES } = {},
) {
  const npc = requireNPC(game, npcId);
  let relocation = null;

  game.runAction({
    label: `[Debug] Teleport ${npc.name} to the player`,
    apply(currentGame) {
      if (npc.brain) {
        relocation = npc.brain.relocateTemporarily(currentGame, {
          locationId: currentGame.currentLocationId,
          placeId: currentGame.currentPlaceId,
          stayMinutes,
        });
      } else {
        npc.setLocationAndPlace(
          currentGame.currentLocationId,
          currentGame.currentPlaceId,
        );
        relocation = {
          busyWithObligation: false,
          currentAction: null,
          nextDecisionAt: null,
        };
      }
    },
  });

  return { npc, ...relocation };
}

