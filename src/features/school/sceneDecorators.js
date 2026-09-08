import {
  SCHOOL_DAY_REMINDER_ID,
  schoolDayReminderText,
} from "./reminders.js";

function decorateHomeHub({ game, scene }) {
  if (
    game.dailyAnnouncements?.items?.some(
      (item) => item.id === SCHOOL_DAY_REMINDER_ID,
    )
  ) {
    return scene;
  }

  const warning = schoolDayReminderText(game);
  if (!warning) return scene;
  return {
    ...scene,
    content: [{ type: "paragraph", text: warning }, ...scene.content],
  };
}

export const SCHOOL_SCENE_DECORATORS = Object.freeze([
  Object.freeze({
    id: "home-school-day-warning",
    applies: ({ game, scene }) =>
      scene.kind === "place" &&
      game.currentPlaceId === game.homePlaceId &&
      game.hasFlag("location.player_home_opening_seen"),
    decorate: decorateHomeHub,
  }),
]);
