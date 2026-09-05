import { requireDebugPlaceByKey } from "../../game/debugCommands.js";
import { HIGH_SCHOOL_PLACE_KEY } from "./config.js";

export function teleportPlayerToSchool(game) {
  const destination = requireDebugPlaceByKey(game, HIGH_SCHOOL_PLACE_KEY);

  game.runAction({
    label: `[Debug] Teleport player to ${destination.place.name}`,
    apply(currentGame) {
      currentGame.moveTo(destination.location.id);
      currentGame.setCurrentPlace({ placeId: destination.place.id });
    },
  });

  return destination;
}
