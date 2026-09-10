/** Keep pending announcements out of authored scene sequences. */
export function buildGlobalSceneAlerts(game) {
  if (game.currentStory) return [];
  return (game.dailyAnnouncements?.items || []).map((alert) => ({ ...alert }));
}
