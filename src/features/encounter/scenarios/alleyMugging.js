import { selectNpcIntent } from "../ai.js";
import { getAvailableActionInstances } from "../availability.js";
import { createCombatContext, isEncounterIncapacitated } from "../combatants.js";
import {
  ALLEY_MUGGING_SCENARIO_ID,
  ENCOUNTER_PHASE,
  createAlleyMuggingState,
} from "../state.js";
import { selectMuggerPersonality } from "../personality.js";
import { resolveIncapacitatedTheft } from "../objectives/steal.js";

function resolveUnopposedEntry(context, reason) {
  const { state } = context;
  const events = [
    ...state.lastEvents,
    { type: "participant.unable-to-act", actorId: "player", reason },
    {
      type: "action.attempted",
      actorId: "mugger",
      targetId: "player",
      actionId: "search-money",
    },
  ];
  const outcome = resolveIncapacitatedTheft(context, events);

  state.phase = ENCOUNTER_PHASE.terminal;
  state.npcIntent = null;
  state.objective.stage = "complete";
  state.outcome = outcome;
  events.push({
    type: "encounter.ended",
    outcomeId: outcome.id,
    moneyLost: outcome.moneyLost,
  });
  state.lastEvents = events.slice(-24);
}

export const ALLEY_MUGGING_SCENARIO = Object.freeze({
  id: ALLEY_MUGGING_SCENARIO_ID,

  create({ game, instanceKey, config }) {
    const actor = game.currentStory?.actors?.[config.aggressor];
    if (!actor) {
      throw new Error(`Physical encounter: scene actor '${config.aggressor}' is unavailable`);
    }
    const theftAmount = Math.min(20, Math.max(0, Math.floor(game.player.money)));
    const personality = selectMuggerPersonality(game.seed, instanceKey);
    const state = createAlleyMuggingState({
      aggressorAlias: config.aggressor,
      theftAmount,
      personalityId: personality.id,
    });
    state.participants.mugger.commitmentBase = Math.min(
      75,
      50 + personality.commitmentBias + Math.round(Number(actor.stats?.resolve || 0) * 3),
    );
    const context = createCombatContext({ game, state, instanceKey });
    if (isEncounterIncapacitated(context, "player")) {
      resolveUnopposedEntry(context, "already-incapacitated");
      return state;
    }
    if (!getAvailableActionInstances(context, "player").length) {
      resolveUnopposedEntry(context, "no-legal-response");
      return state;
    }
    state.npcIntent = selectNpcIntent(context);
    return state;
  },
});
