const DEFAULT_TEMPORARY_STAY_MINUTES = 30;
const DEBUG_MONEY_GRANT = 100;

function requireNPC(game, npcId) {
  const id = String(npcId);
  const npc = game?.npcs?.get(id);
  if (!npc) throw new Error(`Unknown NPC '${id}'`);
  return npc;
}

export function addDebugMoney(game) {
  let balance = null;

  game.runAction({
    label: `[Debug] Add £${DEBUG_MONEY_GRANT} to the player`,
    apply(currentGame) {
      balance = currentGame.player.adjustMoney(DEBUG_MONEY_GRANT);
    },
  });

  return balance;
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
