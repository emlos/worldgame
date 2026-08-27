const DEFAULT_TEMPORARY_STAY_MINUTES = 30;
const DEBUG_MONEY_GRANT = 100;

function requireNPC(game, npcId) {
  const id = String(npcId);
  const npc = game?.npcs?.get(id);
  if (!npc) throw new Error(`Unknown NPC '${id}'`);
  return npc;
}

function requirePlaceByKey(game, placeKey) {
  const key = String(placeKey);
  for (const location of game?.world?.locations?.values?.() || []) {
    const place = (location.places || []).find(
      (candidate) => String(candidate.key) === key,
    );
    if (place) return { location, place };
  }
  throw new Error(`Unknown place key '${key}'`);
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

export function teleportPlayerToSchool(game) {
  const destination = requirePlaceByKey(game, "high_school");

  game.runAction({
    label: `[Debug] Teleport player to ${destination.place.name}`,
    apply(currentGame) {
      currentGame.moveTo(destination.location.id);
      currentGame.setCurrentPlace({ placeId: destination.place.id });
    },
  });

  return destination;
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
