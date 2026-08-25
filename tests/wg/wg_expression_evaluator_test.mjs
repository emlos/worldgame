import { Game } from "../../src/classes/game/game.js";
import {
  evaluateWGExpression,
  WGExpressionError,
} from "../../src/classes/game/scene/wg/expressionEvaluator.js";
import { createWGRuntimeContext } from "../../src/classes/game/scene/wg/runtimeContext.js";
import { parseExpression } from "../../tools/wg/compiler/expressionParser.js";

const START = new Date("2026-08-24T08:00:00.000Z");
const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function evaluate(source, context = {}) {
  return evaluateWGExpression(parseExpression(source), context);
}

function captureError(callback) {
  try {
    callback();
    return null;
  } catch (error) {
    return error;
  }
}

const context = {
  story: { visits: 3, mood: "happy" },
  player: { energy: 20 },
};

check("literal arithmetic observes compiler precedence", evaluate("2 + 3 * 4") === 14);
check("paths resolve from the supplied runtime context", evaluate("story.visits", context) === 3);
check("missing paths resolve to undefined", evaluate("story.missing", context) === undefined);
check("ordered comparisons against missing state are false", evaluate("story.missing >= 1", context) === false);
check("unary negation evaluates numbers", evaluate("-(2 + 3)") === -5);
check("not and boolean operators return booleans", evaluate("not false and true") === true);
check("or short-circuits its unreachable operand", evaluate("true or 1 / 0 > 2") === true);
check("and short-circuits its unreachable operand", evaluate("false and 1 / 0 > 2") === false);
check("equality is strict", evaluate('1 == "1"') === false);
check("ordered number comparisons work", evaluate("story.visits >= 3", context) === true);
check("ordered string comparisons work", evaluate('story.mood > "calm"', context) === true);
check("in performs list membership", evaluate('story.mood in ["calm", "happy"]', context) === true);

const divisionError = captureError(() => evaluate("1 / 0"));
check("non-finite arithmetic is rejected", divisionError instanceof WGExpressionError);
const comparisonError = captureError(() => evaluate('1 < "2"'));
check("mixed ordered comparisons are rejected", comparisonError instanceof WGExpressionError);
const membershipError = captureError(() => evaluate('"x" in story.mood', context));
check("in requires a list", membershipError instanceof WGExpressionError);
const corruptError = captureError(() => evaluateWGExpression({ type: "call" }, context));
check("unknown or corrupted AST nodes are rejected", corruptError instanceof WGExpressionError);

const game = new Game({ seed: 710, startDate: START });
game.player.setStatBase("energy", 20);
game.story.taylor = { hurt: 1 };
game.setFlag("met-taylor");
const taylor = game.npcs.get("taylor");
taylor.setLocationAndPlace(game.currentLocationId, game.currentPlaceId);
game.player.setRelationship({ npcId: taylor.id, score: 0.6 });

const gameContext = createWGRuntimeContext(game);
check("the adapter exposes plain story data", gameContext.story.taylor.hurt === 1);
check("the adapter exposes evaluated player stats", gameContext.player.energy === 20);
check("the adapter exposes NPC pronouns", gameContext.npc.taylor.dependent === "her");
check("the adapter exposes player-to-NPC relationship score", gameContext.npc.taylor.relationship === 0.6);
check("the adapter exposes exact-position NPC presence", gameContext.npc.taylor.present === true);
check("the adapter exposes active story flags", gameContext.flags["met-taylor"] === true);

if (failures.length) {
  console.error("\nWG expression evaluator failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG expression evaluator tests passed.");
}
