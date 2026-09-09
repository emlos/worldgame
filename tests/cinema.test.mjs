import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { CINEMA_MOVIES } from "../src/features/cinema/movies.js";
import {
  CINEMA_TICKET_PRICE,
  getCinemaProgramme,
  getCinemaScreenings,
} from "../src/features/cinema/programme.js";

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

  const thisWeek = getCinemaProgramme(7301, new Date("2026-09-03T12:00:00.000Z"));
  const sameWeek = getCinemaProgramme(7301, new Date("2026-09-06T23:00:00.000Z"));
  const nextWeek = getCinemaProgramme(7301, new Date("2026-09-07T00:00:00.000Z"));
  assert.equal(thisWeek.length, 4);
  assert.deepEqual(sameWeek, thisWeek);
  assert.notDeepEqual(nextWeek, thisWeek);
});

test("cinema supplies daily screenings with simultaneous busy-day showings", () => {
  const screenings = getCinemaScreenings(7301, new Date("2026-09-05T12:00:00.000Z"));
  assert.ok(screenings.length > 4);
  assert.equal(new Set(screenings.map(({ movie }) => movie.id)).size, 4);
  assert.ok(screenings.some((screening, index) =>
    screenings.some((other, otherIndex) =>
      otherIndex !== index && other.startsAt.getTime() === screening.startsAt.getTime(),
    ),
  ));
});

test("cinema hub shows the timetable and sells a £10 ticket", () => {
  const game = cinemaGame();
  const scene = buildScene(game);
  const timetable = scene.content[0];
  const screeningChoice = scene.sections
    .find(({ id }) => id === "screenings")
    .choices[0];

  assert.equal(timetable.type, "table");
  assert.equal(timetable.caption, "Today's screenings");
  assert.equal(timetable.rows.length, 5);
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
  const game = cinemaGame();
  game.player.adjustMoney(-game.player.money);
  const choices = buildScene(game).sections.find(({ id }) => id === "screenings").choices;
  assert.ok(choices.length > 0);
  assert.ok(choices.every(({ enabled }) => !enabled));
});

test("a screening remains available at its exact advertised start time", () => {
  const game = cinemaGame("2026-09-03T12:30:00.000Z");
  const choices = buildScene(game).sections.find(({ id }) => id === "screenings").choices;
  assert.ok(choices.some(({ label }) => label.startsWith("12:30")));
});
