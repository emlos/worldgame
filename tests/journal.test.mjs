import test from "node:test";
import assert from "node:assert/strict";

import { PronounSets } from "../src/characters/core/pronouns.js";
import { Game } from "../src/game/game.js";
import { performChoice } from "../src/game/scene/choiceEngine.js";
import { buildScene } from "../src/game/scene/sceneEngine.js";
import { WG_BUNDLE } from "../src/story/wg/generated/scenes.js";
import { compareJournalBacklogRecords } from "../src/game/journal/runtime.js";
import {
  buildJournalReadView,
  buildJournalWritingView,
  renderJournalRecord,
} from "../src/game/journal/view.js";
import { journalDecisionKey } from "../src/game/journal/decisionKey.js";
import { journalSessionForRender } from "../src/game/journal/runtime.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../src/story/wg/runtime/storyRuntime.js";
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

function chooseSceneByLabel(game, label) {
  const scene = buildScene(game);
  const choice = scene.sections
    .flatMap((section) => section.choices)
    .find((candidate) => candidate.label === label);
  assert.ok(choice, `expected scene choice ${JSON.stringify(label)}`);
  return performChoice(game, { sceneId: scene.id, choiceId: choice.id });
}

test("same-time journal topics retain numeric source order past nine entries", () => {
  const availableAt = FIXED_START.toISOString();
  const records = [10, 2, 1, 11, 3].map((ordinal) => ({
    definitionId: `journal-${ordinal}`,
    availableAt,
  }));

  records.sort(compareJournalBacklogRecords);

  assert.deepEqual(
    records.map((record) => record.definitionId),
    ["journal-1", "journal-2", "journal-3", "journal-10", "journal-11"],
  );
});

test("the full-school-day topic records whether it happened on the first day", () => {
  const topic = Object.values(WG_BUNDLE.journals).find((definition) =>
    definition.prompt.some((part) =>
      part.type === "text" && part.value === "I made it through every class today."
    )
  );
  assert.ok(topic, "expected the full-school-day journal topic");

  const firstDay = writableGame();
  firstDay.setFlag("journal.completed_school_day");
  firstDay.setFlag("journal.completed_school_first_day");
  firstDay.refreshJournalAvailability();
  firstDay.startJournalDraft(topic.id);
  assert.match(
    buildJournalWritingView(firstDay).draft.paragraphs.join(" "),
    /very first day of school/,
  );

  const laterDay = writableGame();
  laterDay.setFlag("journal.completed_school_day");
  laterDay.refreshJournalAvailability();
  laterDay.startJournalDraft(topic.id);
  assert.match(
    buildJournalWritingView(laterDay).draft.paragraphs.join(" "),
    /It was not my first day/,
  );
});

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

test("journal WG rejects unreachable passages and paths trapped without @finish", () => {
  assert.throws(() => compileStorySources([{
    file: "story/unreachable-journal-passage.wg",
    source: `
@journal "Unreachable"
@passage start
@finish
@passage forgotten
@finish
@endjournal
`,
  }]), /passage 'forgotten' is unreachable from entry passage 'start'/);

  assert.throws(() => compileStorySources([{
    file: "story/looping-journal.wg",
    source: `
@journal "Looping"
@passage start
@choice "Get stuck" -> .loop
@endchoice
@choice "Finish safely" -> .done
@endchoice
@passage loop
@choice "Again" -> .loop
@endchoice
@passage done
@finish
@endjournal
`,
  }]), /passage 'loop' cannot reach a passage ending with @finish/);
});

test("journal WG permits a cycle when every passage can still reach @finish", () => {
  const bundle = compileStorySources([{
    file: "story/escapable-journal-loop.wg",
    source: `
@journal "Escapable loop"
@passage start
@choice "Go around" -> .loop
@endchoice
@passage loop
@choice "Go around again" -> .loop
@endchoice
@choice "Finish" -> .done
@endchoice
@passage done
@finish
@endjournal
`,
  }]);

  assert.ok(bundle.journals["journal-1"]);
});

test("journal writing is a normal system scene that can preserve a draft on exit", () => {
  const game = writableGame();
  game.runAction({
    label: "get cafe job",
    apply(currentGame) {
      currentGame.setFlag("cafe_employee");
    },
  });

  enterWGScene(game, "home.diary");
  resolveActiveWGStory(game);
  let scene = buildScene(game);
  assert.equal(scene.presentation.type, "journal-writing");
  assert.equal(scene.presentation.mode, "topics");
  assert.match(
    scene.content.map((block) => block.text).join(" "),
    /You can write in your diary/,
  );

  chooseSceneByLabel(game, "...I actually got a job.");
  scene = buildScene(game);
  assert.equal(scene.presentation.mode, "draft");
  assert.equal(game.journal.draft.definitionId, "journal-2");

  chooseSceneByLabel(game, "Put the diary away");
  assert.equal(game.currentStory, null);
  assert.equal(game.journal.draft.definitionId, "journal-2");
  assert.equal(game.hasFlag("diary.tutorial"), true);

  enterWGScene(game, "home.diary");
  resolveActiveWGStory(game);
  scene = buildScene(game);
  assert.equal(scene.presentation.mode, "draft");
  assert.doesNotMatch(
    scene.content.map((block) => block.text).join(" "),
    /You can write in your diary/,
  );
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

test("partial journal drafts survive saves and can be dismissed permanently", () => {
  const game = writableGame();
  game.runAction({
    label: "meet Taylor",
    apply(currentGame) {
      currentGame.setFlag("journal.taylor_met");
    },
  });

  game.startJournalDraft("journal-1");
  chooseByLabel(game, "Taylor");
  chooseByLabel(game, "attractive");
  assert.equal(game.hasFlag("journal.taylor_attractive"), false);

  const saved = JSON.parse(JSON.stringify(game.toJSON()));
  const restored = Game.fromJSON(saved);
  assert.deepEqual(restored.journal.draft.choices, game.journal.draft.choices);
  assert.deepEqual(
    restored.journal.draft.deferredFlags,
    ["journal.taylor_attractive"],
  );
  assert.deepEqual(
    buildJournalWritingView(restored).choices.map((choice) => choice.label),
    [
      "get to know Taylor normally first",
      "flirt and see where it goes",
      "not make a thing out of it",
    ],
  );

  assert.equal(restored.dismissJournalDraft(), "journal-1");
  assert.equal(restored.journal.draft, null);
  assert.deepEqual(restored.journal.dismissed, ["journal-1"]);
  assert.equal(restored.hasFlag("journal.taylor_attractive"), false);
  restored.refreshJournalAvailability();
  assert.equal(
    restored.journal.pending.some((record) => record.definitionId === "journal-1"),
    false,
  );
  assert.throws(
    () => restored.startJournalDraft("journal-1"),
    /topic is no longer available/,
  );
});

test("journal save validation rejects state not produced by the selected path", () => {
  const game = writableGame();
  game.setFlag("journal.taylor_met");
  game.refreshJournalAvailability();
  game.startJournalDraft("journal-1");
  chooseByLabel(game, "Taylor");

  const injectedFlag = JSON.parse(JSON.stringify(game.toJSON()));
  injectedFlag.journal.draft.deferredFlags.push(
    "journal.wants_to_get_closer_to_taylor",
  );
  assert.throws(
    () => Game.fromJSON(injectedFlag),
    /not produced by the selected path/,
  );

  const injectedLocal = JSON.parse(JSON.stringify(game.toJSON()));
  injectedLocal.journal.draft.locals.unselected_answer = "forged";
  assert.throws(
    () => Game.fromJSON(injectedLocal),
    /was not produced by a local effect on the selected journal path/,
  );
});

test("journal save validation rejects choices hidden by frozen decisions", () => {
  const source = `
@journal "Which route?"
@passage start
@if flags.take_first_route
  @choice "First" -> .first
  @endchoice
@else
  @choice "Second" -> .second
  @endchoice
@endif
@passage first
@choice "Continue" -> .done
@endchoice
@passage second
@choice "Continue" -> .done
@endchoice
@passage done
@finish
@endjournal
`;
  const compiled = compileStorySources([{ file: "story/frozen-choice-journal.wg", source }]);
  const definition = compiled.journals["journal-1"];
  const definitionId = "journal-999";
  definition.id = definitionId;
  WG_BUNDLE.journals[definitionId] = definition;

  try {
    const game = writableGame();
    game.setFlag("take_first_route");
    game.journal.pending.push({
      definitionId,
      availableAt: game.now.toISOString(),
    });
    game.startJournalDraft(definitionId);

    const conditional = definition.passages[0].body.find((node) => node.type === "if");
    const hiddenChoice = conditional.elseNodes.find((node) => node.type === "choice");
    const save = JSON.parse(JSON.stringify(game.toJSON()));
    save.journal.draft.choices.push(hiddenChoice.id);

    assert.throws(
      () => Game.fromJSON(save),
      /is not selected by the saved decisions in passage 'start'/,
    );
  } finally {
    delete WG_BUNDLE.journals[definitionId];
  }
});

test("journal flags commit only when the entry is finished", () => {
  const game = writableGame();
  game.setFlag("journal.taylor_met");
  game.refreshJournalAvailability();

  game.startJournalDraft("journal-1");
  chooseByLabel(game, "Taylor");
  chooseByLabel(game, "attractive");
  assert.equal(game.hasFlag("journal.taylor_attractive"), false);
  chooseByLabel(game, "flirt and see where it goes");

  assert.equal(game.journal.draft, null);
  assert.equal(game.hasFlag("journal.taylor_attractive"), true);
  assert.equal(game.hasFlag("journal.wants_to_get_closer_to_taylor"), true);
});

test("dismissing an old topic lets a newer topic enter the visible backlog", () => {
  const game = writableGame();
  game.runAction({
    label: "unlock three journal topics",
    apply(currentGame) {
      currentGame.setFlag("journal.taylor_met");
      currentGame.setFlag("cafe_employee");
      currentGame.setFlag("rent_intro_2");
    },
  });

  assert.deepEqual(
    buildJournalWritingView(game, { limit: 2 }).topics
      .map((topic) => topic.definitionId),
    ["journal-1", "journal-2"],
  );
  game.startJournalDraft("journal-1");
  game.dismissJournalDraft();
  assert.deepEqual(
    buildJournalWritingView(game, { limit: 2 }).topics
      .map((topic) => topic.definitionId),
    ["journal-2", "journal-3"],
  );
});

test("journal writing shows only entries completed on the current game day", () => {
  const game = writableGame();
  game.runAction({
    label: "get cafe job",
    apply(currentGame) {
      currentGame.setFlag("cafe_employee");
    },
  });
  game.startJournalDraft("journal-2");
  chooseByLabel(game, "dealing with customers");

  const previousDayEntry = structuredClone(game.journal.entries[0]);
  game.runAction({
    label: "advance to tomorrow",
    minutes: 24 * 60,
    energyFree: true,
  });

  let view = buildJournalWritingView(game);
  assert.equal(view.mode, "topics");
  assert.deepEqual(view.pageEntries, []);

  const currentDayEntry = {
    ...structuredClone(previousDayEntry),
    writtenAt: game.now.toISOString(),
  };
  game.journal.entries.push(currentDayEntry);

  view = buildJournalWritingView(game);
  assert.deepEqual(
    view.pageEntries.map((entry) => entry.writtenAt),
    [currentDayEntry.writtenAt],
  );
});

test("journal prose resolves live character pronouns when an old entry is reread", () => {
  const game = writableGame();
  const taylor = game.npcs.get("taylor");
  game.setFlag("journal.taylor_met");
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

test("journal conditionals freeze while interpolation remains live", () => {
  const source = `
@journal "How did the morning go?"
@passage start
@if flags.arrived_early
I arrived early and it felt {{@if flags.felt_confident}}easy{{@else}}awkward{{@endif}}. {{npc.taylor.subject | cap}} noticed.
@else
I arrived late. {{npc.taylor.subject | cap}} noticed.
@endif
@choice "Finish" -> .done
@endchoice
@passage done
That is how I remember it.
@finish
@endjournal
`;
  const compiled = compileStorySources([{ file: "story/frozen-journal.wg", source }]);
  const definition = compiled.journals["journal-1"];
  const definitionId = "journal-999";
  definition.id = definitionId;
  WG_BUNDLE.journals[definitionId] = definition;

  try {
    const game = writableGame();
    game.setFlag("arrived_early");
    game.setFlag("felt_confident");
    game.journal.pending.push({
      definitionId,
      availableAt: game.now.toISOString(),
    });

    game.startJournalDraft(definitionId);
    assert.deepEqual(game.journal.draft.decisions, {
      "start:if:0": 0,
      "start:inline-if:1": 0,
    });

    game.clearFlag("arrived_early");
    game.clearFlag("felt_confident");
    game.npcs.get("taylor").pronouns = PronounSets.HE_HIM;

    const draftText = buildJournalWritingView(game).draft.paragraphs.join(" ");
    assert.match(draftText, /arrived early and it felt easy/);
    assert.match(draftText, /He noticed/);
    assert.doesNotMatch(draftText, /arrived late|felt awkward/);

    chooseByLabel(game, "Finish");
    const entry = game.journal.entries[0];
    const entryText = renderJournalRecord(game, entry).paragraphs.join(" ");
    assert.match(entryText, /arrived early and it felt easy/);
    assert.match(entryText, /He noticed/);

    const serialized = JSON.stringify(game.toJSON());
    assert.doesNotMatch(serialized, /I arrived early|That is how I remember it/);

    const missingDecision = structuredClone(entry);
    delete missingDecision.decisions["start:if:0"];
    assert.throws(
      () => renderJournalRecord(game, missingDecision),
      /missing structural decision 'start:if:0'/,
    );

    const missingDecisionSave = JSON.parse(serialized);
    delete missingDecisionSave.journal.entries[0].decisions["start:if:0"];
    assert.throws(
      () => Game.fromJSON(missingDecisionSave),
      /is missing a required journal decision/,
    );

    const invalidSave = JSON.parse(serialized);
    invalidSave.journal.entries[0].decisions["start:inline-if:1"] = 2;
    assert.throws(
      () => Game.fromJSON(invalidSave),
      /has an invalid conditional branch/,
    );
  } finally {
    delete WG_BUNDLE.journals[definitionId];
  }
});

test("journal random decisions are scoped to their passage", () => {
  const source = `
@journal "Random memories"
@passage start
@random
First opening.
@or
Second opening.
@endrandom
@choice "Continue" -> .done
@endchoice
@passage done
@random
First ending.
@or
Second ending.
@or
Third ending.
@endrandom
@finish
@endjournal
`;

  const bundle = compileStorySources([{ file: "story/random-journal.wg", source }]);
  const journal = bundle.journals["journal-1"];
  const [start, done] = journal.passages;
  const startRandom = start.body.find((node) => node.type === "random");
  const doneRandom = done.body.find((node) => node.type === "random");

  assert.equal(startRandom.runtimeId, 0);
  assert.equal(doneRandom.runtimeId, 0);

  const startKey = journalDecisionKey(start.id, startRandom);
  const doneKey = journalDecisionKey(done.id, doneRandom);
  assert.notEqual(startKey, doneKey);

  const game = writableGame();
  const record = {
    definitionId: journal.id,
    availableAt: game.now.toISOString(),
    locals: {},
    decisions: {
      [startKey]: 0,
      [doneKey]: 2,
    },
  };
  assert.equal(journalSessionForRender(game, record, start).decision(startRandom), 0);
  assert.equal(journalSessionForRender(game, record, done).decision(doneRandom), 2);
});

test("journal choices complete continuation prose without headings or ellipses", () => {
  const game = writableGame();
  game.runAction({
    label: "unlock journal examples",
    apply(currentGame) {
      currentGame.setFlag("journal.taylor_met");
      currentGame.setFlag("rent_intro_2");
    },
  });

  game.startJournalDraft("journal-3");
  chooseByLabel(game, "resigned");
  game.startJournalDraft("journal-1");
  chooseByLabel(game, "Taylor");
  chooseByLabel(game, "strange");
  chooseByLabel(game, "flirt a little and see what happens");

  const entries = buildJournalReadView(game).pages[0].entries;
  assert.equal(Object.hasOwn(entries[0], "title"), false);
  assert.deepEqual(entries.map((entry) => entry.paragraphs), [
    [
      "Apparently I owe rent from before I even properly settled in here. Somehow that has become my problem.",
      "Right now I mostly feel Resigned, mostly. Whether it makes sense or not, arguing with the amount won't magically make it disappear. I need money and a plan.",
    ],
    [
      "There's this person at school, Taylor, who seems really strange, honestly. I haven't decided whether she is the good kind of weird yet.",
      "Still, I'm hoping to get a little closer to her, y'know, see where things go. Maybe there's something there. Maybe not. It could be fun finding out.",
    ],
  ]);
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
