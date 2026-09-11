import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import {
  CINEMA_GENRES,
  CINEMA_MOVIES,
} from "../src/features/cinema/movies.js";
import { buildPhoneRemindersView } from "../src/game/scene/phoneView.js";
import {
  CINEMA_TICKET_SALES_LATE_MINUTES,
  CINEMA_TICKET_SALES_LEAD_MINUTES,
  CINEMA_TICKET_PRICE,
  getCinemaProgramme,
  getCinemaScreenings,
} from "../src/features/cinema/programme.js";
import { CINEMA_SCREENING_REMINDER_ID } from "../src/features/cinema/reminders.js";
import { getEligibleWGPoolScenes } from "../src/story/wg/runtime/sceneExposure.js";
import { createWGRuntimeContext } from "../src/story/wg/runtime/runtimeContext.js";

function placePlayerAtCinema(game) {
  for (const location of game.world.locations.values()) {
    const cinema = location.places.find(({ key }) => key === "cinema");
    if (!cinema) continue;
    game.moveTo(String(location.id));
    game.setCurrentPlace({ placeId: String(cinema.id) });
    return cinema;
  }
  throw new Error("Generated world has no cinema");
}

function cinemaGame(at = "2026-09-03T12:00:00.000Z") {
  const game = new Game({
    seed: 7301,
    startDate: new Date(at),
    playerOptions: { startPlaceId: null, money: 100 },
  });
  placePlayerAtCinema(game);
  return game;
}

test("cinema has fifty films and rotates a deterministic four-film weekly programme", () => {
  assert.equal(CINEMA_MOVIES.length, 50);
  assert.equal(new Set(CINEMA_MOVIES.map(({ id }) => id)).size, 50);
  assert.equal(Object.keys(CINEMA_GENRES).length, 23);
  assert.ok(CINEMA_MOVIES.every(({ genreId, genre }) =>
    CINEMA_GENRES[genreId] === genre));

  const thisWeek = getCinemaProgramme(7301, new Date("2026-09-03T12:00:00.000Z"));
  const sameWeek = getCinemaProgramme(7301, new Date("2026-09-06T23:00:00.000Z"));
  const nextWeek = getCinemaProgramme(7301, new Date("2026-09-07T00:00:00.000Z"));
  assert.equal(thisWeek.length, 4);
  assert.deepEqual(sameWeek, thisWeek);
  assert.notDeepEqual(nextWeek, thisWeek);
});

test("every cinema genre has two eligible screening events", () => {
  const game = cinemaGame();

  for (const [genreId, genreLabel] of Object.entries(CINEMA_GENRES)) {
    const events = getEligibleWGPoolScenes(game, "cinema.screening", {
      eventData: {
        movieId: "test-movie",
        movieTitle: "Test Movie",
        genreId,
        genreLabel,
        screen: 1,
        arrivedLate: false,
        soldByCaro: false,
      },
    });
    assert.equal(events.length, 2, genreId);
    assert.ok(events.every(({ id }) =>
      id.startsWith(`cinema.screening.${genreId}.`)));
  }
});

test("cinema runs three screen-two films daily and all four on busy days", () => {
  const quietScreenings = getCinemaScreenings(
    7301,
    new Date("2026-09-03T12:00:00.000Z"),
  );
  const busyScreenings = getCinemaScreenings(
    7301,
    new Date("2026-09-05T12:00:00.000Z"),
  );
  const quietScreenTwo = quietScreenings.filter(({ screen }) => screen === 2);
  const busyScreenTwo = busyScreenings.filter(({ screen }) => screen === 2);

  assert.equal(quietScreenTwo.length, 3);
  assert.equal(new Set(quietScreenTwo.map(({ movie }) => movie.id)).size, 3);
  assert.equal(busyScreenTwo.length, 4);
  assert.equal(new Set(busyScreenTwo.map(({ movie }) => movie.id)).size, 4);
  assert.equal(new Set(busyScreenings.map(({ movie }) => movie.id)).size, 4);
  assert.ok(busyScreenings.some((screening, index) =>
    busyScreenings.some((other, otherIndex) =>
      otherIndex !== index && other.startsAt.getTime() === screening.startsAt.getTime(),
    ),
  ));
});

test("cinema hub shows the timetable and sells a £10 ticket during the sales window", () => {
  const game = cinemaGame("2026-09-03T12:15:00.000Z");
  const scene = buildScene(game);
  const timetable = scene.content[0];
  const screeningChoice = scene.sections
    .find(({ id }) => id === "screenings")
    .choices[0];

  assert.equal(timetable.type, "table");
  assert.equal(timetable.caption, "Today's screenings");
  assert.equal(timetable.rows.length, 7);
  assert.equal(screeningChoice.costs[0].amount, CINEMA_TICKET_PRICE);

  const beforeMoney = game.player.money;
  const beforeTime = game.now.getTime();
  performChoice(game, { sceneId: scene.id, choiceId: screeningChoice.id });
  assert.equal(game.player.money, beforeMoney - CINEMA_TICKET_PRICE);
  assert.equal(
    game.now.getTime() - beforeTime,
    screeningChoice.durationMinutes * 60_000,
  );
  assert.equal(game.currentPlace.key, "cinema");
});

test("cinema tickets are disabled when the player cannot afford one", () => {
  const game = cinemaGame("2026-09-03T12:15:00.000Z");
  game.player.adjustMoney(-game.player.money);
  const choices = buildScene(game).sections.find(({ id }) => id === "screenings").choices;
  assert.ok(choices.length > 0);
  assert.ok(choices.every(({ enabled }) => !enabled));
});

test("cinema tickets are shown only from fifteen minutes before through ten minutes after", () => {
  const cases = [
    [-(CINEMA_TICKET_SALES_LEAD_MINUTES + 1), false],
    [-CINEMA_TICKET_SALES_LEAD_MINUTES, true],
    [0, true],
    [CINEMA_TICKET_SALES_LATE_MINUTES, true],
    [CINEMA_TICKET_SALES_LATE_MINUTES + 1, false],
  ];

  for (const [offsetMinutes, expected] of cases) {
    const at = new Date("2026-09-03T12:30:00.000Z");
    at.setUTCMinutes(at.getUTCMinutes() + offsetMinutes);
    const game = cinemaGame(at.toISOString());
    const choices = buildScene(game).sections.find(({ id }) => id === "screenings").choices;
    assert.equal(
      choices.some(({ label }) => label.startsWith("12:30")),
      expected,
      `${offsetMinutes} minutes from the screening`,
    );
  }
});

test("entering a screening late finishes at its scheduled end time", () => {
  const game = cinemaGame("2026-09-03T12:40:00.000Z");
  const scene = buildScene(game);
  const screeningChoice = scene.sections
    .find(({ id }) => id === "screenings")
    .choices.find(({ label }) => label.startsWith("12:30"));
  const screening = getCinemaScreenings(game.seed, game.now)
    .find(({ id }) => id === screeningChoice.action.screeningId);

  performChoice(game, { sceneId: scene.id, choiceId: screeningChoice.id });

  assert.equal(game.now.getTime(), screening.endsAt.getTime());
  assert.equal(game.storyContinuations[0].data.arrivedLate, true);
});

test("a selected screening event exposes its movie data and survives saving", () => {
  const game = cinemaGame("2026-09-03T12:15:00.000Z");
  const scene = buildScene(game);
  const screeningChoice = scene.sections
    .find(({ id }) => id === "screenings")
    .choices[0];
  const screening = getCinemaScreenings(game.seed, game.now)
    .find(({ id }) => id === screeningChoice.action.screeningId);

  performChoice(game, { sceneId: scene.id, choiceId: screeningChoice.id });

  assert.ok(game.currentStory.id.startsWith(
    `cinema.screening.${screening.movie.genreId}.`,
  ));
  assert.equal(game.storyContinuations.length, 1);
  assert.deepEqual(game.storyContinuations[0].data, {
    movieId: screening.movie.id,
    movieTitle: screening.movie.title,
    genreId: screening.movie.genreId,
    genreLabel: screening.movie.genre,
    screen: screening.screen,
    arrivedLate: false,
    soldByCaro: false,
  });
  assert.equal(
    createWGRuntimeContext(game).event.data.movieTitle,
    screening.movie.title,
  );

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.deepEqual(restored.storyContinuations[0].data, game.storyContinuations[0].data);

  for (let step = 0; restored.currentStory && step < 3; step += 1) {
    const current = buildScene(restored);
    const choice = current.sections.flatMap(({ choices }) => choices)[0];
    assert.ok(choice);
    performChoice(restored, { sceneId: current.id, choiceId: choice.id });
  }
  assert.equal(restored.currentStory, null);
  assert.deepEqual(restored.storyContinuations, []);
  assert.equal(restored.currentPlace.key, "cinema");
});

test("each cinema timetable row has a validated reminder action", () => {
  const game = cinemaGame("2026-09-03T12:00:00.000Z");
  const scene = buildScene(game);
  const timetable = scene.content[0];

  assert.equal(timetable.columns.at(-1), "Reminder");
  assert.ok(timetable.rows.every((row) => row.at(-1).type === "action"));
  assert.ok(timetable.rows.every((row) =>
    row.at(-1).choice.action.type === "cinema.remind"));

  const reminderChoice = timetable.rows[0].at(-1).choice;
  const result = performChoice(game, {
    sceneId: scene.id,
    choiceId: reminderChoice.id,
  });
  assert.match(result.notice, /Reminder set/);
  assert.equal(game.featureState.cinema.screeningReminders.length, 1);

  const refreshedChoice = buildScene(game).content[0].rows[0].at(-1).choice;
  assert.equal(refreshedChoice.label, "Reminder set");
  assert.equal(refreshedChoice.enabled, false);

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.deepEqual(restored.featureState.cinema, game.featureState.cinema);
});

test("a screening reminder appears fifteen minutes before its film in every hub and then clears", () => {
  const game = cinemaGame("2026-09-03T12:00:00.000Z");
  game.dismissDailyAnnouncements();
  const cinema = buildScene(game);
  const reminderChoice = cinema.content[0].rows[0].at(-1).choice;
  performChoice(game, { sceneId: cinema.id, choiceId: reminderChoice.id });

  const scheduledPhoneReminder = buildPhoneRemindersView(game).groups
    .flatMap(({ items }) => items)
    .find(({ id }) => id === CINEMA_SCREENING_REMINDER_ID);
  assert.ok(scheduledPhoneReminder);
  assert.match(scheduledPhoneReminder.text, /Cinema:/);
  assert.match(scheduledPhoneReminder.text, /at 12:30, screen 1/);

  game.advanceMinutes(14);
  assert.equal(
    game.dailyAnnouncements.items.some(({ id }) => id === CINEMA_SCREENING_REMINDER_ID),
    false,
  );
  assert.equal(
    buildPhoneRemindersView(game).groups
      .flatMap(({ items }) => items)
      .some(({ id }) => id === CINEMA_SCREENING_REMINDER_ID),
    true,
  );

  game.advanceMinutes(1);
  const alert = game.dailyAnnouncements.items.find(
    ({ id }) => id === CINEMA_SCREENING_REMINDER_ID,
  );
  assert.ok(alert);
  assert.match(alert.text, /Cinema reminder/);
  assert.match(alert.text, /in 15 minutes/);
  const restoredDue = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.equal(restoredDue.featureState.cinema.screeningReminders[0].notified, true);
  assert.ok(restoredDue.dailyAnnouncements.items.some(
    ({ id }) => id === CINEMA_SCREENING_REMINDER_ID));

  game.setCurrentPlace();
  assert.ok(buildScene(game).alerts.some(({ id }) => id === CINEMA_SCREENING_REMINDER_ID));
  const home = game.world.findFirstPlaceByKey("player_home");
  game.moveTo(String(home.locationId));
  game.setCurrentPlace({ placeId: String(home.id) });
  assert.ok(buildScene(game).alerts.some(({ id }) => id === CINEMA_SCREENING_REMINDER_ID));
  assert.ok(buildPhoneRemindersView(game).groups
    .flatMap(({ items }) => items)
    .some(({ id }) => id === CINEMA_SCREENING_REMINDER_ID));

  game.advanceMinutes(15);
  assert.deepEqual(game.featureState.cinema.screeningReminders, []);
  assert.equal(
    game.dailyAnnouncements.items.some(({ id }) => id === CINEMA_SCREENING_REMINDER_ID),
    false,
  );
  assert.equal(
    buildPhoneRemindersView(game).groups
      .flatMap(({ items }) => items)
      .some(({ id }) => id === CINEMA_SCREENING_REMINDER_ID),
    false,
  );
});

test("rewinding before a screening reminder deadline resets notification state", () => {
  const game = cinemaGame("2026-09-03T12:00:00.000Z");
  const cinema = buildScene(game);
  const reminderChoice = cinema.content[0].rows[0].at(-1).choice;
  performChoice(game, { sceneId: cinema.id, choiceId: reminderChoice.id });

  game.advanceMinutes(15);
  assert.equal(game.featureState.cinema.screeningReminders[0].notified, true);
  assert.ok(game.dailyAnnouncements.items.some(
    ({ id }) => id === CINEMA_SCREENING_REMINDER_ID));

  game.jumpToDate(new Date("2026-09-03T12:00:00.000Z"));
  assert.equal(game.featureState.cinema.screeningReminders[0].notified, false);
  assert.equal(
    game.dailyAnnouncements.items.some(({ id }) => id === CINEMA_SCREENING_REMINDER_ID),
    false,
  );

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.deepEqual(restored.featureState.cinema, game.featureState.cinema);
});
