export function buildSceneStatus(game) {
  return {
    now: game.now.toISOString(), //TODO: make sure UTC time - same as the date class uses
    weather: game.world.currentWeather,
    temperatureC: game.world.temperature,
  };
}
