import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { buildPhonePlayerStatsView } from "../src/classes/game/scene/phoneView.js";
import { applyWGEffect } from "../src/classes/game/scene/wg/effectRuntime.js";
import { evaluateWGExpression } from "../src/classes/game/scene/wg/expressionEvaluator.js";
import { createWGRuntimeContext } from "../src/classes/game/scene/wg/runtimeContext.js";
import { Player } from "../src/classes/player/player.js";
import {
  SCHOOL_SUBJECTS,
  SUBJECT_ACHIEVEMENT_MAX,
  SUBJECT_GRADES,
  initialPlayerEducation,
  subjectAchievementPoints,
} from "../src/data/player/education.js";
import { getPlayerSkillCheckValue } from "../src/data/scene/skillChecks.js";
import { WG_BUNDLE } from "../src/generated/wg/scenes.js";
import { parseWGDocument } from "../tools/wg/compiler/sourceParser.js";

test("new subjects start at grade D with no progress", () => {
  const education = initialPlayerEducation();
  assert.deepEqual(Object.keys(education.subjects), Object.keys(SCHOOL_SUBJECTS));
  for (const subject of Object.values(education.subjects)) {
    assert.deepEqual(subject, {
      grade: "D",
      progress: 0,
      attendedSegments: 0,
    });
  }
});

test("subject progress promotes through letter grades and carries overflow", () => {
  const player = new Player();
  player.setSubjectProgress("english", 99);

  assert.deepEqual(player.adjustSubjectProgress("english", 1), {
    before: { grade: "D", progress: 99 },
    after: { grade: "C", progress: 0 },
    promotions: 1,
  });

  assert.deepEqual(player.adjustSubjectProgress("english", 250), {
    before: { grade: "C", progress: 0 },
    after: { grade: "A", progress: 50 },
    promotions: 2,
  });
});

test("negative progress does not demote and A progress caps", () => {
  const player = new Player();
  player.setSubjectGrade("math", "B");
  player.setSubjectProgress("math", 3);
  assert.deepEqual(player.adjustSubjectProgress("math", -10).after, {
    grade: "B",
    progress: 0,
  });

  player.setSubjectGrade("math", "A");
  player.setSubjectProgress("math", 98);
  assert.deepEqual(player.adjustSubjectProgress("math", 10).after, {
    grade: "A",
    progress: 99,
  });
  assert.throws(
    () => player.adjustSubjectProgress("math", 0.5),
    /whole numbers/,
  );
});

test("grade checks use combined letter grade and progress", () => {
  const player = new Player();
  assert.equal(getPlayerSkillCheckValue(player, "grade", "science"), 0);

  player.setSubjectGrade("science", "C");
  assert.equal(
    getPlayerSkillCheckValue(player, "grade", "science"),
    (100 / SUBJECT_ACHIEVEMENT_MAX) * 10,
  );

  player.setSubjectGrade("science", "A");
  player.setSubjectProgress("science", 99);
  assert.equal(subjectAchievementPoints(player.getSubjectRecord("science")), 399);
  assert.equal(getPlayerSkillCheckValue(player, "grade", "science"), 10);
});

test("WG effects, expression context, and the phone expose progress", () => {
  const game = new Game({ seed: 117 });
  game.player.setSubjectProgress("history", 99);
  applyWGEffect(game, { op: "grade", id: "history", amount: 1 });

  const subject = game.player.getSubjectRecord("history");
  assert.deepEqual(subject, { grade: "C", progress: 0, attendedSegments: 0 });
  assert.deepEqual(createWGRuntimeContext(game).player.education.history, subject);

  const phoneSubject = buildPhonePlayerStatsView(game).education.find(
    (entry) => entry.id === "history",
  );
  assert.deepEqual(phoneSubject, {
    id: "history",
    label: "History",
    grade: "C",
    progress: 0,
    achievement: 100,
    achievementMax: SUBJECT_ACHIEVEMENT_MAX,
    attendedSegments: 0,
  });
});

test("save version 28 round-trips the letter-grade schema", () => {
  const game = new Game({ seed: 117 });
  game.player.setSubjectGrade("art", "B");
  game.player.setSubjectProgress("art", 42);
  game.player.recordSubjectAttendance("art", 3);

  const save = game.toJSON();
  assert.equal(save.saveVersion, 28);
  assert.deepEqual(save.player.education.subjects.art, {
    grade: "B",
    progress: 42,
    attendedSegments: 3,
  });

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(restored.player.getSubjectRecord("art"), {
    grade: "B",
    progress: 42,
    attendedSegments: 3,
  });

  const numericGradeSave = JSON.parse(JSON.stringify(save));
  numericGradeSave.player.education.subjects.art.grade = 50;
  assert.throws(() => Game.fromJSON(numericGradeSave), /grade.*string/);
  assert.deepEqual(SUBJECT_GRADES, ["D", "C", "B", "A"]);
});

test("WG grade changes use subject-only feedback and whole progress points", () => {
  const document = parseWGDocument({
    file: "test-grade.wg",
    source: ":: test-grade\n\nThe lesson helps. @change grade english 1",
  });
  const change = document.scenes[0].body[0].parts.find(
    (part) => part.type === "change",
  );
  assert.equal(change.effect.feedback.label, "+English");

  assert.throws(
    () => parseWGDocument({
      file: "test-grade.wg",
      source: ":: test-grade\n\nThe lesson helps. @change grade english 0.5",
    }),
    /@effect grade requires a signed whole number/,
  );
});

test("authored school branches compare against letter grades", () => {
  const game = new Game({ seed: 117 });
  const readingAloud = WG_BUNDLE.sequences["school.english.event.reading-aloud"];
  const gradeBranch = readingAloud.passages[0].body.find(
    (node) => node.type === "if",
  ).branches[0].test;

  assert.equal(
    evaluateWGExpression(gradeBranch, createWGRuntimeContext(game)),
    false,
  );

  game.player.setSubjectGrade("english", "B");
  assert.equal(
    evaluateWGExpression(gradeBranch, createWGRuntimeContext(game)),
    true,
  );
});
