import test from "node:test";
import assert from "node:assert/strict";

import { createCombatContext } from "../src/features/encounter/combatants.js";
import { renderLastExchange } from "../src/features/encounter/prose.js";
import { STEAL_MONEY_OBJECTIVE, STEAL_MONEY_OUTCOME } from "../src/features/encounter/objectives/steal.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

function setup(seed = 1) {
  const game = gameAtStart({ seed });
  const state = startEncounter(game);
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  return { game, state, context };
}

function strikeEvents() {
  return [
    { type: "action.attempted", actorId: "player", targetId: "mugger", actionId: "strike-face" },
    { type: "chance.rolled", actorId: "player", actionId: "strike-face", purpose: "contest", chance: 0.6, roll: 0.2, success: true },
    { type: "impact.landed", actorId: "player", targetId: "mugger", partId: "face", damage: 10, damageType: "blunt" },
    { type: "acute.applied", actorId: "mugger", id: "dazed", severity: 1 },
  ];
}

test("a variant beat combines an attempt and result without hiding secondary effects", () => {
  const { state, context } = setup(7);
  state.exchange = 1;
  state.participants.player.actionHistory = ["strike-face"];
  state.lastEvents = strikeEvents();

  const prose = renderLastExchange(context);
  assert.match(prose, /fist|strike/i);
  assert.match(prose, /face/i);
  assert.match(prose, /dazed/i);
  assert.doesNotMatch(prose, /strike toward.*The blow lands/is);
});

test("the initial hold, defense, movement, and takedown packs render complete beats", () => {
  const cases = [
    {
      actionId: "wrench-free",
      events: [
        { type: "hold.broken", targetId: "player", targetPartId: "lower_arm_l", kind: "wrist-grip" },
      ],
      expected: /wrench|twist|rip/i,
      duplicate: /twist hard.*wrist comes free/is,
    },
    {
      actionId: "cover-and-brace",
      events: [{ type: "defense.braced", actorId: "player" }],
      expected: /guard|feet|brace/i,
      duplicate: /cover up and brace.*ready for the impact/is,
    },
    {
      actionId: "create-distance",
      events: [{ type: "range.changed", from: "clinch", to: "reach" }],
      expected: /distance|room|reach|retreat/i,
      duplicate: /try to make room.*arm's reach/is,
    },
    {
      actionId: "force-to-ground",
      events: [
        { type: "pose.changed", actorId: "mugger", from: "standing", to: "supine" },
        { type: "pose.changed", actorId: "player", from: "standing", to: "kneeling" },
      ],
      expected: /ground|back|takedown/i,
      duplicate: /try to force.*goes onto/is,
    },
  ];

  for (const [index, entry] of cases.entries()) {
    const { state, context } = setup(20 + index);
    state.exchange = 2;
    state.participants.player.actionHistory = [entry.actionId];
    state.lastEvents = [
      { type: "action.attempted", actorId: "player", targetId: "mugger", actionId: entry.actionId },
      ...entry.events,
    ];
    const prose = renderLastExchange(context);
    assert.match(prose, entry.expected, entry.actionId);
    assert.doesNotMatch(prose, entry.duplicate, entry.actionId);
  }
});

test("prose choices are stable for one state and vary across seeds", () => {
  const outputs = new Set();
  for (let seed = 1; seed <= 30; seed += 1) {
    const { state, context } = setup(seed);
    state.exchange = 3;
    state.participants.mugger.actionHistory = ["grab-arm"];
    state.lastEvents = [
      { type: "action.attempted", actorId: "mugger", targetId: "player", actionId: "grab-arm" },
      { type: "action.failed", actorId: "mugger", targetId: "player", actionId: "grab-arm", reason: "grip-missed", chance: 0.6 },
    ];
    const first = renderLastExchange(context);
    assert.equal(renderLastExchange(context), first);
    outputs.add(first);
  }
  assert.ok(outputs.size >= 3);
});

test("repeated actions avoid repeating the immediately previous display form", () => {
  const { state, context } = setup(11);
  state.participants.player.actionHistory = ["strike-face"];
  state.lastEvents = strikeEvents();
  state.exchange = 4;
  const previous = renderLastExchange(context);

  state.participants.player.actionHistory = ["strike-face", "strike-face"];
  state.exchange = 5;
  const repeated = renderLastExchange(context);
  assert.notEqual(repeated, previous);
});

test("terminal escape and surrender outcomes use deterministic variant packs", () => {
  const escapeOutputs = new Set();
  const surrenderOutputs = new Set();
  for (let seed = 1; seed <= 30; seed += 1) {
    const { state, context } = setup(seed);
    state.exchange = 6;
    state.outcome = { id: STEAL_MONEY_OUTCOME.playerEscaped, moneyLost: 0 };
    const escaped = STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text;
    assert.equal(STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text, escaped);
    escapeOutputs.add(escaped);

    state.outcome = { id: STEAL_MONEY_OUTCOME.playerSurrendered, moneyLost: 20 };
    surrenderOutputs.add(STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text);
  }
  assert.ok(escapeOutputs.size >= 3);
  assert.ok(surrenderOutputs.size >= 3);
});
