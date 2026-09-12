import test from "node:test";
import assert from "node:assert/strict";

import { PronounSets } from "../src/characters/core/pronouns.js";
import { ENCOUNTER_ACTIONS } from "../src/features/encounter/actions/index.js";
import { actionLabel, getAvailableActionInstances } from "../src/features/encounter/availability.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  outcomeText,
  renderIntent,
  renderLastExchange,
  renderObjectivePressure,
} from "../src/features/encounter/prose.js";
import { ENCOUNTER_OUTCOME } from "../src/features/encounter/state.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

function setup(pronouns) {
  const game = gameAtStart({ seed: 1 });
  const state = startEncounter(game);
  game.currentStory.actors.mugger.pronouns = pronouns;
  const context = createCombatContext({ game, state, instanceKey: game.currentStory.instanceKey });
  return { game, state, context };
}

function sampleIntent(actionId) {
  return {
    actorId: "mugger",
    actionId,
    parameters: {
      targetId: "player",
      targetPartId: "lower_arm_l",
      holdId: "sample-hold",
      holdIds: ["sample-hold"],
    },
  };
}

test("every attacker intent uses generated pronouns with correct verb agreement", () => {
  for (const [pronouns, subject] of [
    [PronounSets.HE_HIM, "He"],
    [PronounSets.SHE_HER, "She"],
    [PronounSets.THEY_THEM, "They"],
  ]) {
    const { state, context } = setup(pronouns);
    for (const action of ENCOUNTER_ACTIONS) {
      state.npcIntent = sampleIntent(action.id);
      const rendered = renderIntent(context);
      assert.match(rendered, new RegExp(`^${subject} `), action.id);
      if (subject !== "They") assert.doesNotMatch(rendered, /\b(?:they|their|them|themself)\b/i, action.id);
      else assert.doesNotMatch(
        rendered,
        /^They (?:covers|draws|sets|tries|leans|shifts|plants|twists|lunges|turns|glances|reaches|wrenches|settles|adjusts|drops|keeps)\b/,
        action.id,
      );
    }
  }
});

test("player-facing labels, exchange prose, pressure, and outcomes use attacker pronouns", () => {
  for (const [pronouns, expected] of [
    [PronounSets.HE_HIM, { subject: "He", object: "him", dependent: "his", verb: "decides", demand: "demands" }],
    [PronounSets.SHE_HER, { subject: "She", object: "her", dependent: "her", verb: "decides", demand: "demands" }],
    [PronounSets.THEY_THEM, { subject: "They", object: "them", dependent: "their", verb: "decide", demand: "demand" }],
  ]) {
    const { state, context } = setup(pronouns);
    const labels = getAvailableActionInstances(context, "player")
      .map((instance) => actionLabel(context, instance));
    assert.ok(labels.includes(`Strike at ${expected.dependent} face`));
    assert.ok(labels.includes(`Shove ${expected.object} away`));

    const opening = renderLastExchange(context);
    assert.match(opening, new RegExp(`\\b${expected.subject.toLowerCase()} ${expected.demand} your money\\b`, "i"));
    assert.match(renderObjectivePressure(context), new RegExp(`^${expected.subject} still `));

    state.outcome = { id: ENCOUNTER_OUTCOME.muggerFled, moneyLost: 0 };
    assert.match(outcomeText(context), new RegExp(`^${expected.subject} ${expected.verb} `));
  }
});
