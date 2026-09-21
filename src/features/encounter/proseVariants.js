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
  { avoidPreviousExchange = false, avoidRecentExchanges = 0 } = {},
) {
  if (!Array.isArray(variants) || variants.length === 0) return "";

  let index = variantIndex(context, key, variants.length);
  const recentCount = Math.max(
    avoidPreviousExchange ? 1 : 0,
    Math.max(0, Math.floor(Number(avoidRecentExchanges) || 0)),
  );
  if (recentCount > 0 && variants.length > 1 && context.state.exchange > 0) {
    const unavailable = new Set();
    const oldest = Math.max(0, context.state.exchange - recentCount);
    for (
      let exchange = context.state.exchange - 1;
      exchange >= oldest;
      exchange -= 1
    ) {
      unavailable.add(variantIndex(context, key, variants.length, exchange));
    }
    for (let offset = 0; offset < variants.length; offset += 1) {
      const candidate = (index + offset) % variants.length;
      if (!unavailable.has(candidate)) {
        index = candidate;
        break;
      }
    }
  }

  const variant = variants[index];
  return typeof variant === "function" ? variant() : variant;
}
