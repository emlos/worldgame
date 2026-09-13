import test from "node:test";
import assert from "node:assert/strict";

import { PronounSets } from "../src/characters/core/pronouns.js";
import { failAction } from "../src/features/encounter/actions/helpers.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import { renderLastExchange } from "../src/features/encounter/prose.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

function setup(pronouns = PronounSets.HE_HIM) {
  const game = gameAtStart({ seed: 1 });
  const state = startEncounter(game);
  game.currentStory.actors.mugger.pronouns = pronouns;
  const context = createCombatContext({ game, state, instanceKey: game.currentStory.instanceKey });
  return { state, context };
}

function failureText({ actorId, reason, actionId = "test-action", pronouns }) {
  const { state, context } = setup(pronouns);
  state.lastEvents = [{
    type: "action.failed",
    actorId,
    targetId: actorId === "player" ? "mugger" : "player",
    actionId,
    reason,
  }];
  return renderLastExchange(context);
}

const failureCases = [
  ["grip-missed", /wrist.*clear/i],
  ["hold-gone", /hold is already gone|loses the hold/i],
  ["partly-freed", /one arm free.*remaining grip/i],
  ["grip-held", /grip.*too secure/i],
  ["position-held", /footing/i],
  ["takedown-resisted", /balance/i],
  ["turn-resisted", /brace/i],
  ["pin-resisted", /arm.*pinned|pin .*arm/i],
  ["lost-balance", /footing/i],
  ["held-ground", /hold.*ground/i],
  ["could-not-disengage", /open a gap|checks your movement/i],
  ["kept-down", /getting .*feet|getting back to .*feet/i],
  ["turn-blocked", /hold stops/i],
  ["could-not-close", /distance/i],
  ["too-winded", /too winded/i],
  ["too-dazed", /daze/i],
  ["too-exhausted", /exhausted/i],
];

test("every action failure reason has specific player and NPC feedback", () => {
  for (const [reason, expected] of failureCases) {
    for (const actorId of ["player", "mugger"]) {
      const rendered = failureText({ actorId, reason });
      assert.match(rendered, expected, `${actorId} ${reason}`);
      assert.doesNotMatch(rendered, /cannot make it work/i, `${actorId} ${reason}`);
    }
  }
});

test("miss feedback describes the attempted attack for player and NPC", () => {
  for (const actionId of ["strike-face", "drive-body", "strike-holding-arm", "headbutt"]) {
    const playerText = failureText({ actorId: "player", reason: "missed", actionId });
    const npcText = failureText({ actorId: "mugger", reason: "missed", actionId });
    assert.doesNotMatch(playerText, /cannot make it work/i, actionId);
    assert.doesNotMatch(npcText, /cannot make it work/i, actionId);
    assert.notEqual(playerText, npcText, actionId);
  }
});

test("failure feedback preserves plural pronoun agreement", () => {
  const lostBalance = failureText({
    actorId: "mugger",
    reason: "lost-balance",
    pronouns: PronounSets.THEY_THEM,
  });
  const gripHeld = failureText({
    actorId: "mugger",
    reason: "grip-held",
    pronouns: PronounSets.THEY_THEM,
  });

  assert.match(lostBalance, /^They lose their footing/);
  assert.match(gripHeld, /too secure for them to wrench free/);
});

test("spoiled actions name the faster action's concrete consequence", () => {
  const { state, context } = setup();
  state.lastEvents = [{
    type: "action.spoiled",
    actorId: "player",
    actionId: "run",
    spoiledByActorId: "mugger",
    spoiledByActionId: "close-distance",
  }];
  assert.match(renderLastExchange(context), /closes the gap before you can break away/i);

  state.lastEvents = [{
    type: "action.spoiled",
    actorId: "mugger",
    actionId: "search-money",
    spoiledByActorId: "player",
    spoiledByActionId: "break-hold",
  }];
  assert.match(renderLastExchange(context), /You break his control before he can reach your money/);
});

test("failed rolls carry qualitative odds into player-facing prose", () => {
  const runtime = {
    events: [{
      type: "chance.rolled",
      actorId: "player",
      actionId: "shove-away",
      purpose: "contest",
      chance: 0.32,
      roll: 0.9,
      success: false,
    }],
  };
  failAction(runtime, {
    actorId: "player",
    targetId: "mugger",
    actionId: "shove-away",
  }, "held-ground");

  assert.deepEqual(runtime.events.at(-1), {
    type: "action.failed",
    actorId: "player",
    targetId: "mugger",
    actionId: "shove-away",
    reason: "held-ground",
    chance: 0.32,
    rollPurpose: "contest",
  });

  const { state, context } = setup();
  state.lastEvents = runtime.events;
  assert.match(renderLastExchange(context), /The odds were poor\. He absorbs the shove/i);
});
