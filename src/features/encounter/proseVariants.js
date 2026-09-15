import { keyedRandom01 } from "../../shared/util/random.js";

const PROSE_VARIANT_VERSION = "encounter-prose-v1";

function variantIndex(context, key, count, exchange = context.state.exchange) {
  const roll = keyedRandom01(
    context.game.seed,
    [PROSE_VARIANT_VERSION, context.instanceKey, exchange, key].join(":"),
  );
  return Math.floor(roll * count);
}

/**
 * Pick display prose without consuming simulation RNG or changing saved state.
 * A given encounter exchange therefore keeps the same wording across rerenders
 * and save/load, while other encounters and exchanges can choose another form.
 */
export function pickProseVariant(
  context,
  key,
  variants,
  { avoidPreviousExchange = false } = {},
) {
  if (!Array.isArray(variants) || variants.length === 0) return "";

  let index = variantIndex(context, key, variants.length);
  if (avoidPreviousExchange && variants.length > 1 && context.state.exchange > 0) {
    const previous = variantIndex(context, key, variants.length, context.state.exchange - 1);
    if (index === previous) index = (index + 1) % variants.length;
  }

  const variant = variants[index];
  return typeof variant === "function" ? variant() : variant;
}
