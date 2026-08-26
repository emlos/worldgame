import { getSchoolDayPlan, SCHEDULE } from "../../../data/player/schedule.js";

/** Build the player's read-only diary entry for a particular game day. */
export function buildPlayerDiaryView(
  game,
  { date = game.now, playerSchedule = SCHEDULE } = {},
) {
  return getSchoolDayPlan(game, {
    date,
    schoolEnabled: playerSchedule?.school,
  });
}
