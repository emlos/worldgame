function findChoice(scene, choiceId) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.id === choiceId);
}

//TODO: action types as enum in data ?
//TODO: save returned strings in its own file like descriptions for localisation
export function performChoice(game, scene, choiceId) {
  const choice = findChoice(scene, choiceId);
  if (!choice) throw new Error(`Unknown choice: ${choiceId}`);

  const minutes = choice.durationMinutes || 0;
  const action = choice.action;

  if (action.type === "travel") {
    const destination = game.world.getLocation(action.targetLocationId);
    game.runAction({
      label: `Travel to ${destination.name}`,
      minutes,
      apply(currentGame) {
        currentGame.moveTo(action.targetLocationId);
      },
    });
    return `You arrive in ${destination.name}.`;
  }

  if (action.type === "enter") {
    const place = game.location.places.find(
      (candidate) => candidate.id === action.placeId,
    );
    game.runAction({
      label: `Enter ${place.name}`,
      minutes,
      apply(currentGame) {
        currentGame.setCurrentPlace({ placeId: place.id });
      },
    });
    return `You enter ${place.name}.`;
  }

  if (action.type === "leave") {
    const placeName = game.currentPlace?.name || "the building";
    game.runAction({
      label: `Leave ${placeName}`,
      minutes,
      apply(currentGame) {
        currentGame.setCurrentPlace();
      },
    });
    return `You step outside ${placeName}.`;
  }

  if (action.type === "loiter") {
    game.runAction({ label: "Loiter", minutes });
    return "You spend a little while watching the area around you.";
  }

  if (action.type === "greet") {
    const npc = game.npcs.get(action.npcId);
    game.runAction({
      label: `Greet ${npc.name}`,
      minutes,
      apply(currentGame) {
        currentGame.player.bumpRelationship(npc.id, 0.02);
      },
    });
    return `You say hello to ${npc.meta?.shortName || npc.name}.`;
  }

  throw new Error(`Unsupported choice action: ${action.type}`);
}
