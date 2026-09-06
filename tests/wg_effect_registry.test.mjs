import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game/game.js";
import {
  actWGSystem,
  registerWGStorySystem,
} from "../src/story/wg/runtime/storySystemRegistry.js";
import {
  applyWGEffects,
  getWGEffectHandlerOps,
} from "../src/story/wg/runtime/effectRuntime.js";
import { materializeWGScene } from "../src/story/wg/runtime/sceneMaterializer.js";
import { resolveWGPath } from "../src/story/wg/runtime/expressionEvaluator.js";
import { createWGRuntimeContext } from "../src/story/wg/runtime/runtimeContext.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../src/story/wg/runtime/storyRuntime.js";
import { DEFAULT_FEATURE_CATALOG } from "../src/features/index.js";
import {
  validateWGEffectShape,
  WG_EFFECT_OPS,
} from "../src/story/wg/shared/effects/registry.js";
import { walkWGDefinitionEffects } from "../src/story/wg/shared/effects/traversal.js";
import { WG_EFFECT_PARSER_OPS } from "../tools/wg/compiler/effects/effectParsers.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

function sorted(values) {
  return [...values].sort();
}

test("every WG effect has compiler syntax and a runtime handler", () => {
  assert.deepEqual(sorted(WG_EFFECT_PARSER_OPS), sorted(WG_EFFECT_OPS));
  assert.deepEqual(
    sorted(getWGEffectHandlerOps(DEFAULT_FEATURE_CATALOG)),
    sorted(WG_EFFECT_OPS),
  );
});

test("the compiler registry parses every effect without changing the effect IR", () => {
  const source = [
    "@reminder registry.notice",
    '  @text "Registry notice"',
    "@endreminder",
    "",
    "@chat registry.chat",
    "@npc kim",
    "@passage start",
    "@message",
    "Hello.",
    "@endmessage",
    "@finish",
    "@endchat",
    "",
    ":: registry.effects",
    "@onenter",
    "  @effect contact add kim",
    "  @effect chat start registry.chat",
    "  @effect chat finish registry.chat",
    "  @effect set story.registry.value 1",
    "  @effect add story.registry.value 2",
    "  @effect set flags.registry_flag",
    "  @effect unset flags.registry_old_flag",
    "  @effect daily-flag registry_daily true",
    "  @effect reminder add registry.notice",
    "  @effect timer start rent.weekly",
    "  @effect unlock place civil_office",
    "  @effect relocate nearest-place hospital",
    "  @effect teleport npc kim player",
    "  @effect teleport npc kim home",
    "  @effect relationship kim.intimidation -2",
    "  @effect money 3",
    "  @effect skill strength 0.1",
    "  @effect stat energy -2",
    "  @effect grade english 1",
    "  @effect attendance english 1",
    "@endonenter",
    "",
    "The registry is active. @change stat energy -2",
  ].join("\n");

  const bundle = compileStorySources([{ file: "registry.wg", source }]);
  const scene = bundle.scenes["registry.effects"];
  assert.deepEqual(sorted(new Set(scene.onEnter.map((effect) => effect.op))), sorted(WG_EFFECT_OPS));

  const change = scene.passages[0].body[0].parts.find((part) => part.type === "change");
  assert.deepEqual(change.effect.feedback, {
    type: "stat",
    amount: -2,
    label: "-Energy",
    direction: "decrease",
  });
  assert.deepEqual(
    scene.onEnter.find((effect) => effect.op === "unlock-place"),
    {
      op: "unlock-place",
      placeKey: "civil_office",
      source: { file: "registry.wg", line: 26, column: 1 },
    },
  );
  assert.deepEqual(
    scene.onEnter
      .filter((effect) => effect.op === "teleport-npc")
      .map(({ source: _source, ...effect }) => effect),
    [
      { op: "teleport-npc", npcId: "kim", destination: "player" },
      { op: "teleport-npc", npcId: "kim", destination: "home" },
    ],
  );
});

test("set and unset use namespaces to mutate story values and global flags", () => {
  const bundle = compileStorySources([{
    file: "namespaced-mutations.wg",
    source: [
      ":: fixture.namespaced-mutations",
      "@onenter",
      '  @effect set story.fixture.label "ready"',
      "  @effect set local.fixture.count 1",
      "  @effect add local.fixture.count 2",
      "  @effect set flags.fixture.ready",
      "  @effect unset flags.fixture.old",
      "@endonenter",
      "",
      "Ready.",
    ].join("\n"),
  }]);
  const effects = bundle.scenes["fixture.namespaced-mutations"].onEnter;
  assert.deepEqual(effects.map(({ source: _source, ...effect }) => effect), [
    {
      op: "set",
      path: ["story", "fixture", "label"],
      value: { type: "literal", value: "ready" },
    },
    {
      op: "set",
      path: ["local", "fixture", "count"],
      value: { type: "literal", value: 1 },
    },
    {
      op: "add",
      path: ["local", "fixture", "count"],
      value: { type: "literal", value: 2 },
    },
    { op: "set", path: ["flags", "fixture", "ready"] },
    { op: "unset", path: ["flags", "fixture", "old"] },
  ]);

  const game = new Game({ seed: 903 });
  enterWGScene(game, "example.passage-scene");
  resolveActiveWGStory(game);
  game.setFlag("fixture.old");
  applyWGEffects(game, effects);
  assert.equal(game.story.fixture.label, "ready");
  assert.equal(game.currentStory.locals.fixture.count, 3);
  assert.equal(game.hasFlag("fixture.ready"), true);
  assert.equal(game.hasFlag("fixture.old"), false);
});

test("dotted flags remain exact when one flag is another flag's namespace", () => {
  const game = new Game({ seed: 904 });
  game.setFlag("quest.receptacles.start");
  const context = createWGRuntimeContext(game);

  assert.equal(
    resolveWGPath(context, ["flags", "quest", "receptacles", "start"]),
    true,
  );
  assert.equal(resolveWGPath(context, ["flags", "quest"]), undefined);
});

test("removed and malformed global flag mutations are rejected", () => {
  for (const [directive, expected] of [
    ["@effect flag old_flag true", /Unknown or malformed @effect/],
    ["@effect set flags.named true", /requires a story\.\* or local\.\* path and value/],
    ["@effect set local.named", /requires a story\.\* or local\.\* path and value/],
    ["@effect unset story.named", /requires a flags\.<path>/],
  ]) {
    assert.throws(
      () => compileStorySources([{
        file: "invalid-flag-mutation.wg",
        source: `:: invalid-flag-mutation\n\n${directive}`,
      }]),
      expected,
      directive,
    );
  }
});

test("skills use the ordinary hint, change, and silent-effect behavior", () => {
  const bundle = compileStorySources([{
    file: "skill-feedback.wg",
    source: [
      ":: fixture.skill-feedback",
      "@hub player_home",
      "",
      '@choice "Hint only" -> @exit',
      '  @hint strength 0.1 "+Strength?"',
      "@endchoice",
      "",
      '@choice "Visible change" -> @exit',
      "  @change skill strength 0.1",
      "@endchoice",
      "",
      '@choice "Silent effect" -> @exit',
      "  @effect skill strength 0.1",
      "@endchoice",
    ].join("\n"),
  }]);
  const game = new Game({ seed: 902 });
  const scene = materializeWGScene(game, bundle.scenes["fixture.skill-feedback"]);
  const choices = Object.fromEntries(
    scene.sections.flatMap((section) => section.choices).map((choice) => [choice.label, choice]),
  );

  assert.deepEqual(choices["Hint only"].effectsPreview, [
    { type: "strength", amount: 0.1, label: "+Strength?" },
  ]);
  assert.deepEqual(choices["Hint only"].action.effects, []);
  assert.deepEqual(choices["Visible change"].effectsPreview, [
    {
      type: "skill",
      amount: 0.1,
      label: "+Strength",
      direction: "increase",
    },
  ]);
  assert.equal(choices["Visible change"].action.effects[0].op, "skill");
  assert.deepEqual(choices["Silent effect"].effectsPreview, []);
  assert.equal(choices["Silent effect"].action.effects[0].op, "skill");
  assert.equal("skillChanges" in choices["Silent effect"], false);
});

test("the removed @preview directive is rejected", () => {
  assert.throws(
    () => compileStorySources([{
      file: "removed-preview.wg",
      source: [
        ":: fixture.removed-preview",
        "@hub player_home",
        "",
        '@choice "Old syntax" -> @exit',
        '  @preview strength 0.1 "+Strength"',
        "@endchoice",
      ].join("\n"),
    }]),
    /Unknown choice directive @preview/,
  );
});

test("effect traversal covers every legal effect container exactly once", () => {
  const effect = (id) => ({ op: "set", path: ["flags", id] });
  const definition = {
    onEnter: [effect("on-enter")],
    body: [
      {
        type: "paragraph",
        parts: [
          { type: "change", effect: effect("inline") },
          {
            type: "inline-if",
            branches: [{ parts: [{ type: "change", effect: effect("inline-branch") }] }],
            elseParts: [{ type: "change", effect: effect("inline-else") }],
          },
        ],
      },
      { type: "effect", effect: effect("body") },
      {
        type: "choice",
        effects: [effect("choice")],
        outcomes: {
          success: { effects: [effect("success")] },
          failure: { effects: [effect("failure")] },
        },
      },
      {
        type: "if",
        branches: [{ nodes: [{ type: "effect", effect: effect("branch") }] }],
        elseNodes: [{ type: "effect", effect: effect("else") }],
      },
    ],
    passages: [{ body: [{ type: "effect", effect: effect("passage") }] }],
  };
  const visited = [];
  walkWGDefinitionEffects(definition, (candidate) => visited.push(candidate.path[1]));
  assert.deepEqual(visited, [
    "on-enter",
    "inline",
    "inline-branch",
    "inline-else",
    "body",
    "choice",
    "success",
    "failure",
    "branch",
    "else",
    "passage",
  ]);
});

test("effect references are validated uniformly after all source files are parsed", () => {
  const forwardBundle = compileStorySources([
    {
      file: "a-scene.wg",
      source: [
        ":: forward-reference",
        "",
        '@choice "Begin" -> @exit',
        "  @effect reminder add future.notice",
        "  @effect chat start future.chat",
        "@endchoice",
      ].join("\n"),
    },
    {
      file: "z-definitions.wg",
      source: [
        "@reminder future.notice",
        '  @text "Future notice"',
        "@endreminder",
        "",
        "@chat future.chat",
        "@npc kim",
        "@passage start",
        "@message",
        "Hello.",
        "@endmessage",
        "@finish",
        "@endchat",
      ].join("\n"),
    },
  ]);
  assert.equal(forwardBundle.scenes["forward-reference"].passages.length, 1);

  const invalidReferences = [
    ["@effect contact add missing", /Unknown contact NPC 'missing'/],
    ["@effect chat start missing.chat", /Unknown chat 'missing\.chat'/],
    ["@effect reminder add missing.notice", /Unknown reminder 'missing\.notice'/],
    ["@effect timer start missing.timer", /unknown timer 'missing\.timer'/i],
    ["@effect unlock place missing", /unknown place 'missing'/i],
    ["@effect relocate nearest-place missing", /unknown place 'missing'/i],
    ["@effect teleport npc missing player", /unknown teleport NPC 'missing'/i],
    ["@effect relationship missing.friendship 1", /Unknown relationship NPC 'missing'/],
    ["@effect relationship kim.missing 1", /Unknown relationship meter 'kim\.missing'/],
    ["@effect skill missing 1", /unknown skill 'missing'/i],
    ["@effect stat missing 1", /unknown stat 'missing'/i],
    ["@effect grade missing 1", /unknown school subject 'missing'/i],
    ["@effect attendance missing 1", /unknown school subject 'missing'/i],
  ];
  for (const [directive, expected] of invalidReferences) {
    assert.throws(
      () => compileStorySources([{
        file: "invalid-effect.wg",
        source: `:: invalid-effect\n\n${directive}`,
      }]),
      expected,
      directive,
    );
  }
});

test("runtime effect arrays are preflighted before mutation", () => {
  const game = new Game({ seed: 901 });
  const initialMoney = game.player.money;
  assert.throws(
    () => applyWGEffects(game, [
      { op: "money", amount: 5 },
      { op: "stat", id: "energy", amount: Number.NaN },
    ]),
    /finite amount/,
  );
  assert.equal(game.player.money, initialMoney);

  assert.throws(
    () => validateWGEffectShape({ op: "money", amount: 1, amuont: 1 }),
    /unknown field 'amuont'/,
  );
});

test("story systems reject malformed effects before returning an outcome", () => {
  const systemId = "test.invalid-effect";
  registerWGStorySystem(systemId, {
    validateState() {},
    act() {
      return {
        state: {},
        effects: [{ op: "money", amount: 1, typo: true }],
      };
    },
  });
  assert.throws(
    () => actWGSystem(
      {},
      { system: { id: systemId, config: {} } },
      { instanceKey: "test", system: { state: {} } },
      {},
    ),
    /test\.invalid-effect.*unknown field 'typo'/,
  );
});

test("the removed @unlock alias fails while the canonical effect compiles", () => {
  assert.throws(
    () => compileStorySources([{
      file: "old-unlock.wg",
      source: ":: old-unlock\n\n@unlock place civil_office",
    }]),
    /Unexpected @unlock/,
  );
  const bundle = compileStorySources([{
    file: "new-unlock.wg",
    source: ":: new-unlock\n\n@effect unlock place civil_office",
  }]);
  assert.equal(
    bundle.scenes["new-unlock"].passages[0].body[0].effect.op,
    "unlock-place",
  );
});
