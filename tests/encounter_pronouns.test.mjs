import test from "node:test";
import assert from "node:assert/strict";

import { PronounSets } from "../src/characters/core/pronouns.js";
import { ENCOUNTER_ACTIONS } from "../src/features/encounter/actions/index.js";
import { actionLabel, getAvailableActionInstances } from "../src/features/encounter/availability.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  renderIntent,
  renderLastExchange,
  renderObjectivePressure,
} from "../src/features/encounter/prose.js";
import {
  STEAL_MONEY_OBJECTIVE,
  STEAL_MONEY_OUTCOME,
} from "../src/features/encounter/objectives/steal.js";
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
    [PronounSets.HE_HIM, { subject: "He", object: "him", dependent: "his", verb: "decides", demand: "demands", breaks: "breaks", takes: "takes", leaves: "leaves", has: "has" }],
    [PronounSets.SHE_HER, { subject: "She", object: "her", dependent: "her", verb: "decides", demand: "demands", breaks: "breaks", takes: "takes", leaves: "leaves", has: "has" }],
    [PronounSets.THEY_THEM, { subject: "They", object: "them", dependent: "their", verb: "decide", demand: "demand", breaks: "break", takes: "take", leaves: "leave", has: "have" }],
  ]) {
    const { state, context } = setup(pronouns);
    const labels = getAvailableActionInstances(context, "player")
      .map((instance) => actionLabel(context, instance));
    assert.ok(labels.includes(`Strike at ${expected.dependent} face`));
    assert.ok(labels.includes(`Shove ${expected.object} away`));

    const opening = renderLastExchange(context);
    assert.match(opening, new RegExp(`\\b${expected.subject.toLowerCase()} ${expected.demand} your money\\b`, "i"));
    assert.match(renderObjectivePressure(context), new RegExp(`^${expected.subject} still `));

    state.outcome = { id: STEAL_MONEY_OUTCOME.muggerFled, moneyLost: 0 };
    assert.match(
      STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text,
      new RegExp(`^${expected.subject} ${expected.verb} `),
    );

    state.outcome = { id: STEAL_MONEY_OUTCOME.playerRescued, moneyLost: 0 };
    assert.match(
      STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text,
      new RegExp(`${expected.subject} ${expected.breaks} off the attack`),
    );

    state.outcome = { id: STEAL_MONEY_OUTCOME.playerSurrendered, moneyLost: 20 };
    assert.match(
      STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text,
      new RegExp(`${expected.subject} ${expected.takes} it and ${expected.leaves}`),
    );

    state.outcome = { id: STEAL_MONEY_OUTCOME.theftPlayerIncapacitated, moneyLost: 20 };
    assert.match(
      STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text,
      new RegExp(`${expected.subject.toLowerCase()} ${expected.has} taken`),
    );
  }
});
