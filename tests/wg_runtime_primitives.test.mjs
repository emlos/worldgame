import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/classes/game/game.js";
import { sendChatReply } from "../src/classes/game/chat/runtime.js";
import { buildChatThreadView } from "../src/classes/game/chat/view.js";
import { applyWGEffects } from "../src/classes/game/wg/effectRuntime.js";
import {
  enterWGScene,
  resolveActiveWGStory,
} from "../src/classes/game/scene/wg/storyRuntime.js";
import { materializeWGResponse } from "../src/classes/game/scene/wg/sceneMaterializer.js";
import {
  createWGDecisionSession,
  iterateSelectedWGNodes,
  iterateSelectedWGParts,
} from "../src/classes/game/wg/decisionRuntime.js";
import {
  captureWGTextBindings,
  renderWGSnapshottedParts,
} from "../src/classes/game/wg/textRuntime.js";
import { collectWGNodes } from "../src/shared/wg/tree.js";

const path = (...value) => ({ type: "path", value });
const paragraph = (value) => ({
  type: "paragraph",
  parts: [{ type: "text", value }],
});

test("the shared WG tree walker visits nested nodes and inline decisions", () => {
  const body = [
    {
      type: "if",
      runtimeId: 0,
      branches: [
        {
          test: path("story", "ready"),
          nodes: [
            {
              type: "paragraph",
              parts: [
                {
                  type: "inline-if",
                  runtimeId: 1,
                  branches: [{ test: path("story", "ready"), parts: [] }],
                  elseParts: [],
                },
              ],
            },
          ],
        },
      ],
      elseNodes: [],
    },
  ];

  assert.deepEqual(
    collectWGNodes(body).map((node) => node.type),
    ["if", "paragraph", "inline-if"],
  );
});

test("WG selection is lazy so earlier effects can influence later conditions", () => {
  const context = { story: { ready: false } };
  const decisions = {};
  const session = createWGDecisionSession({
    mode: "record",
    decisions,
    getContext: () => context,
  });
  const selected = iterateSelectedWGNodes([
    { type: "effect", effect: { op: "test" } },
    {
      type: "if",
      runtimeId: 0,
      branches: [{ test: path("story", "ready"), nodes: [paragraph("ready")] }],
      elseNodes: [paragraph("not ready")],
    },
  ], session);

  assert.equal(selected.next().value.type, "effect");
  context.story.ready = true;
  assert.equal(selected.next().value.parts[0].value, "ready");
  assert.deepEqual(decisions, { "if:0": 0 });
});

test("WG decisions and captured interpolation replay without live state", () => {
  const context = { npc: { kim: { name: "Kim", formal: true } } };
  const parts = [
    { type: "text", value: "Hello, " },
    {
      type: "inline-if",
      runtimeId: 0,
      branches: [
        {
          test: path("npc", "kim", "formal"),
          parts: [{ type: "interpolation", path: ["npc", "kim", "name"], filters: ["cap"] }],
        },
      ],
      elseParts: [{ type: "text", value: "stranger" }],
    },
  ];
  const decisions = {};
  const record = createWGDecisionSession({
    mode: "record",
    decisions,
    getContext: () => context,
  });
  const selected = [...iterateSelectedWGParts(parts, record)];
  const bindings = captureWGTextBindings(selected, context);

  context.npc.kim.name = "Changed";
  context.npc.kim.formal = false;
  const replay = createWGDecisionSession({ mode: "replay", decisions });
  assert.equal(
    renderWGSnapshottedParts([...iterateSelectedWGParts(parts, replay)], bindings),
    "Hello, Kim",
  );
});

test("presentation-only response conditionals do not require persisted node IDs", () => {
  const game = new Game({ seed: 9900 });
  const response = {
    paragraphs: [
      {
        type: "paragraph",
        parts: [
          {
            type: "inline-if",
            branches: [
              {
                test: { type: "literal", value: true },
                parts: [{ type: "text", value: "selected" }],
              },
            ],
            elseParts: [{ type: "text", value: "not selected" }],
          },
        ],
      },
    ],
  };

  assert.deepEqual(materializeWGResponse(game, response), ["selected"]);
});

test("random WG decisions record once and replay without a seed", () => {
  const node = {
    type: "random",
    runtimeId: 4,
    variants: [[paragraph("first")], [paragraph("second")]],
  };
  const decisions = {};
  const record = createWGDecisionSession({
    mode: "record",
    decisions,
    seed: 12345,
    instanceKey: "test-instance",
  });
  const selected = [...iterateSelectedWGNodes([node], record)];
  const replay = createWGDecisionSession({ mode: "replay", decisions });

  assert.equal([...iterateSelectedWGNodes([node], replay)][0], selected[0]);
  assert.deepEqual([...replay.usedKeys], ["random:4"]);
});

test("contact and chat WG effects use the Game facade and chat snapshots survive saves", () => {
  const game = new Game({
    seed: 9901,
    startDate: new Date("2026-09-04T12:00:00.000Z"),
  });
  applyWGEffects(game, [
    { op: "contact", action: "add", npcId: "kim" },
    { op: "chat", action: "start", id: "kim.rent" },
  ]);

  let view = buildChatThreadView(game, "kim");
  const reply = view.choices.find((choice) => choice.id === "polite");
  assert.ok(reply);
  sendChatReply(game, { ...view.replyToken, choiceId: reply.id });

  view = buildChatThreadView(game, "kim");
  assert.equal(view.messages[0].kind, "outgoing");
  assert.match(view.messages[0].text, /tenant from/);
  assert.equal(view.messages[1].text, "Hi. That doesn't sound right. Thanks for letting me know...");
  assert.equal(view.waiting, true);

  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.deepEqual(
    buildChatThreadView(restored, "kim").messages,
    view.messages,
  );
});

test("active WG passages persist one shared instance key", () => {
  const game = new Game({
    seed: 9902,
    startDate: new Date("2026-09-04T12:00:00.000Z"),
  });
  enterWGScene(game, "taylor.study.peek");
  resolveActiveWGStory(game);

  const key = game.currentStory.instanceKey;
  assert.match(key, /^scene:taylor\.study\.peek:/);
  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.equal(restored.currentStory.instanceKey, key);
});

test("system-backed WG scenes use the same frame-level instance key", () => {
  const game = new Game({
    seed: 9903,
    startDate: new Date("2026-09-04T12:00:00.000Z"),
  });
  enterWGScene(game, "school.english.event.surprise-quiz");
  resolveActiveWGStory(game);

  assert.match(game.currentStory.instanceKey, /^wg-system-v1:/);
  assert.equal(Object.hasOwn(game.currentStory.system, "instanceKey"), false);
  const restored = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.equal(restored.currentStory.instanceKey, game.currentStory.instanceKey);
  assert.deepEqual(restored.currentStory.system.state, game.currentStory.system.state);
});
