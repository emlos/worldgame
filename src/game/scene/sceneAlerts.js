/** Expose the current one-passage announcement batch in every scene kind. */
export function buildGlobalSceneAlerts(game) {
  return (game.dailyAnnouncements?.items || []).map((alert) => ({ ...alert }));
}
