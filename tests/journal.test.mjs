import test from "node:test";
import assert from "node:assert/strict";

import { PronounSets } from "../src/characters/core/pronouns.js";
import { Game } from "../src/game/game.js";
import {
  buildJournalReadView,
  buildJournalWritingView,
} from "../src/game/journal/view.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

const FIXED_START = new Date("2026-09-04T12:00:00.000Z");

function writableGame() {
  const game = new Game({ seed: 8128, startDate: FIXED_START });
  game.story.home = { unpack: 5 };
  return game;
}

function chooseByLabel(game, label) {
  const view = buildJournalWritingView(game);
  assert.equal(view.mode, "draft");
  const choice = view.choices.find((candidate) => candidate.label === label);
  assert.ok(choice, `expected journal choice ${JSON.stringify(label)}`);
  return game.chooseJournalOption({ ...view.token, choiceId: choice.id });
}

test("journal WG blocks are anonymous and receive deterministic generated ids", () => {
  const source = `
@journal "First thought"
@when flags.first
@passage start
Something happened.
@choice "Write it down" -> .done
  @effect set local.answer "yes"
@endchoice
@passage done
Done.
@finish
@endjournal

@journal "Second thought"
@passage start
Another thing happened.
@finish
@endjournal
`;

  const bundle = compileStorySources([{ file: "story/test-journal.wg", source }]);
  assert.deepEqual(Object.keys(bundle.journals), ["journal-1", "journal-2"]);
  assert.equal(bundle.journals["journal-1"].prompt[0].value, "First thought");
  assert.match(bundle.journals["journal-1"].passages[0].body.find(
    (node) => node.type === "choice",
  ).id, /^choice-/);
});

test("journal WG rejects world navigation and mutable journal flags", () => {
  assert.throws(() => compileStorySources([{
    file: "story/bad-journal-target.wg",
    source: `
@journal "Bad"
@passage start
@choice "Leave" -> outside.scene
@endchoice
@endjournal
`,
  }]), /Journal choices must target a local \.passage/);

  assert.throws(() => compileStorySources([{
    file: "story/bad-journal-effect.wg",
    source: `
:: scene
@passage start
@choice "Bad" -> @exit
  @effect unset flags.journal.private_thought
@endchoice
`,
  }]), /flags\.journal\.\* flags are irreversible/);
});

test("journal availability latches and completed entries save decisions instead of prose", () => {
  const game = writableGame();
  game.runAction({
    label: "get cafe job",
    apply(currentGame) {
      currentGame.setFlag("cafe_employee");
    },
  });

  assert.deepEqual(game.journal.pending.map((record) => record.definitionId), ["journal-2"]);
  game.clearFlag("cafe_employee");
  game.refreshJournalAvailability();
  assert.deepEqual(game.journal.pending.map((record) => record.definitionId), ["journal-2"]);

  game.startJournalDraft("journal-2");
  const result = chooseByLabel(game, "dealing with customers");
  assert.equal(result.finished, true);
  assert.equal(game.journal.draft, null);
  assert.equal(game.journal.entries.length, 1);
  assert.ok(Object.keys(game.journal.entries[0].decisions).length > 0);

  const beforeReload = buildJournalReadView(game).pages[0].entries[0].paragraphs.join(" ");
  const serialized = JSON.stringify(game.toJSON());
  assert.doesNotMatch(serialized, /Customers, definitely/);
  assert.match(serialized, /journal-2/);

  const saved = JSON.parse(serialized);
  const restored = Game.fromJSON(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.toJSON())), saved);
  const afterReload = buildJournalReadView(restored).pages[0].entries[0].paragraphs.join(" ");
  assert.equal(afterReload, beforeReload);
});

test("journal prose resolves live character pronouns when an old entry is reread", () => {
  const game = writableGame();
  const taylor = game.npcs.get("taylor");
  game.player.adjustRelationshipMeter(
    "taylor",
    "friendship",
    1,
    taylor.relationshipProfile,
  );
  game.refreshJournalAvailability();

  game.startJournalDraft("journal-1");
  const personView = buildJournalWritingView(game);
  assert.deepEqual(personView.choices.map((choice) => choice.label), ["Taylor"]);
  chooseByLabel(game, "Taylor");
  chooseByLabel(game, "interesting");
  chooseByLabel(game, "get to know Taylor better");

  const before = buildJournalReadView(game).pages[0].entries[0].paragraphs.join(" ");
  assert.match(before, /She has this way/);

  taylor.pronouns = PronounSets.HE_HIM;
  const after = buildJournalReadView(game).pages[0].entries[0].paragraphs.join(" ");
  assert.match(after, /He has this way/);
  assert.doesNotMatch(after, /She has this way/);
});

test("journal flags cannot be cleared through the game facade", () => {
  const game = writableGame();
  game.setFlag("journal.example");
  assert.throws(
    () => game.clearFlag("journal.example"),
    /irreversible and cannot be unset/,
  );
  assert.throws(
    () => game.setFlag("journal.example", false),
    /irreversible and cannot be unset/,
  );
  assert.equal(game.hasFlag("journal.example"), true);
});
