import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import {
  actWGSystem,
  registerWGStorySystem,
} from "../src/classes/game/scene/wg/storySystemRegistry.js";
import {
  applyWGEffects,
  WG_EFFECT_HANDLER_OPS,
} from "../src/classes/game/wg/effectRuntime.js";
import {
  validateWGEffectShape,
  WG_EFFECT_OPS,
} from "../src/shared/wg/effects/registry.js";
import { walkWGDefinitionEffects } from "../src/shared/wg/effects/traversal.js";
import { WG_EFFECT_PARSER_OPS } from "../tools/wg/compiler/effects/effectParsers.js";
import { compileStorySources } from "../tools/wg/compiler/storyCompiler.js";

function sorted(values) {
  return [...values].sort();
}

test("every WG effect has compiler syntax and a runtime handler", () => {
  assert.deepEqual(sorted(WG_EFFECT_PARSER_OPS), sorted(WG_EFFECT_OPS));
  assert.deepEqual(sorted(WG_EFFECT_HANDLER_OPS), sorted(WG_EFFECT_OPS));
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
    "@message hello",
    "Hello.",
    "@endmessage",
    "@finish",
    "@endchat",
    "",
    ":: registry.effects",
    "@onenter",
    "  @effect contact add kim",
    "  @effect chat start registry.chat",
    "  @effect set story.registry.value 1",
    "  @effect add story.registry.value 2",
    "  @effect flag registry_flag true",
    "  @effect daily-flag registry_daily true",
    "  @effect reminder add registry.notice",
    "  @effect timer start rent.weekly",
    "  @effect unlock place civil_office",
    "  @effect relocate nearest-place hospital",
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
  assert.deepEqual(sorted(scene.onEnter.map((effect) => effect.op)), sorted(WG_EFFECT_OPS));

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
      source: { file: "registry.wg", line: 24, column: 1 },
    },
  );
});

test("effect traversal covers every legal effect container exactly once", () => {
  const effect = (id) => ({ op: "flag", flag: id, value: true });
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
  walkWGDefinitionEffects(definition, (candidate) => visited.push(candidate.flag));
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
        '@choice begin "Begin" -> @exit',
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
        "@message hello",
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
