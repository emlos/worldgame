export function buildSceneStatus(game) {
  return {
    now: game.now.toISOString(),
    weather: game.world.currentWeather,
    temperatureC: game.world.temperature,
  };
}
