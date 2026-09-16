import { buildScene } from "../../game/scene/sceneEngine.js";

/**
 * Build and present the current scene, acknowledging transient announcements only
 * after the renderer has completed successfully.
 */
export function presentScene(game, renderScene, preludeParagraphs = []) {
  if (typeof renderScene !== "function") {
    throw new TypeError("Scene presentation requires a render function");
  }

  const scene = buildScene(game);
  const hasAlerts = scene.alerts.length > 0;
  renderScene(scene, preludeParagraphs);
  if (hasAlerts) game.dismissDailyAnnouncements();
  return scene;
}
