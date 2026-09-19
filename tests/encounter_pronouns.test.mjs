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
  beatDownThreatProse,
  movementProseVariants,
  positionProseVariants,
} from "../src/features/encounter/proseData.js";
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
      sourcePartId: "hand_l",
      targetPartId: "lower_arm_l",
      pinSourcePartId: "knee_l",
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
      assert.doesNotMatch(rendered, /\d+ seconds\./, action.id);
      assert.doesNotMatch(rendered, new RegExp(`\\b${action.id}\\b`), action.id);
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
    [PronounSets.HE_HIM, { subject: "He", object: "him", dependent: "his", flees: "decides|breaks|abandons", demand: "demands", breaks: "breaks", surrender: "takes|pockets|releases", has: "has" }],
    [PronounSets.SHE_HER, { subject: "She", object: "her", dependent: "her", flees: "decides|breaks|abandons", demand: "demands", breaks: "breaks", surrender: "takes|pockets|releases", has: "has" }],
    [PronounSets.THEY_THEM, { subject: "They", object: "them", dependent: "their", flees: "decide|break|abandon", demand: "demand", breaks: "break", surrender: "take|pocket|release", has: "have" }],
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
      new RegExp(`^${expected.subject} (?:${expected.flees}) `),
    );

    state.outcome = { id: STEAL_MONEY_OUTCOME.playerRescued, moneyLost: 0 };
    assert.match(
      STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text,
      new RegExp(`${expected.subject} ${expected.breaks} off the attack`),
    );

    state.outcome = { id: STEAL_MONEY_OUTCOME.playerSurrendered, moneyLost: 20 };
    assert.match(
      STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text,
      new RegExp(`${expected.subject} (?:${expected.surrender}) `),
    );

    state.outcome = { id: STEAL_MONEY_OUTCOME.theftPlayerIncapacitated, moneyLost: 20 };
    assert.match(
      STEAL_MONEY_OBJECTIVE.renderTerminal(context)[0].text,
      new RegExp(`${expected.subject.toLowerCase()} ${expected.has} taken`),
    );
  }
});

test("beat-down threats conjugate every verb for plural pronouns", () => {
  const { state, context } = setup(PronounSets.THEY_THEM);

  state.objective.stage = "restrained";
  assert.equal(
    beatDownThreatProse(context),
    "They intend to hurt and humiliate you, but are still holding back.",
  );

  state.objective.stage = "escalated";
  assert.equal(
    beatDownThreatProse(context),
    "They have lost all restraint and intend to leave you unable to fight back.",
  );
});

test("embedded attacker pronouns stay lowercase while sentence-start pronouns are capitalized", () => {
  const { context } = setup(PronounSets.THEY_THEM);
  const variants = positionProseVariants(context, {
    actorId: "mugger",
    targetId: "player",
    actionId: "force-to-ground",
  }, "success");

  assert.equal(variants[0], "They drag you off balance and drive you onto your back.");
  assert.equal(variants[1], "Your footing gives way as they haul you to the ground.");
  assert.equal(variants[2], "They turn the wrist control into a takedown and follow you down.");
  assert.ok(variants.every((text) => !/\bas They\b/.test(text)));

  const checkedRetreat = movementProseVariants(context, {
    actorId: "mugger",
    targetId: "player",
    actionId: "create-distance",
  }, "failed.could-not-disengage");
  assert.equal(
    checkedRetreat[2],
    "The moment they pull away, your restraint drags them back.",
  );

  const escapedHold = movementProseVariants(context, {
    actorId: "mugger",
    targetId: "player",
    actionId: "create-distance",
  }, "success", { destination: "to arm's reach", brokeHold: true });
  assert.equal(
    escapedHold[2],
    "Breaking free, they force enough room to move to arm's reach.",
  );
});
