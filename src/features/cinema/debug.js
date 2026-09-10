import { requireDebugPlaceByKey } from "../../game/debugCommands.js";
import { CINEMA_PLACE_KEY } from "./programme.js";

export function teleportPlayerToCinema(game) {
  const destination = requireDebugPlaceByKey(game, CINEMA_PLACE_KEY);

  game.runAction({
    label: `[Debug] Teleport player to ${destination.place.name}`,
    apply(currentGame) {
      currentGame.moveTo(destination.location.id);
      currentGame.setCurrentPlace({ placeId: destination.place.id });
    },
  });

  return destination;
}
