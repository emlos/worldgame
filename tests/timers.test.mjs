import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { performChoice } from "../src/classes/game/scene/choiceEngine.js";
import { buildScene } from "../src/classes/game/scene/sceneEngine.js";
import { applyWGEffect } from "../src/classes/game/scene/wg/effectRuntime.js";
import {
  initialTimerDeadline,
  nextTimerDeadlineForSchedule,
} from "../src/classes/game/timers.js";
import { parseWGDocument } from "../tools/wg/compiler/sourceParser.js";

const DAY_MINUTES = 24 * 60;

function choose(game, id) {
  const scene = buildScene(game);
  const choice = scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.id === id);
  assert.ok(choice, `expected choice '${id}' in '${scene.id}'`);
  performChoice(game, { sceneId: scene.id, choiceId: id });
}

function placePlayerAtKimOffice(game) {
  game.unlockPlacesByKey("home_kim");
  for (const location of game.world.locations.values()) {
    const office = location.places.find((place) => place.key === "home_kim");
    if (!office) continue;
    if (String(location.id) !== String(game.currentLocationId)) {
      game.moveTo(String(location.id));
    }
    game.setCurrentPlace({ placeId: String(office.id) });
    return;
  }
  throw new Error("The generated test world has no Kim office");
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

test("resync skips callbacks and advances the recurring deadline", () => {
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

test("timer callback failures roll back time and timer state", () => {
  const game = new Game({ seed: 704, startDate: new Date("2026-09-04T12:00:00.000Z") });
  game.story.rent = 5;
  game.startTimer("rent.weekly");
  const before = game.toJSON();

  assert.throws(() => game.advanceMinutes(7 * DAY_MINUTES), /non-object story path/);
  assert.deepEqual(game.toJSON(), before);
});

test("WG timer effects compile and preserve their lifecycle semantics", () => {
  const document = parseWGDocument({
    file: "test-timer.wg",
    source: [
      ":: test-timer",
      "",
      '@choice begin "Begin" -> @exit',
      "  @effect timer start rent.weekly",
      "@endchoice",
    ].join("\n"),
  });
  assert.deepEqual(document.scenes[0].body[0].effects[0], {
    op: "timer",
    action: "start",
    id: "rent.weekly",
    source: { file: "test-timer.wg", line: 4, column: 1 },
  });
  assert.throws(
    () => parseWGDocument({
      file: "test-timer.wg",
      source: ":: test-timer\n\n@effect timer start missing.timer",
    }),
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

test("save version 30 requires valid named timer state", () => {
  const game = new Game({ seed: 706 });
  game.startTimer("rent.weekly");
  const save = game.toJSON();
  assert.equal(save.saveVersion, 30);

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

  choose(game, "rent-intro");
  assert.deepEqual(game.story.rent, {
    active: true,
    debt: 800,
    chargesIssued: 0,
  });
  assert.equal(game.reminders.has("rent_due"), true);

  choose(game, "arrange");
  assert.ok(game.timers["rent.weekly"]);
  choose(game, "__wg_next");

  for (let payment = 0; payment < 4; payment += 1) {
    choose(game, "pay-rent");
    choose(game, "__wg_next");
  }

  assert.equal(game.player.money, 0);
  assert.equal(game.story.rent.debt, 0);
  assert.equal(game.reminders.has("rent_due"), false);
  assert.ok(game.timers["rent.weekly"], "clearing debt must not stop weekly rent");
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
