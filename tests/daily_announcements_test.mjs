import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import {
  enterWGScene,
  enterWGSequence,
  resolveActiveWGStory,
} from "../src/classes/game/scene/wg/storyRuntime.js";
import { WG_BUNDLE } from "../src/generated/wg/scenes.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const source = `
:: test.arm-announcements
@heading "Arm announcements"

@choice wait "Wait until after midnight" -> @exit
  @time 15m
  @effect flag announcement_vega_station true
  @effect flag announcement_school_project_last_day true
@endchoice

@sequence test.announcement-next -> @exit
@heading "Announcement sequence"

First passage.

@next

Second passage.

@next "Finish"
@endsequence
`;

const compiled = compileStorySources([
  { file: "story/tests/daily-announcements.wg", source },
]);
Object.assign(WG_BUNDLE.scenes, compiled.scenes);
Object.assign(WG_BUNDLE.sequences, compiled.sequences);

function findChoice(scene, predicate) {
  return scene.sections
    .flatMap((section) => section.choices)
    .find(predicate);
}

function enterScene(game, sceneId) {
  enterWGScene(game, sceneId);
  resolveActiveWGStory(game);
}

function enterSequence(game, sequenceId) {
  enterWGSequence(game, sequenceId);
  resolveActiveWGStory(game);
}

const openingGame = new Game({
  seed: 730,
  startDate: new Date("2026-09-01T07:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});

assert.equal(openingGame.dailyAnnouncements.day, "2026-09-01");
assert.deepEqual(openingGame.dailyAnnouncements.items, [
  {
    id: "school-day",
    tone: "info",
    text: "Today is a school day. Classes start at [warning]09:00[/warning].",
  },
]);
assert.deepEqual(buildScene(openingGame).alerts, openingGame.dailyAnnouncements.items);
assert.deepEqual(buildScene(openingGame).alerts, openingGame.dailyAnnouncements.items);

const openingSave = JSON.parse(JSON.stringify(openingGame));
const openingRestored = Game.fromJSON(openingSave);
assert.deepEqual(openingRestored.dailyAnnouncements, openingGame.dailyAnnouncements);
assert.equal(openingRestored.toJSON().saveVersion, 21);

const rollbackBatch = JSON.parse(JSON.stringify(openingGame.dailyAnnouncements));
assert.throws(
  () =>
    openingGame.runAction({
      label: "Failed action",
      apply() {
        throw new Error("deliberate announcement rollback");
      },
    }),
  /deliberate announcement rollback/,
);
assert.deepEqual(openingGame.dailyAnnouncements, rollbackBatch);

let scene = buildScene(openingGame);
const loiter = findChoice(scene, (choice) => choice.id === "loiter:15");
assert.ok(loiter);
performChoice(openingGame, { sceneId: scene.id, choiceId: loiter.id });
assert.deepEqual(openingGame.dailyAnnouncements.items, []);
assert.deepEqual(buildScene(openingGame).alerts, []);

const midnightGame = new Game({
  seed: 731,
  startDate: new Date("2026-09-01T23:55:00.000Z"),
  playerOptions: { startPlaceId: null },
});
enterScene(midnightGame, "test.arm-announcements");
scene = buildScene(midnightGame);
const wait = findChoice(scene, (choice) => choice.id === "wait");
assert.ok(wait);
performChoice(midnightGame, { sceneId: scene.id, choiceId: wait.id });

assert.equal(midnightGame.now.toISOString(), "2026-09-02T00:10:00.000Z");
assert.equal(midnightGame.dailyAnnouncements.day, "2026-09-02");
assert.deepEqual(
  midnightGame.dailyAnnouncements.items.map((announcement) => announcement.id),
  ["school-day", "vega-station", "school-project-last-day"],
);
assert.equal(midnightGame.hasFlag("announcement_vega_station"), true);
assert.equal(midnightGame.hasFlag("announcement_school_project_last_day"), true);
assert.deepEqual(buildScene(midnightGame).alerts, midnightGame.dailyAnnouncements.items);

const midnightRestored = Game.fromJSON(JSON.parse(JSON.stringify(midnightGame)));
assert.deepEqual(midnightRestored.dailyAnnouncements, midnightGame.dailyAnnouncements);

enterSequence(midnightGame, "test.announcement-next");
scene = buildScene(midnightGame);
assert.equal(scene.alerts.length, 3);
const next = findChoice(scene, (choice) => choice.action?.type === "wg-next");
assert.ok(next);
performChoice(midnightGame, { sceneId: scene.id, choiceId: next.id });
assert.deepEqual(midnightGame.dailyAnnouncements.items, []);
assert.deepEqual(buildScene(midnightGame).alerts, []);
assert.equal(
  midnightGame.hasFlag("announcement_vega_station"),
  true,
  "dismissing a batch must not unset its source flag",
);

midnightGame.jumpToDate(new Date("2026-09-03T00:10:00.000Z"));
assert.deepEqual(
  midnightGame.dailyAnnouncements.items.map((announcement) => announcement.id),
  ["school-day", "vega-station", "school-project-last-day"],
  "persistent source flags should announce again on the next day",
);

midnightGame.setFlag("announcement_vega_station", false);
midnightGame.setFlag("announcement_school_project_last_day", false);
midnightGame.jumpToDate(new Date("2026-09-04T00:10:00.000Z"));
assert.deepEqual(
  midnightGame.dailyAnnouncements.items.map((announcement) => announcement.id),
  ["school-day"],
);

const weekendGame = new Game({
  seed: 732,
  startDate: new Date("2026-09-05T07:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});
assert.deepEqual(weekendGame.dailyAnnouncements.items, []);

console.log("Daily announcement lifecycle checks passed.");
