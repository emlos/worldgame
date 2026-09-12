import { selectNpcIntent } from "../ai.js";
import { createCombatContext } from "../combatants.js";
import {
  ALLEY_MUGGING_SCENARIO_ID,
  createAlleyMuggingState,
} from "../state.js";

export const ALLEY_MUGGING_SCENARIO = Object.freeze({
  id: ALLEY_MUGGING_SCENARIO_ID,

  create({ game, instanceKey, config }) {
    const actor = game.currentStory?.actors?.[config.aggressor];
    if (!actor) {
      throw new Error(`Physical encounter: scene actor '${config.aggressor}' is unavailable`);
    }
    const theftAmount = Math.min(20, Math.max(0, Math.floor(game.player.money)));
    const state = createAlleyMuggingState({
      aggressorAlias: config.aggressor,
      theftAmount,
    });
    state.participants.mugger.commitmentBase = Math.min(
      75,
      50 + Math.round(Number(actor.stats?.resolve || 0) * 3),
    );
    const context = createCombatContext({ game, state, instanceKey });
    state.npcIntent = selectNpcIntent(context);
    return state;
  },
});

