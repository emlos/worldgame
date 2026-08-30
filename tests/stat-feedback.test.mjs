import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../src/classes/game/game.js";
import { STATS } from "../src/data/player/stats.js";
import { materializeWGScene } from "../src/classes/game/scene/wg/sceneMaterializer.js";
import { resolveWGBody } from "../src/classes/game/scene/wg/storyResolver.js";
import { OUTCOME, outcomeForChange, outcomeForRange } from "../src/ui/browser/outcomes.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

for (const [statId, definition] of Object.entries(STATS)) {
  test(`${statId}: changes and previews follow the stat's polarity`, () => {
    for (const amount of [-2, 0, 2]) {
      const expected = amount === 0
        ? OUTCOME.OK
        : (amount > 0) === definition.higherIsBetter
          ? OUTCOME.VERY_GOOD
          : OUTCOME.BAD;

      assert.equal(outcomeForChange({ type: "stat", statId, amount }), expected);
      assert.equal(outcomeForChange({ type: statId, amount }), expected);
    }
  });

  test(`${statId}: existing meter colours follow the same polarity`, () => {
    const options = { lowerIsBetter: definition.higherIsBetter === false };
    assert.equal(
      outcomeForRange(definition.min, definition.min, definition.max, options),
      definition.higherIsBetter ? OUTCOME.DIRE : OUTCOME.VERY_GOOD,
    );
    assert.equal(
      outcomeForRange(definition.max, definition.min, definition.max, options),
      definition.higherIsBetter ? OUTCOME.VERY_GOOD : OUTCOME.DIRE,
    );
  });
}

test("non-stat feedback retains positive, negative, and neutral colours", () => {
  for (const type of ["relationship", "money", "skill", "grade", "attendance", "custom"]) {
    assert.equal(outcomeForChange({ type, amount: 1 }), OUTCOME.VERY_GOOD);
    assert.equal(outcomeForChange({ type, amount: -1 }), OUTCOME.BAD);
    assert.equal(outcomeForChange({ type, amount: 0 }), OUTCOME.OK);
  }
});

test("missing or non-finite amounts have no positive or negative colour", () => {
  for (const amount of [undefined, NaN, Infinity, -Infinity]) {
    assert.equal(outcomeForChange({ type: "stress", amount }), OUTCOME.OK);
  }
});

test("compiled WG preserves stat identity through prose and choice feedback", () => {
  const { scenes } = compileStorySources([{
    file: "stat-feedback.wg",
    source: `
:: test.stat-feedback [event]
@heading "Stat feedback"
@change stat stress -2 "A moment of relief"
@change stat fear 2 "Uneasy"
@change stat trauma -2
@change stat energy -2
@change stat hygiene 0
@effect stat mind 1
@choice rest "Rest" -> @exit
  @change stat stress -2 "Take a breath"
  @change stat fear 2
  @change stat trauma -2
  @change stat energy 2
  @change stat hygiene 0
  @change relationship taylor 0.02
  @preview stress -2 "Expected relief"
  @preview fear 2 "+Fear"
  @preview trauma -2 "-Trauma"
  @preview energy -2 "-Energy"
@endchoice
`,
  }]);
  const definition = scenes["test.stat-feedback"];
  const game = new Game({ seed: 117, startDate: new Date("2026-09-01T07:00:00.000Z") });
  for (const statId of ["stress", "fear", "trauma"]) game.player.setStatBase(statId, 10);
  const resolution = resolveWGBody(game, definition.body, { instanceKey: "stat-feedback" });
  game.currentStory = {
    type: "scene",
    id: definition.id,
    resolution: { ...resolution, revision: game.storyRevision },
  };
  const beforeRender = Object.fromEntries(
    Object.keys(STATS).map((id) => [id, game.player.getStatBase(id)]),
  );
  const scene = materializeWGScene(game, definition);
  const changes = scene.content.flatMap((block) => block.type === "changes" ? block.items : []);
  assert.deepEqual(changes.map((change) => change.statId), ["stress", "fear", "trauma", "energy", "hygiene"]);
  assert.deepEqual(changes.map(outcomeForChange), [OUTCOME.VERY_GOOD, OUTCOME.BAD, OUTCOME.VERY_GOOD, OUTCOME.BAD, OUTCOME.OK]);
  assert.equal(changes[0].label, "A moment of relief");

  const previews = scene.sections[0].choices[0].effectsPreview;
  assert.deepEqual(previews.map(outcomeForChange), [
    OUTCOME.VERY_GOOD, OUTCOME.BAD, OUTCOME.VERY_GOOD, OUTCOME.BAD,
    OUTCOME.VERY_GOOD, OUTCOME.BAD, OUTCOME.VERY_GOOD, OUTCOME.VERY_GOOD,
    OUTCOME.OK, OUTCOME.VERY_GOOD,
  ]);
  assert.equal(previews[4].statId, "stress");
  assert.equal(previews[4].label, "Take a breath");
  assert.equal(previews[9].type, "relationship");
  assert.equal(Object.hasOwn(previews[9], "statId"), false);

  // Display-only previews and repeated renders must never apply effects.
  assert.deepEqual(materializeWGScene(game, definition), scene);
  assert.deepEqual(
    Object.fromEntries(Object.keys(STATS).map((id) => [id, game.player.getStatBase(id)])),
    beforeRender,
  );
  assert.equal(game.player.getStatBase("stress"), 8);
  assert.equal(game.player.getStatBase("fear"), 12);
  assert.equal(game.player.getStatBase("trauma"), 8);
});
