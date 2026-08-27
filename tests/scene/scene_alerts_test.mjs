import { Game } from "../../src/classes/game/game.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";
import { enterWGTarget } from "../../src/classes/game/scene/wg/storyRuntime.js";

const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function schoolAlert(game) {
  return buildScene(game).alerts.find((alert) => alert.id === "school-day");
}

const game = new Game({
  seed: 117,
  startDate: new Date("2026-08-31T23:59:00.000Z"),
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
check("the school reminder is absent before the semester starts", !schoolAlert(game));

game.advanceMinutes(1);
const midnightAlert = schoolAlert(game);
check(
  "crossing midnight into a school day creates the yellow reminder model",
  midnightAlert?.tone === "warning" &&
    midnightAlert.text === "Today is a school day. Classes start at 09:00.",
);

enterWGTarget(game, "example.passage-sequence");
check(
  "authored sequence passages receive the same global school reminder",
  schoolAlert(game)?.text === midnightAlert.text,
);

game.jumpToDate(new Date("2026-09-05T00:00:00.000Z"));
check("weekends do not show the school reminder", !schoolAlert(game));

game.jumpToDate(new Date("2026-12-25T00:00:00.000Z"));
check("day-off holidays do not show the school reminder", !schoolAlert(game));

game.jumpToDate(new Date("2026-12-16T00:00:00.000Z"));
check("dates outside configured semesters do not show the reminder", !schoolAlert(game));

if (failures.length) {
  console.error("\nScene alert failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All scene alert tests passed.");
}
