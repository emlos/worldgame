import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import { buildPhonePlayerStatsView } from "../src/game/scene/phoneView.js";
import { applyWGEffect } from "../src/story/wg/runtime/effectRuntime.js";
import { evaluateWGExpression } from "../src/story/wg/runtime/expressionEvaluator.js";
import { createWGRuntimeContext } from "../src/story/wg/runtime/runtimeContext.js";
import {
  adjustSubjectAchievement,
  createSchoolState,
  getSubjectAchievement,
  getSubjectRecord,
  recordSubjectAttendance,
  SCHOOL_SUBJECTS,
  setSubjectGrade,
  setSubjectProgress,
  SUBJECT_ACHIEVEMENT_MAX,
  SUBJECT_GRADES,
} from "../src/features/school/education.js";
import { getPlayerSkillCheckValue } from "../src/game/scene/skillChecks.js";
import { DEFAULT_FEATURE_CATALOG } from "../src/features/index.js";
import { WG_BUNDLE } from "../src/story/wg/generated/scenes.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

test("new school state stores one canonical achievement score", () => {
  const school = createSchoolState();
  assert.deepEqual(Object.keys(school.subjects), Object.keys(SCHOOL_SUBJECTS));
  for (const subject of Object.values(school.subjects)) {
    assert.deepEqual(subject, {
      achievement: 0,
      attendedSegments: 0,
    });
  }
});

test("subject achievement promotes through letter grades and carries overflow", () => {
  const game = new Game({ seed: 117 });
  setSubjectProgress(game, "english", 99);

  assert.deepEqual(adjustSubjectAchievement(game, "english", 1), {
    before: { achievement: 99, grade: "D", progress: 99 },
    after: { achievement: 100, grade: "C", progress: 0 },
    appliedDelta: 1,
    gradeDelta: 1,
  });

  assert.deepEqual(adjustSubjectAchievement(game, "english", 250), {
    before: { achievement: 100, grade: "C", progress: 0 },
    after: { achievement: 350, grade: "A", progress: 50 },
    appliedDelta: 250,
    gradeDelta: 2,
  });
});

test("negative achievement demotes grades and both ends clamp", () => {
  const game = new Game({ seed: 117 });
  setSubjectGrade(game, "math", "B");
  setSubjectProgress(game, "math", 3);
  assert.deepEqual(adjustSubjectAchievement(game, "math", -10), {
    before: { achievement: 203, grade: "B", progress: 3 },
    after: { achievement: 193, grade: "C", progress: 93 },
    appliedDelta: -10,
    gradeDelta: -1,
  });

  setSubjectGrade(game, "math", "D");
  setSubjectProgress(game, "math", 0);
  assert.equal(adjustSubjectAchievement(game, "math", -10).appliedDelta, 0);

  setSubjectGrade(game, "math", "A");
  setSubjectProgress(game, "math", 98);
  assert.deepEqual(adjustSubjectAchievement(game, "math", 10).after, {
    achievement: 399,
    grade: "A",
    progress: 99,
  });
  assert.throws(
    () => adjustSubjectAchievement(game, "math", 0.5),
    /whole numbers/,
  );
});

test("grade checks use combined letter grade and progress", () => {
  const game = new Game({ seed: 117 });
  assert.equal(
    getPlayerSkillCheckValue(game, "grade", "science", DEFAULT_FEATURE_CATALOG),
    0,
  );

  setSubjectGrade(game, "science", "C");
  assert.equal(
    getPlayerSkillCheckValue(game, "grade", "science", DEFAULT_FEATURE_CATALOG),
    (100 / SUBJECT_ACHIEVEMENT_MAX) * 10,
  );

  setSubjectGrade(game, "science", "A");
  setSubjectProgress(game, "science", 99);
  assert.equal(getSubjectAchievement(game, "science"), 399);
  assert.equal(
    getPlayerSkillCheckValue(game, "grade", "science", DEFAULT_FEATURE_CATALOG),
    10,
  );
});

test("WG effects, expression context, and the phone expose progress", () => {
  const game = new Game({ seed: 117 });
  setSubjectProgress(game, "history", 99);
  applyWGEffect(game, { op: "grade", id: "history", amount: 1 });

  const subject = getSubjectRecord(game, "history");
  assert.deepEqual(subject, {
    achievement: 100,
    grade: "C",
    progress: 0,
    attendedSegments: 0,
  });
  assert.deepEqual(createWGRuntimeContext(game).school.education.history, subject);

  const schoolSection = buildPhonePlayerStatsView(game).featureSections.find(
    (section) => section.id === "school-grades",
  );
  const phoneSubject = schoolSection.entries.find((entry) => entry.id === "history");
  assert.deepEqual(phoneSubject, {
    id: "history",
    kind: "grade",
    label: "History | 0 segments attended",
    value: 100,
    min: 0,
    max: SUBJECT_ACHIEVEMENT_MAX,
    valueLabel: "C | 0/100",
  });
});

test("save version 41 round-trips feature-owned subject achievement", () => {
  const game = new Game({ seed: 117 });
  setSubjectGrade(game, "art", "B");
  setSubjectProgress(game, "art", 42);
  recordSubjectAttendance(game, "art", 3);

  const save = game.toJSON();
  assert.equal(save.saveVersion, 41);
  assert.equal(Object.hasOwn(save.player, "education"), false);
  assert.deepEqual(save.featureState.school.subjects.art, {
    achievement: 242,
    attendedSegments: 3,
  });

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(getSubjectRecord(restored, "art"), {
    achievement: 242,
    grade: "B",
    progress: 42,
    attendedSegments: 3,
  });

  const invalidAchievementSave = JSON.parse(JSON.stringify(save));
  invalidAchievementSave.featureState.school.subjects.art.achievement = 400;
  assert.throws(() => Game.fromJSON(invalidAchievementSave), /achievement/);
  assert.deepEqual(SUBJECT_GRADES, ["D", "C", "B", "A"]);
});

test("WG grade changes use subject-only feedback and whole progress points", () => {
  const bundle = compileStorySources([{
    file: "test-grade.wg",
    source: ":: test-grade\n\nThe lesson helps. @change grade english 1",
  }]);
  const change = bundle.scenes["test-grade"].passages[0].body[0].parts.find(
    (part) => part.type === "change",
  );
  assert.equal(change.effect.feedback.label, "+English");

  assert.throws(
    () => compileStorySources([{
      file: "test-grade.wg",
      source: ":: test-grade\n\nThe lesson helps. @change grade english 0.5",
    }]),
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

  setSubjectGrade(game, "english", "B");
  assert.equal(
    evaluateWGExpression(gradeBranch, createWGRuntimeContext(game)),
    true,
  );
});
