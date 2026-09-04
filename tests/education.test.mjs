import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { buildPhonePlayerStatsView } from "../src/classes/game/scene/phoneView.js";
import { applyWGEffect } from "../src/classes/game/wg/effectRuntime.js";
import { evaluateWGExpression } from "../src/classes/game/wg/expressionEvaluator.js";
import { createWGRuntimeContext } from "../src/classes/game/wg/runtimeContext.js";
import { Player } from "../src/classes/player/player.js";
import {
  SCHOOL_SUBJECTS,
  SUBJECT_ACHIEVEMENT_MAX,
  SUBJECT_GRADES,
  initialPlayerEducation,
} from "../src/data/player/education.js";
import { getPlayerSkillCheckValue } from "../src/data/scene/skillChecks.js";
import { WG_BUNDLE } from "../src/generated/wg/scenes.js";
import { parseWGDocument } from "../tools/wg/compiler/sourceParser.js";

test("new subjects store one canonical achievement score", () => {
  const education = initialPlayerEducation();
  assert.deepEqual(Object.keys(education.subjects), Object.keys(SCHOOL_SUBJECTS));
  for (const subject of Object.values(education.subjects)) {
    assert.deepEqual(subject, {
      achievement: 0,
      attendedSegments: 0,
    });
  }
});

test("subject achievement promotes through letter grades and carries overflow", () => {
  const player = new Player();
  player.setSubjectProgress("english", 99);

  assert.deepEqual(player.adjustSubjectAchievement("english", 1), {
    before: { achievement: 99, grade: "D", progress: 99 },
    after: { achievement: 100, grade: "C", progress: 0 },
    appliedDelta: 1,
    gradeDelta: 1,
  });

  assert.deepEqual(player.adjustSubjectAchievement("english", 250), {
    before: { achievement: 100, grade: "C", progress: 0 },
    after: { achievement: 350, grade: "A", progress: 50 },
    appliedDelta: 250,
    gradeDelta: 2,
  });
});

test("negative achievement demotes grades and both ends clamp", () => {
  const player = new Player();
  player.setSubjectGrade("math", "B");
  player.setSubjectProgress("math", 3);
  assert.deepEqual(player.adjustSubjectAchievement("math", -10), {
    before: { achievement: 203, grade: "B", progress: 3 },
    after: { achievement: 193, grade: "C", progress: 93 },
    appliedDelta: -10,
    gradeDelta: -1,
  });

  player.setSubjectGrade("math", "D");
  player.setSubjectProgress("math", 0);
  assert.equal(player.adjustSubjectAchievement("math", -10).appliedDelta, 0);

  player.setSubjectGrade("math", "A");
  player.setSubjectProgress("math", 98);
  assert.deepEqual(player.adjustSubjectAchievement("math", 10).after, {
    achievement: 399,
    grade: "A",
    progress: 99,
  });
  assert.throws(
    () => player.adjustSubjectAchievement("math", 0.5),
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
  assert.equal(player.getSubjectAchievement("science"), 399);
  assert.equal(getPlayerSkillCheckValue(player, "grade", "science"), 10);
});

test("WG effects, expression context, and the phone expose progress", () => {
  const game = new Game({ seed: 117 });
  game.player.setSubjectProgress("history", 99);
  applyWGEffect(game, { op: "grade", id: "history", amount: 1 });

  const subject = game.player.getSubjectRecord("history");
  assert.deepEqual(subject, {
    achievement: 100,
    grade: "C",
    progress: 0,
    attendedSegments: 0,
  });
  assert.deepEqual(createWGRuntimeContext(game).player.education.history, subject);

  const phoneSubject = buildPhonePlayerStatsView(game).education.find(
    (entry) => entry.id === "history",
  );
  assert.deepEqual(phoneSubject, {
    id: "history",
    label: "History",
    achievement: 100,
    grade: "C",
    progress: 0,
    achievementMax: SUBJECT_ACHIEVEMENT_MAX,
    attendedSegments: 0,
  });
});

test("save version 32 round-trips canonical subject achievement", () => {
  const game = new Game({ seed: 117 });
  game.player.setSubjectGrade("art", "B");
  game.player.setSubjectProgress("art", 42);
  game.player.recordSubjectAttendance("art", 3);

  const save = game.toJSON();
  assert.equal(save.saveVersion, 32);
  assert.deepEqual(save.player.education.subjects.art, {
    achievement: 242,
    attendedSegments: 3,
  });

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(restored.player.getSubjectRecord("art"), {
    achievement: 242,
    grade: "B",
    progress: 42,
    attendedSegments: 3,
  });

  const invalidAchievementSave = JSON.parse(JSON.stringify(save));
  invalidAchievementSave.player.education.subjects.art.achievement = 400;
  assert.throws(() => Game.fromJSON(invalidAchievementSave), /achievement/);
  assert.deepEqual(SUBJECT_GRADES, ["D", "C", "B", "A"]);
});

test("WG grade changes use subject-only feedback and whole progress points", () => {
  const document = parseWGDocument({
    file: "test-grade.wg",
    source: ":: test-grade\n\nThe lesson helps. @change grade english 1",
  });
  const change = document.scenes[0].passages[0].body[0].parts.find(
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
  const readingAloud = WG_BUNDLE.scenes["school.english.event.reading-aloud"];
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
