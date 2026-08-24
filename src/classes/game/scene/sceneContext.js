export function getNPCsAtPlayerPosition(game) {
  return game.npcsArray.filter(
    (npc) =>
      String(npc.locationId) === String(game.currentLocationId) &&
      String(npc.currentPlaceId ?? "") === String(game.currentPlaceId ?? ""),
  );
}

export function buildSceneStatus(game) {
  return {
    now: game.now.toISOString(), //TODO: make sure UTC time - same as the date class uses
    weather: game.world.currentWeather,
    temperatureC: game.world.temperature,
  };
}
