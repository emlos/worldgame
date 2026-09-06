import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Game } from "../src/game/game.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  createLayeredImageVisual,
  LAYERED_IMAGE_VISUAL_TYPE,
} from "../src/game/scene/layeredImage.js";
import {
  districtBaseVisualSource,
  getCelestialVisualFrame,
  LOCATION_HUB_VISUAL_HEIGHT,
  LOCATION_HUB_VISUAL_WIDTH,
} from "../src/game/scene/locationHubVisual.js";
import { LOCATION_REGISTRY } from "../src/world/data/location.js";
import { Season } from "../src/world/data/season.js";
import {
  getDaylightAt,
  getDaylightWindow,
} from "../src/world/model/daylight.js";

function assetUrl(path) {
  return new URL(`../${path}`, import.meta.url);
}

function pngDimensions(path) {
  const bytes = readFileSync(assetUrl(path));
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", `${path} is a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test("every district and celestial frame has a canonical 256x64 asset", () => {
  const paths = LOCATION_REGISTRY.map(({ key }) => districtBaseVisualSource(key));
  for (const kind of ["sun", "moon"]) {
    for (let frame = 1; frame <= 5; frame += 1) {
      paths.push(
        `assets/locations/time/${kind}_${String(frame).padStart(2, "0")}.png`,
      );
    }
  }

  assert.equal(LOCATION_REGISTRY.length, 23);
  assert.equal(new Set(paths).size, 33);
  for (const path of paths) {
    assert.deepEqual(pngDimensions(path), {
      width: LOCATION_HUB_VISUAL_WIDTH,
      height: LOCATION_HUB_VISUAL_HEIGHT,
    });
  }
});

test("each season has its configured daylight window", () => {
  const examples = [
    ["2026-01-15T12:00:00.000Z", Season.WINTER, 8, 16],
    ["2026-04-15T12:00:00.000Z", Season.SPRING, 6, 19],
    ["2026-07-15T12:00:00.000Z", Season.SUMMER, 5, 21],
    ["2026-10-15T12:00:00.000Z", Season.AUTUMN, 7, 18],
  ];

  for (const [timestamp, season, sunriseHour, sunsetHour] of examples) {
    const result = getDaylightWindow(new Date(timestamp));
    assert.equal(result.season, season, timestamp);
    assert.equal(result.sunrise.getUTCHours(), sunriseHour, timestamp);
    assert.equal(result.sunset.getUTCHours(), sunsetHour, timestamp);
  }
});

test("seasonal daylight resolves transitions and nights across calendar boundaries", () => {
  assert.equal(getDaylightAt("2026-01-15T07:59:59.999Z").period, "night");
  assert.equal(getDaylightAt("2026-01-15T08:00:00.000Z").period, "day");
  assert.equal(getDaylightAt("2026-01-15T15:59:59.999Z").period, "day");
  assert.equal(getDaylightAt("2026-01-15T16:00:00.000Z").period, "night");

  assert.equal(getDaylightAt("2026-01-15T17:00:00.000Z").period, "night");
  assert.equal(getDaylightAt("2026-07-15T17:00:00.000Z").period, "day");

  const boundaryNight = getDaylightAt("2026-03-01T00:00:00.000Z");
  assert.equal(boundaryNight.season, Season.SPRING);
  assert.equal(boundaryNight.period, "night");
  assert.equal(boundaryNight.startsAt.toISOString(), "2026-02-28T16:00:00.000Z");
  assert.equal(boundaryNight.endsAt.toISOString(), "2026-03-01T06:00:00.000Z");
  assert.equal(boundaryNight.progress, 8 / 14);

  assert.throws(() => getDaylightAt("not-a-date"), /Invalid daylight date/);
});

test("celestial frames travel left-to-right through seasonal day and night periods", () => {
  const examples = [
    ["2026-09-01T05:59:59.999Z", "moon", 1],
    ["2026-09-01T07:00:00.000Z", "sun", 5],
    ["2026-09-01T09:45:00.000Z", "sun", 4],
    ["2026-09-01T12:30:00.000Z", "sun", 3],
    ["2026-09-01T15:15:00.000Z", "sun", 2],
    ["2026-09-01T17:59:59.999Z", "sun", 1],
    ["2026-09-01T18:00:00.000Z", "moon", 5],
    ["2026-09-02T00:00:00.000Z", "moon", 3],
  ];

  for (const [timestamp, kind, frame] of examples) {
    const result = getCelestialVisualFrame(getDaylightAt(timestamp));
    assert.equal(result.kind, kind, timestamp);
    assert.equal(result.frame, frame, timestamp);
    assert.equal(
      result.src,
      `assets/locations/time/${kind}_${String(frame).padStart(2, "0")}.png`,
      timestamp,
    );
  }
});

test("only an outside location hub receives the district and celestial layers", () => {
  const game = new Game({
    seed: 4921,
    startDate: new Date("2026-09-01T12:00:00.000Z"),
    npcTemplates: [],
    playerOptions: { startPlaceId: null },
  });

  const outside = buildScene(game);
  assert.equal(outside.kind, "location");
  assert.equal(outside.visual.type, LAYERED_IMAGE_VISUAL_TYPE);
  assert.equal(outside.visual.width, LOCATION_HUB_VISUAL_WIDTH);
  assert.equal(outside.visual.height, LOCATION_HUB_VISUAL_HEIGHT);
  assert.deepEqual(outside.visual.layers, [
    {
      id: "district",
      src: districtBaseVisualSource(game.location.districtKey),
    },
    {
      id: "celestial",
      src: "assets/locations/time/sun_03.png",
    },
  ]);

  const place = game.location.places[0];
  assert.ok(place, "the generated location has a place for the inside check");
  game.setCurrentPlace({ placeId: place.id });
  const inside = buildScene(game);
  assert.equal(inside.kind, "place");
  assert.equal(inside.visual, null);
});

test("layered image visuals reject invalid dimensions and ambiguous layers", () => {
  assert.throws(
    () => createLayeredImageVisual({ width: 0, height: 64, layers: [] }),
    /width must be a positive integer/,
  );
  assert.throws(
    () =>
      createLayeredImageVisual({
        width: 256,
        height: 64,
        layers: [
          { id: "sky", src: "one.png" },
          { id: "sky", src: "two.png" },
        ],
      }),
    /Duplicate layered-image layer id 'sky'/,
  );
});
