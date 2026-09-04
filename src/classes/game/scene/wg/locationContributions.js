import { WG_BUNDLE } from "../../../../generated/wg/scenes.js";
import { evaluateWGExpression } from "../../wg/expressionEvaluator.js";
import { createWGRuntimeContext } from "../../wg/runtimeContext.js";
import { materializeWGBody } from "./sceneMaterializer.js";

/** Live additions to the generated outdoor hub, never entered story frames. */
export function materializeWGLocationContributions(
  game,
  { contributions = WG_BUNDLE.locationContributions } = {},
) {
  const output = { content: [], sections: [] };
  if (!game.location || game.currentPlaceId !== null || game.currentStory) return output;

  const context = createWGRuntimeContext(game);
  const ordered = Object.values(contributions).sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  for (const contribution of ordered) {
    if (!(contribution.conditions || []).every((condition) =>
      Boolean(evaluateWGExpression(condition, context)),
    )) continue;

    const authored = materializeWGBody(contribution.body, context, {
      idPrefix: `location:${contribution.id}:`,
      choiceSectionHeading: "",
      gameSeed: game.seed,
      storyInstanceKey: [
        "location-contribution", contribution.id, game.location.id,
        game.storyRevision, game.now.toISOString(),
      ].join(":"),
    });
    output.content.push(...authored.content);
    output.sections.push(...authored.sections);
  }
  return output;
}
