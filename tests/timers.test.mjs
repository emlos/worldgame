import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { applyWGEffect } from "../src/story/wg/runtime/effectRuntime.js";
import { getEligibleWGPoolScenes } from "../src/story/wg/runtime/sceneExposure.js";
import {
  initialTimerDeadline,
  nextTimerDeadlineForSchedule,
} from "../src/game/timers.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const DAY_MINUTES = 24 * 60;

function choose(game, identity) {
  const scene = buildScene(game);
  const choice = scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.id === identity || candidate.label === identity);
  assert.ok(choice, `expected choice '${identity}' in '${scene.id}'`);
  performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

function findPlaceByKey(game, placeKey) {
  for (const location of game.world.locations.values()) {
    const place = location.places.find((candidate) => candidate.key === placeKey);
    if (place) return { location, place };
  }
  throw new Error(`The generated test world has no '${placeKey}' place`);
}

function placePlayerAtKimOffice(game) {
  game.unlockPlacesByKey("home_kim");
  const { location, place } = findPlaceByKey(game, "home_kim");
  if (String(location.id) !== String(game.currentLocationId)) {
    game.moveTo(String(location.id));
  }
  game.setCurrentPlace({ placeId: String(place.id) });
}

function landlordVisitIsEligible(game) {
  return getEligibleWGPoolScenes(game, "interrupt").some(
    (scene) => scene.id === "story.rent.landlord-visit",
  );
}

test("timer schedule calculations use UTC calendar boundaries", () => {
  assert.equal(
    initialTimerDeadline(
      { kind: "interval", hours: 12 },
      "2026-09-04T12:30:00.000Z",
    ).toISOString(),
    "2026-09-05T00:30:00.000Z",
  );
  assert.equal(
    initialTimerDeadline(
      { kind: "once", afterHours: 3 },
      "2026-09-04T12:30:00.000Z",
    ).toISOString(),
    "2026-09-04T15:30:00.000Z",
  );
  assert.equal(
    initialTimerDeadline(
      { kind: "weekly", weekday: 1, at: "09:00" },
      "2026-09-07T09:00:00.000Z",
    ).toISOString(),
    "2026-09-14T09:00:00.000Z",
  );
  assert.equal(
    initialTimerDeadline(
      { kind: "monthly", day: 31, at: "09:00" },
      "2026-01-31T10:00:00.000Z",
    ).toISOString(),
    "2026-02-28T09:00:00.000Z",
  );
  assert.equal(
    nextTimerDeadlineForSchedule(
      { kind: "monthly", day: 31, at: "09:00" },
      "2026-02-28T09:00:00.000Z",
    ).toISOString(),
    "2026-03-31T09:00:00.000Z",
  );
});

test("start is idempotent, restart is fresh, stop removes, and IDs are strict", () => {
  const game = new Game({ seed: 701, startDate: new Date("2026-09-04T12:00:00.000Z") });

  assert.equal(game.startTimer("rent.weekly"), true);
  const original = game.timers["rent.weekly"].dueAt;
  assert.equal(game.startTimer("rent.weekly"), false);
  assert.equal(game.timers["rent.weekly"].dueAt, original);

  game.advanceMinutes(60);
  assert.equal(game.restartTimer("rent.weekly"), true);
  assert.equal(game.timers["rent.weekly"].dueAt, "2026-09-11T13:00:00.000Z");
  assert.equal(game.stopTimer("rent.weekly"), true);
  assert.deepEqual(game.timers, {});
  assert.throws(() => game.startTimer("missing.timer"), /Unknown timer/);
  assert.throws(() => game.startTimer("constructor"), /Unknown timer/);
});

test("simulated time fires every crossed rent deadline without drift", () => {
  const game = new Game({ seed: 702, startDate: new Date("2026-09-04T12:00:00.000Z") });
  game.story.rent = { active: true, debt: 800, chargesIssued: 0 };
  game.startTimer("rent.weekly");

  game.advanceMinutes(21 * DAY_MINUTES);

  assert.deepEqual(game.story.rent, {
    active: true,
    debt: 1400,
    chargesIssued: 3,
  });
  assert.equal(game.reminders.has("rent_due"), true);
  assert.deepEqual(game.timers["rent.weekly"], {
    dueAt: "2026-10-02T12:00:00.000Z",
    occurrences: 3,
  });

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.deepEqual(restored.timers, game.timers);
  assert.deepEqual(restored.story.rent, game.story.rent);
});

test("resync skips timer effects and advances the recurring deadline", () => {
  const game = new Game({ seed: 703, startDate: new Date("2026-09-01T12:00:00.000Z") });
  game.story.rent = { active: true, debt: 800, chargesIssued: 0 };
  game.startTimer("rent.weekly");

  game.jumpToDate("2026-10-01T12:00:00.000Z");

  assert.equal(game.story.rent.debt, 800);
  assert.equal(game.story.rent.chargesIssued, 0);
  assert.deepEqual(game.timers["rent.weekly"], {
    dueAt: "2026-10-06T12:00:00.000Z",
    occurrences: 0,
  });

  game.advanceMinutes(5 * DAY_MINUTES);
  assert.equal(game.story.rent.debt, 1000);
  assert.equal(game.timers["rent.weekly"].occurrences, 1);
});

test("timer effect failures propagate without restoring prior state", () => {
  const game = new Game({ seed: 704, startDate: new Date("2026-09-04T12:00:00.000Z") });
  game.story.rent = 5;
  game.startTimer("rent.weekly");

  assert.throws(() => game.advanceMinutes(7 * DAY_MINUTES), /non-object story path/);
  assert.equal(game.now.toISOString(), "2026-09-11T12:00:00.000Z");
  assert.deepEqual(game.timers["rent.weekly"], {
    dueAt: "2026-09-18T12:00:00.000Z",
    occurrences: 1,
  });
  assert.equal(game.story.rent, 5);
});

test("WG timer effects compile and preserve their lifecycle semantics", () => {
  const bundle = compileStorySources([{
    file: "test-timer.wg",
    source: [
      ":: test-timer",
      "",
      '@choice "Begin" -> @exit',
      "  @effect timer start rent.weekly",
      "@endchoice",
    ].join("\n"),
  }]);
  assert.deepEqual(bundle.scenes["test-timer"].passages[0].body[0].effects[0], {
    op: "timer",
    action: "start",
    id: "rent.weekly",
    source: { file: "test-timer.wg", line: 4, column: 1 },
  });
  assert.throws(
    () => compileStorySources([{
      file: "test-timer.wg",
      source: ":: test-timer\n\n@effect timer start missing.timer",
    }]),
    /unknown timer/i,
  );

  const game = new Game({ seed: 705, startDate: new Date("2026-09-04T12:00:00.000Z") });
  applyWGEffect(game, { op: "timer", action: "start", id: "rent.weekly" });
  const dueAt = game.timers["rent.weekly"].dueAt;
  applyWGEffect(game, { op: "timer", action: "start", id: "rent.weekly" });
  assert.equal(game.timers["rent.weekly"].dueAt, dueAt);
  applyWGEffect(game, { op: "timer", action: "stop", id: "rent.weekly" });
  assert.deepEqual(game.timers, {});
});

test("save version 39 requires valid named timer state", () => {
  const game = new Game({ seed: 706 });
  game.startTimer("rent.weekly");
  const save = game.toJSON();
  assert.equal(save.saveVersion, 39);

  const missing = JSON.parse(JSON.stringify(save));
  delete missing.timers;
  assert.throws(() => Game.fromJSON(missing), /save\.timers.*required/);

  const unknown = JSON.parse(JSON.stringify(save));
  unknown.timers["missing.timer"] = unknown.timers["rent.weekly"];
  assert.throws(() => Game.fromJSON(unknown), /unknown timer/);
});

test("the authored rent flow starts weekly charges and accepts £200 payments", () => {
  const game = new Game({ seed: 707, startDate: new Date("2026-09-04T12:00:00.000Z") });
  placePlayerAtKimOffice(game);
  game.setFlag("rent_intro_2", true);
  game.player.adjustMoney(800);

  choose(game, "Ask about the rent");
  assert.deepEqual(game.story.rent, {
    active: true,
    debt: 800,
    chargesIssued: 0,
  });
  assert.equal(game.reminders.has("rent_due"), true);

  choose(game, '"I don\'t have £800"');
  choose(game, "__wg_next");
  assert.ok(game.timers["rent.weekly"]);
  choose(game, "__wg_next");

  for (let payment = 0; payment < 4; payment += 1) {
    choose(game, "Pay £200 toward rent");
    choose(game, "__wg_next");
  }

  assert.equal(game.player.money, 0);
  assert.equal(game.story.rent.debt, 0);
  assert.equal(game.reminders.has("rent_due"), false);
  assert.ok(game.timers["rent.weekly"], "clearing debt must not stop weekly rent");
});

test("Kim's visit becomes eligible at 16:00 on September 2", () => {
  const game = new Game({
    seed: 713,
    startDate: new Date("2026-09-01T07:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  game.setFlag("opening_seen");

  game.jumpToDate("2026-09-01T15:59:00.000Z");
  assert.equal(landlordVisitIsEligible(game), false);
  game.jumpToDate("2026-09-01T16:00:00.000Z");
  assert.equal(landlordVisitIsEligible(game), false);
  game.jumpToDate("2026-09-01T23:59:00.000Z");
  assert.equal(landlordVisitIsEligible(game), false);
  game.jumpToDate("2026-09-02T15:59:00.000Z");
  assert.equal(landlordVisitIsEligible(game), false);
  game.jumpToDate("2026-09-02T16:00:00.000Z");
  assert.equal(landlordVisitIsEligible(game), true);
});

test("Kim intercepts an unfinished rent introduction after 16:00 on September 2", () => {
  const game = new Game({
    seed: 709,
    startDate: new Date("2026-09-01T15:50:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  game.setFlag("opening_seen");
  game.setFlag("home_notice_read");
  game.setFlag("home_notice_resolved");
  game.addContact("kim");
  game.startChat("kim.rent");
  game.jumpToDate("2026-09-02T15:50:00.000Z");

  const kim = game.npcs.get("kim");
  const thread = game.chats.threads.kim;
  assert.equal(thread.active?.chatId, "kim.rent");

  choose(game, "loiter:15");

  assert.equal(game.currentStory?.id, "story.rent.landlord-visit");
  assert.equal(game.hasFlag("rent_intro_bypassed"), true);
  assert.equal(game.hasFlag("rent_landlord_visit_seen"), true);
  assert.equal(kim.locationId, game.currentLocationId);
  assert.equal(kim.currentPlaceId, game.currentPlaceId);
  assert.equal(thread.active, null);
  assert.ok(thread.completed.includes("kim.rent"));
  assert.match(
    JSON.stringify(buildScene(game).content),
    /gone far enough by message/,
  );

  choose(game, "Go with Kim");

  assert.equal(game.currentStory?.id, "story.rent.intro.2");
  assert.equal(game.currentPlace?.key, "home_kim");
  assert.equal(game.currentLocationId, kim.homeLocationId);
  assert.equal(game.currentPlaceId, kim.homePlaceId);
  assert.equal(kim.locationId, kim.homeLocationId);
  assert.equal(kim.currentPlaceId, kim.homePlaceId);
  assert.deepEqual(game.story.rent, {
    active: true,
    debt: 800,
    chargesIssued: 0,
  });
  assert.match(
    JSON.stringify(buildScene(game).content),
    /finally have your attention/,
  );

  choose(game, '"I don\'t have £800"');
  choose(game, "__wg_next");
  assert.ok(game.timers["rent.weekly"]);
  choose(game, "__wg_next");

  game.advanceMinutes(24 * 60);
  assert.equal(kim.locationId, kim.homeLocationId);
  assert.equal(kim.currentPlaceId, kim.homePlaceId);

  const home = findPlaceByKey(game, "player_home");
  game.moveTo(String(home.location.id));
  game.setCurrentPlace();
  const outsideHome = buildScene(game);
  assert.equal(
    outsideHome.sections
      .flatMap((section) => section.choices)
      .some((choice) => choice.label === "Check the notice on the door"),
    false,
  );
});

test("Kim comes in person when the player ignores the rent notice", () => {
  const game = new Game({
    seed: 710,
    startDate: new Date("2026-09-01T15:50:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  game.setFlag("opening_seen");
  game.jumpToDate("2026-09-02T15:50:00.000Z");

  choose(game, "loiter:15");

  assert.equal(game.currentStory?.id, "story.rent.landlord-visit");
  assert.equal(game.hasFlag("home_notice_read"), false);
  assert.equal(game.hasFlag("rent_intro_bypassed"), true);
  assert.equal(game.chats.threads.kim, undefined);
  assert.match(
    JSON.stringify(buildScene(game).content),
    /haven't even looked at it/,
  );
});

test("sleeping at home cannot skip Kim's post-16:00 knock", () => {
  const game = new Game({
    seed: 711,
    startDate: new Date("2026-09-01T07:00:00.000Z"),
  });
  game.setFlag("opening_seen");
  game.jumpToDate("2026-09-02T07:00:00.000Z");
  game.player.setStatBase("energy", 100);

  choose(game, "Go to Bed");
  choose(game, "8 hours");
  choose(game, "__wg_next");
  assert.equal(game.now.toISOString(), "2026-09-02T15:00:00.000Z");
  assert.equal(game.currentStory, null);

  choose(game, "Go to Bed");
  choose(game, "1 hour");
  assert.equal(game.currentStory?.id, "menu.player.home.rest");
  assert.equal(game.interruptState.pending?.sceneId, "story.rent.landlord-visit");

  choose(game, "__wg_next");
  assert.equal(game.currentStory?.id, "story.rent.landlord-visit");
  assert.match(JSON.stringify(buildScene(game).content), /knock rattles your front door/);
});

test("entering Kim's office after 16:00 cannot bypass the rent discussion", () => {
  const game = new Game({
    seed: 712,
    startDate: new Date("2026-09-01T16:05:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  game.setFlag("opening_seen");
  game.setFlag("rent_intro_2");
  game.jumpToDate("2026-09-02T16:05:00.000Z");
  game.unlockPlacesByKey("home_kim");
  const { location, place } = findPlaceByKey(game, "home_kim");
  game.moveTo(String(location.id));

  choose(game, `enter:${place.id}`);

  assert.equal(game.currentStory?.id, "story.rent.landlord-visit");
  assert.equal(game.currentPlace?.key, "home_kim");
  assert.match(JSON.stringify(buildScene(game).content), /settling the account now/);
  choose(game, "Sit down with Kim");
  assert.equal(game.currentStory?.id, "story.rent.intro.2");
  assert.equal(game.story.rent.active, true);
});

test("rent debt unlocks the authored one-shot escalation interrupt", () => {
  const game = new Game({
    seed: 708,
    startDate: new Date("2026-09-04T12:00:00.000Z"),
    playerOptions: { startPlaceId: null },
  });
  game.story.rent = { active: true, debt: 1000, chargesIssued: 1 };
  game.startTimer("rent.weekly");
  game.timers["rent.weekly"].dueAt = "2026-09-04T12:01:00.000Z";

  choose(game, "loiter:15");

  assert.equal(game.story.rent.debt, 1200);
  assert.equal(game.currentStory?.id, "story.rent.debt-escalation");
  assert.equal(game.flags.has("rent_debt_escalation_seen"), true);
});
